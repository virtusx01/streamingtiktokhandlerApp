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
import { saveWaGroupMembers, getWaGroupMembers, getSetting, setSetting, recordAbsenMessage, isWithinAbsenPeriod, syncAllParticipantsWithWa, getRealParticipants } from './db';

const WA_STOP_WORDS = new Set([
    'min', 'admin', 'bang', 'kak', 'ya', 'dong', 'hadir', 'absen', 'om', 'bro', 'mas', 'gan', 
    'dan', 'ini', 'dulu', 'pak', 'gais', 'guys', 'halo', 'pagi', 'siang', 'sore', 'malam', 
    'virtus', 'onlyvirtus', 'giveaway', 'live', 'ikut', 'ikutan', 'nih', 'ok', 'oke', 'gas', 
    'siap', 'sudah', 'udah', 'terima', 'kasih', 'kakak', 'saya', 'ku', 'bisa', 'banget'
]);

/**
 * Validasi username TikTok:
 * - Hanya huruf kecil, angka, titik, underscore (a-z 0-9 . _)
 * - TIDAK boleh huruf besar
 * - TIDAK boleh spasi
 * - Panjang 2-32 karakter
 */
export function isValidTikTokUsername(tag: string): boolean {
    if (!tag || tag.length < 2 || tag.length > 32) return false;
    // Harus seluruhnya lowercase (tidak boleh ada huruf besar)
    if (tag !== tag.toLowerCase()) return false;
    // Hanya boleh a-z, 0-9, underscore, titik
    if (!/^[a-z0-9._]+$/.test(tag)) return false;
    return true;
}

/** Normalisasi tag: lowercase, strip @, trim spasi */
function normalizeTag(raw: string): string {
    return raw.replace(/^@/, '').trim().toLowerCase();
}

export function extractMemberTagFromMessage(messageBody: string, pushName?: string, knownUsernames: string[] = []): string {
    if (!messageBody) return '';
    const cleanBody = messageBody.trim();

    // 1. Explicit mention/tag with @ (contoh: "@ilvy0uv", "absen @ilvy0uv", "@ilvy0uv hadir")
    const atMatch = cleanBody.match(/@([a-zA-Z0-9._]{2,32})/);
    if (atMatch && atMatch[1]) {
        const norm = normalizeTag(atMatch[1]);
        if (!WA_STOP_WORDS.has(norm) && isValidTikTokUsername(norm)) return norm;
    }

    // 2. Explicit prefix seperti "tt: ilvy0uv", "tiktok: ilvy0uv", "username: ilvy0uv", "tag: ilvy0uv", "id: ilvy0uv"
    const prefixMatch = cleanBody.match(/(?:tt|tiktok|username|user|tag|akun|id|ig)\s*[:=\-]?\s*@?([a-zA-Z0-9._]{2,32})/i);
    if (prefixMatch && prefixMatch[1]) {
        const norm = normalizeTag(prefixMatch[1]);
        if (!WA_STOP_WORDS.has(norm) && isValidTikTokUsername(norm)) return norm;
    }

    // 3. Multi-line format (contoh di WhatsApp: baris 1 "hykeoony", baris 2 "absen" atau sebaliknya)
    const lines = cleanBody.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
        for (const line of lines) {
            const isAbsenLine = /(?:^|[^a-zA-Z0-9])(absen|hadir|ikutan)(?:$|[^a-zA-Z0-9])/i.test(line);
            if (!isAbsenLine) {
                const cleanWord = line.replace(/^[@~]/, '').trim();
                const norm = cleanWord.toLowerCase();
                if (/^[a-z0-9._]{2,32}$/.test(norm) && !WA_STOP_WORDS.has(norm) && isValidTikTokUsername(norm)) {
                    return norm;
                }
            }
        }
    }

    // 4. Pola: "absen <username>" atau "hadir <username>" (contoh: "absen ilvy0uv", "hadir ilvy0uv", "ABSEN ilvy0uv")
    const afterAbsenMatch = cleanBody.match(/(?:absen|hadir|ikutan)\s+[:=\-]?\s*@?([a-zA-Z0-9._]{2,32})/i);
    if (afterAbsenMatch && afterAbsenMatch[1]) {
        const norm = normalizeTag(afterAbsenMatch[1]);
        if (!WA_STOP_WORDS.has(norm) && isValidTikTokUsername(norm)) return norm;
    }

    // 5. Pola: "<username> absen" atau "<username> hadir" (contoh: "ilvy0uv absen", "ilvy0uv hadir")
    const beforeAbsenMatch = cleanBody.match(/@?([a-zA-Z0-9._]{2,32})\s+(?:absen|hadir)/i);
    if (beforeAbsenMatch && beforeAbsenMatch[1]) {
        const norm = normalizeTag(beforeAbsenMatch[1]);
        if (!WA_STOP_WORDS.has(norm) && isValidTikTokUsername(norm)) return norm;
    }

    // 6. Cek apakah pesan menyebutkan salah satu username peserta TikTok yang sudah terdaftar
    for (const u of knownUsernames) {
        if (u && u.length >= 3 && new RegExp('\\b' + u + '\\b', 'i').test(cleanBody)) {
            return u.toLowerCase();
        }
    }

    // 7. Jika seluruh pesan adalah satu kata username valid (bukan kata stop words & bukan angka panjang)
    const singleWord = cleanBody.replace(/^[@~]/, '').trim();
    if (/^[a-z0-9._]{2,32}$/i.test(singleWord)) {
        const norm = singleWord.toLowerCase();
        if (!WA_STOP_WORDS.has(norm) && !/^\d{7,}$/.test(norm) && isValidTikTokUsername(norm)) {
            return norm;
        }
    }

    return '';
}

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

                let targetGroup = getSetting('giveaway_target_wa_group', '');
                // Jika belum ada target group yang diset, otomatis jadikan grup ini sebagai target
                if (!targetGroup) {
                    targetGroup = groupJid;
                    setSetting('giveaway_target_wa_group', groupJid);
                } else if (groupJid !== targetGroup) {
                    return;
                }

                const senderJid = msg.key.participant || msg.key.remoteJid;
                let phone = '';
                if (senderJid.endsWith('@s.whatsapp.net')) {
                    phone = senderJid.replace('@s.whatsapp.net', '').split(':')[0];
                } else if (msg.key?.participantPn || msg.participantPn) {
                    phone = (msg.key?.participantPn || msg.participantPn).replace('@s.whatsapp.net', '').split(':')[0];
                } else {
                    phone = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];
                }
                const pushName = msg.pushName ? msg.pushName.replace(/^~/, '').trim() : '';

                // Extract memberTag dari message protobuf / contextInfo
                let memberTag = msg.memberTag || msg.message?.memberTag || msg.participantTag || '';
                if (typeof memberTag === 'string' && /^\d{10,}$/.test(memberTag.trim())) {
                    // Abaikan jika memberTag hanya berisi internal ID numeric WA
                    memberTag = '';
                }

                // Extract text body from message
                const messageBody = (
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    ''
                ).trim();

                // Dapatkan daftar username peserta yang sudah ada di database untuk pencocokan pintar
                const existingParticipants = getRealParticipants().map(p => p.username);

                // Ekstrak member tag dari isi chat (contoh: "absen @ilvy0uv", "ABSEN ilvy0uv", "hykeoony\nabsen", "tt: ilvy0uv")
                if (!memberTag) {
                    const extracted = extractMemberTagFromMessage(messageBody, pushName, existingParticipants);
                    if (extracted) {
                        memberTag = extracted;
                    }
                }

                // Jika masih belum ada, cek apakah sender sudah memiliki member_tag yang tersimpan di DB
                if (!memberTag) {
                    const existing = getWaGroupMembers(groupJid).find(m => 
                        m.jid === senderJid || (m.phone && phone && m.phone === phone)
                    );
                    if (existing && existing.member_tag && !/^\d{10,}$/.test(existing.member_tag)) {
                        memberTag = existing.member_tag;
                    }
                }

                // Jika masih belum ada, cek apakah pushName pengirim cocok dengan salah satu username peserta giveaway
                if (!memberTag && pushName) {
                    const cleanPush = pushName.replace(/^[@~]/, '').trim().toLowerCase();
                    const matchedP = existingParticipants.find(u => u.toLowerCase() === cleanPush);
                    if (matchedP) {
                        memberTag = matchedP;
                    }
                }

                // Deteksi kata ABSEN: fleksibel mendukung kata "absen", "ABSEN", "hadir", "HADIR", "!absen", "#absen", dsb.
                const isAbsen = /(?:^|[^a-zA-Z0-9])(absen|hadir|ikutan)(?:$|[^a-zA-Z0-9])/i.test(messageBody) || 
                                /^[!#/]absen/i.test(messageBody);
                const msgTimestamp = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();

                if (isAbsen && isWithinAbsenPeriod(msgTimestamp)) {
                    console.log(`[WA ABSEN] ✅ Diterima ABSEN dari "${pushName}" (${phone}) - Tag/Username: "${memberTag || pushName}" | Msg: "${messageBody}"`);
                    recordAbsenMessage(groupJid, senderJid, memberTag, pushName, phone);
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

            // Listen to WhatsApp Baileys group member tag updates (GROUP_MEMBER_LABEL_CHANGE / member-tag event)
            sock.ev.on('group.member-tag.update' as any, async (update: any) => {
                try {
                    if (!update || !update.label) return;
                    const targetGroup = getSetting('giveaway_target_wa_group', '');
                    const updateGroup = update.groupId || update.id;
                    if (targetGroup && updateGroup && updateGroup !== targetGroup) return;

                    const cleanLabel = (update.label || '').replace(/^@/, '').trim().toLowerCase();
                    if (!cleanLabel || /^\d{10,}$/.test(cleanLabel) || !isValidTikTokUsername(cleanLabel)) return;

                    const participant = update.participant || update.participantAlt;
                    if (!participant) return;

                    console.log(`[WA] 🏷️ Event group.member-tag.update diterima untuk ${participant}: "${cleanLabel}"`);

                    const phone = participant.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];
                    saveWaGroupMembers([{
                        group_jid: updateGroup || targetGroup,
                        jid: participant,
                        phone: phone && !/^\d{15,}$/.test(phone) ? phone : '',
                        member_tag: cleanLabel,
                        push_name: '',
                        role: 'member',
                    }]);
                } catch (e) {
                    console.warn('[WA] group.member-tag.update handler error:', e);
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

export async function getParticipatingGroups(forceRefresh = false): Promise<{ id: string; subject: string; size: number }[]> {
    let groupList: { id: string; subject: string; size: number }[] = [];

    if (waState.sock && waState.status === 'CONNECTED') {
        try {
            // Timeout 8 detik agar query socket WhatsApp tidak pernah membuat request hang
            const groupsPromise = waState.sock.groupFetchAllParticipating();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching groups')), 8000));
            const groups: any = await Promise.race([groupsPromise, timeoutPromise]);

            if (groups && typeof groups === 'object') {
                groupList = Object.values(groups).map((g: any) => ({
                    id: g.id,
                    subject: g.subject || 'Grup WhatsApp',
                    size: g.participants?.length || 0,
                }));
                if (groupList.length > 0) {
                    setSetting('wa_participating_groups', JSON.stringify(groupList));
                }
            }
        } catch (e) {
            console.warn('[WA] Socket groupFetchAllParticipating error or timeout:', e);
        }
    }

    // Fallback: muat daftar grup dari cache settings (mendukung format Array dan String JSON)
    if (groupList.length === 0) {
        try {
            const cached = getSetting('wa_participating_groups', []);
            if (Array.isArray(cached)) {
                groupList = cached;
            } else if (typeof cached === 'string' && cached.trim()) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed)) groupList = parsed;
            }
        } catch {}
    }

    const targetGroup = getSetting('giveaway_target_wa_group', '');
    const targetMembersCount = targetGroup ? getWaGroupMembers(targetGroup).length : 0;
    const targetGroupName = getSetting('giveaway_target_wa_group_name', 'Komunitas Valorant Mobile Anti Toxic - by Virtus');

    if (targetGroup) {
        const targetIdx = groupList.findIndex(g => g.id === targetGroup);
        if (targetIdx >= 0) {
            const [tGroup] = groupList.splice(targetIdx, 1);
            tGroup.size = Math.max(tGroup.size || 0, targetMembersCount);
            if (tGroup.subject && tGroup.subject !== 'Grup WhatsApp Komunitas Utama') {
                setSetting('giveaway_target_wa_group_name', tGroup.subject);
            }
            groupList.unshift(tGroup);
        } else {
            groupList.unshift({
                id: targetGroup,
                subject: targetGroupName,
                size: targetMembersCount || 68,
            });
        }
    }

    return groupList;
}

export async function syncGroupMembers(groupJid: string) {
    if (waState.sock && waState.status === 'CONNECTED') {
        try {
            // Gunakan timeout 8 detik agar tidak hang
            const metaPromise = waState.sock.groupMetadata(groupJid);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching groupMetadata')), 8000));
            const metadata: GroupMetadata = await Promise.race([metaPromise, timeoutPromise]) as GroupMetadata;

            if (metadata && metadata.participants) {
                const realParticipants = getRealParticipants();
                const membersToSave = metadata.participants.map((p: any) => {
                    const rawPhoneSource = p.phoneNumber || p.id || '';
                    const phone = rawPhoneSource ? rawPhoneSource.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0] : '';
                    let memberTag = p.memberTag || p.member_tag || p.tag || p.role_tag || '';
                    if (typeof memberTag === 'string' && /^\d{10,}$/.test(memberTag.trim())) {
                        memberTag = '';
                    }
                    const pushName = p.name || p.pushName || '';

                    // Jika memberTag kosong, coba cocokkan pushName dengan username peserta TikTok
                    if (!memberTag && pushName) {
                        const cleanPush = pushName.replace(/^@/, '').trim().toLowerCase();
                        const matched = realParticipants.find(u => u.username.toLowerCase() === cleanPush);
                        if (matched) {
                            memberTag = matched.username;
                        }
                    }

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

                // Update info grup di cache
                try {
                    setSetting('giveaway_target_wa_group_name', metadata.subject);
                    const cached = getSetting('wa_participating_groups', []);
                    const list: any[] = Array.isArray(cached) ? cached : (typeof cached === 'string' && cached ? JSON.parse(cached) : []);
                    const idx = list.findIndex((g: any) => g.id === groupJid);
                    if (idx >= 0) {
                        list[idx].subject = metadata.subject;
                        list[idx].size = membersToSave.length;
                    } else {
                        list.unshift({ id: groupJid, subject: metadata.subject, size: membersToSave.length });
                    }
                    setSetting('wa_participating_groups', JSON.stringify(list));
                } catch {}

                syncAllParticipantsWithWa();
                return { count: membersToSave.length, groupName: metadata.subject };
            }
        } catch (e) {
            console.warn('[WA] Socket syncGroupMembers error or timeout:', e);
        }
    }

    // Cloud / serverless fallback: re-sync all existing members with giveaway participants
    syncAllParticipantsWithWa();
    const existingMembers = getWaGroupMembers(groupJid);
    const cachedName = getSetting('giveaway_target_wa_group_name', 'Komunitas Valorant Mobile Anti Toxic - by Virtus');
    return {
        count: existingMembers.length,
        groupName: cachedName,
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
