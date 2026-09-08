import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    GroupMetadata,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { saveWaGroupMembers, getWaGroupMembers, getSetting, setSetting, recordAbsenMessage, isWithinAbsenPeriod, syncAllParticipantsWithWa } from './db';

function getSessionDir(): string {
    const localDir = path.join(process.cwd(), 'data', 'wa_session');
    try {
        if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
        }
        // Verify write access
        const testFile = path.join(localDir, '.write_test');
        fs.writeFileSync(testFile, '1');
        fs.unlinkSync(testFile);
        return localDir;
    } catch {
        const tmpDir = path.join(os.tmpdir(), 'wa_session');
        try {
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
        } catch {}
        return tmpDir;
    }
}

export type WAConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'SCAN_QR' | 'CONNECTED';

interface WAState {
    status: WAConnectionStatus;
    qrCodeUrl: string | null;
    qrRaw: string | null;
    phoneNumber: string | null;
    userName: string | null;
    lastError: string | null;
    sock: WASocket | null;
}

const globalForWA = global as unknown as {
    waState?: WAState;
    waInitPromise?: Promise<WASocket> | null;
    waSyncHeartbeat?: NodeJS.Timeout | null;
};

const waState: WAState = globalForWA.waState || {
    status: 'DISCONNECTED',
    qrCodeUrl: null,
    qrRaw: null,
    phoneNumber: null,
    userName: null,
    lastError: null,
    sock: null,
};

globalForWA.waState = waState;

const logger = pino({ level: 'silent' });

export function getWAStatus() {
    // 1. If currently connected in this local process
    if (waState.status === 'CONNECTED') {
        // Sync heartbeat to database so cloud/serverless views see active connection
        setSetting('wa_status', 'CONNECTED');
        if (waState.phoneNumber) setSetting('wa_phone', waState.phoneNumber);
        if (waState.userName) setSetting('wa_user_name', waState.userName);
        setSetting('wa_last_seen', String(Date.now()));

        return {
            status: waState.status,
            qrCodeUrl: waState.qrCodeUrl,
            phoneNumber: waState.phoneNumber,
            userName: waState.userName,
            lastError: waState.lastError,
        };
    }

    if (waState.status === 'SCAN_QR' && waState.qrCodeUrl) {
        return {
            status: waState.status,
            qrCodeUrl: waState.qrCodeUrl,
            phoneNumber: waState.phoneNumber,
            userName: waState.userName,
            lastError: waState.lastError,
        };
    }

    // 2. Fallback to Supabase / synced settings (e.g. if running in cloud / Netlify)
    const syncedStatus = getSetting('wa_status', '');
    const syncedPhone = getSetting('wa_phone', '');
    const syncedUser = getSetting('wa_user_name', '');

    if (syncedStatus === 'CONNECTED' && syncedPhone) {
        return {
            status: 'CONNECTED' as WAConnectionStatus,
            qrCodeUrl: null,
            phoneNumber: syncedPhone,
            userName: syncedUser || 'WhatsApp Bot',
            lastError: null,
        };
    }

    return {
        status: waState.status,
        qrCodeUrl: waState.qrCodeUrl,
        phoneNumber: waState.phoneNumber,
        userName: waState.userName,
        lastError: waState.lastError,
    };
}

export async function initWhatsApp(forceReconnect = false): Promise<WASocket> {
    if (waState.sock && !forceReconnect && waState.status === 'CONNECTED') {
        return waState.sock;
    }

    if (globalForWA.waInitPromise && !forceReconnect) {
        return globalForWA.waInitPromise;
    }

    const sessionDir = getSessionDir();

    globalForWA.waInitPromise = (async () => {
        try {
            waState.status = 'CONNECTING';
            waState.lastError = null;

            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version } = await fetchLatestBaileysVersion();

            const sock = makeWASocket({
                version,
                logger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                generateHighQualityLinkPreview: false,
                browser: ['TiktokScrcpy Giveaway', 'Chrome', '1.0.0'],
                syncFullHistory: false,
            });

            waState.sock = sock;

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    try {
                        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
                        waState.qrCodeUrl = qrDataUrl;
                        waState.qrRaw = qr;
                        waState.status = 'SCAN_QR';
                    } catch (e: any) {
                        console.error('[WA] Error generating QR code:', e);
                    }
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    console.log(`[WA] Connection closed, reason: ${statusCode}, shouldReconnect: ${shouldReconnect}`);
                    
                    waState.status = 'DISCONNECTED';
                    waState.qrCodeUrl = null;
                    waState.qrRaw = null;
                    waState.sock = null;
                    globalForWA.waInitPromise = null;

                    if (statusCode === DisconnectReason.loggedOut) {
                        try {
                            fs.rmSync(sessionDir, { recursive: true, force: true });
                        } catch {}
                        setSetting('wa_status', 'DISCONNECTED');
                        setSetting('wa_phone', '');
                        setSetting('wa_user_name', '');
                        setSetting('wa_participating_groups', '[]');
                    } else if (shouldReconnect) {
                        setTimeout(() => initWhatsApp(true), 5000);
                    }
                } else if (connection === 'open') {
                    console.log('[WA] Connected successfully!');
                    waState.status = 'CONNECTED';
                    waState.qrCodeUrl = null;
                    waState.qrRaw = null;
                    waState.phoneNumber = sock.user?.id ? sock.user.id.split(':')[0] : null;
                    waState.userName = sock.user?.name || null;

                    // Sync to cloud / settings table
                    setSetting('wa_status', 'CONNECTED');
                    if (waState.phoneNumber) setSetting('wa_phone', waState.phoneNumber);
                    if (waState.userName) setSetting('wa_user_name', waState.userName);
                    setSetting('wa_last_seen', String(Date.now()));

                    // Automatically fetch and sync participating groups to cloud
                    setTimeout(async () => {
                        try {
                            const groups = await sock.groupFetchAllParticipating();
                            const groupList = Object.values(groups).map((g: GroupMetadata) => ({
                                id: g.id,
                                subject: g.subject,
                                size: g.participants?.length || 0,
                            }));
                            setSetting('wa_participating_groups', JSON.stringify(groupList));
                        } catch (e) {
                            console.warn('[WA] Could not fetch participating groups at startup:', e);
                        }
                        syncSelectedGroupMembers().catch(e => console.error('[WA] Auto sync error:', e));
                    }, 3000);
                }
            });

            // Helper to process any WhatsApp message (both realtime upsert and history sync)
            const processWaMessage = (msg: any) => {
                if (!msg.key?.remoteJid?.endsWith('@g.us')) return;
                const groupJid = msg.key.remoteJid;

                const targetGroup = getSetting('giveaway_target_wa_group', '');
                if (targetGroup && groupJid !== targetGroup) return;

                const senderJid = msg.key.participant || msg.key.remoteJid;
                const phone = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];
                const pushName = msg.pushName || '';

                // Extract memberTag from message if present in protobuf or contextInfo
                let memberTag = msg.memberTag || msg.message?.memberTag || msg.participantTag || '';

                // Extract text body from message
                const messageBody = (
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    ''
                ).trim();

                // Periksa jika user mengetik username / tag di chat (contoh: "absen @ilvy0uv" atau "@ilvy0uv absen")
                if (!memberTag) {
                    const tagMatch = messageBody.match(/@([a-zA-Z0-9._]+)/);
                    if (tagMatch) {
                        memberTag = tagMatch[1];
                    }
                }

                const isAbsen = /\babsen\b/i.test(messageBody);
                const msgTimestamp = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();

                if (isAbsen && isWithinAbsenPeriod(msgTimestamp)) {
                    console.log(`[WA ABSEN] ✅ Diterima/Sinkron ABSEN dari ${pushName} (${phone}) - Tag: "${memberTag}"`);
                    recordAbsenMessage(groupJid, senderJid, memberTag, pushName);
                } else if (memberTag) {
                    saveWaGroupMembers([{
                        group_jid: groupJid,
                        jid: senderJid,
                        phone,
                        member_tag: memberTag,
                        push_name: pushName,
                        role: 'member',
                    }]);
                }
            };

            // Listen to history sync (when WhatsApp connects / syncs recent chats)
            sock.ev.on('messaging-history.set', async (history) => {
                try {
                    if (history.messages && history.messages.length > 0) {
                        console.log(`[WA] History sync diterima: ${history.messages.length} pesan. Memeriksa pesan ABSEN...`);
                        for (const msg of history.messages) {
                            processWaMessage(msg);
                        }
                    }
                } catch (e) {
                    console.error('[WA] messaging-history.set handler error:', e);
                }
            });

            // Listen to messages for realtime member tag detection & ABSEN keyword
            sock.ev.on('messages.upsert', async (m) => {
                try {
                    for (const msg of m.messages) {
                        processWaMessage(msg);
                    }
                } catch (e) {
                    console.error('[WA] messages.upsert handler error:', e);
                }
            });

            return sock;
        } catch (err: any) {
            waState.status = 'DISCONNECTED';
            waState.lastError = err.message || 'Failed to initialize WhatsApp';
            globalForWA.waInitPromise = null;
            throw err;
        }
    })();

    return globalForWA.waInitPromise;
}

export async function disconnectWhatsApp() {
    try {
        if (waState.sock) {
            await waState.sock.logout();
        }
    } catch {}
    try {
        const sessionDir = getSessionDir();
        fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {}
    waState.sock = null;
    waState.status = 'DISCONNECTED';
    waState.qrCodeUrl = null;
    waState.phoneNumber = null;
    waState.userName = null;
    globalForWA.waInitPromise = null;

    setSetting('wa_status', 'DISCONNECTED');
    setSetting('wa_phone', '');
    setSetting('wa_user_name', '');
    setSetting('wa_participating_groups', '[]');
}

export async function getParticipatingGroups(): Promise<{ id: string; subject: string; size: number }[]> {
    if (waState.sock && waState.status === 'CONNECTED') {
        try {
            const groups = await waState.sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map((g: GroupMetadata) => ({
                id: g.id,
                subject: g.subject,
                size: g.participants?.length || 0,
            }));
            setSetting('wa_participating_groups', JSON.stringify(groupList));
            return groupList;
        } catch (e) {
            console.error('[WA] Error fetching participating groups from socket:', e);
        }
    }

    // Fallback: load cached groups from Supabase settings
    try {
        const cached = getSetting('wa_participating_groups', '');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch {}

    // Fallback 2: if target group exists, construct a placeholder item so user can select/see it
    const targetGroup = getSetting('giveaway_target_wa_group', '');
    if (targetGroup) {
        return [{ id: targetGroup, subject: 'Grup WhatsApp Komunitas Utama', size: 0 }];
    }

    return [];
}

export async function syncGroupMembers(groupJid: string) {
    // If local socket is active, fetch live participants from WhatsApp server
    if (waState.sock && waState.status === 'CONNECTED') {
        const metadata: GroupMetadata = await waState.sock.groupMetadata(groupJid);
        if (!metadata || !metadata.participants) {
            return { count: 0 };
        }

        const membersToSave = metadata.participants.map((p: any) => {
            const phone = p.id ? p.id.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0] : '';
            const memberTag = p.memberTag || p.member_tag || p.tag || p.role_tag || '';
            const pushName = p.name || p.pushName || '';
            const role = p.admin ? (p.admin === 'superadmin' ? 'creator' : 'admin') : 'member';

            return {
                group_jid: groupJid,
                jid: p.id,
                phone,
                member_tag: memberTag,
                push_name: pushName,
                role,
            };
        });

        saveWaGroupMembers(membersToSave);
        return { count: membersToSave.length, groupName: metadata.subject };
    }

    // Cloud / serverless fallback: re-sync all existing members with giveaway participants
    syncAllParticipantsWithWa();
    const existingMembers = getWaGroupMembers(groupJid);
    return {
        count: existingMembers.length,
        groupName: 'Grup WhatsApp Komunitas',
    };
}

export async function syncSelectedGroupMembers() {
    const targetGroup = getSetting('giveaway_target_wa_group', '');
    if (!targetGroup) return;
    try {
        await syncGroupMembers(targetGroup);
    } catch (e) {
        console.error('[WA] Failed to sync target group members:', e);
    }
}
