import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from './supabase';

export interface GiveawayParticipant {
    username: string;
    nickname: string;
    profile_picture: string | null;
    has_followed: number;
    has_liked: number;
    has_shared: number;
    has_commented: number;
    has_wa_group?: number;
    wa_member_tag?: string | null;
    wa_phone?: string | null;
    is_eligible: number;
    is_tester: number;
    registered_at: string;
    last_updated: string;
}

export interface WaMemberRecord {
    group_jid: string;
    jid: string;
    phone: string;
    member_tag: string;
    push_name: string;
    role?: string;
    has_absen?: number;
    absen_at?: string | null;
    last_seen?: string;
}

const memorySettings: Record<string, string> = {
  tiktokUsername: '"@onlyvirtus"',
  autoStartListener: 'true',
  triggerRewardsEnabled: 'true',
  adbMode: '"usb"',
  adbIP: '""',
  adbPort: '"5555"',
  giveaway_wa_mandatory: 'false',
  giveaway_target_wa_group: '""',
  widgetConfig: JSON.stringify({
    elements: [],
    ttsEnabled: true,
    likeThreshold: 100,
    milestoneMode: 'global'
  }),
  commentConfig: JSON.stringify({
    theme: 'modern',
    borderRadius: 24,
    maxComments: 15,
    position: { x: 0, y: 0 }
  })
};

const memoryRewards: Record<string, any> = {};
const memoryRewardPresets: Record<string, { data: string; created_at: string }> = {};
const memoryDetectedGifts = new Map<string, { name: string; count: number; last_seen: string }>();
const memoryUserLikes = new Map<string, any>();
const memoryParticipants = new Map<string, GiveawayParticipant>();
const memoryWaMembers = new Map<string, WaMemberRecord>();

// Background sync from Supabase into memory
async function syncFromSupabase() {
  try {
    const { data } = await supabaseAdmin.from('settings').select('*');
    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        if (row && row.key) memorySettings[row.key] = row.value;
      });
    }
  } catch {}

  try {
    const { data } = await supabaseAdmin.from('rewards').select('*');
    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        if (row && row.name) {
          try {
            memoryRewards[row.name] = { actions: JSON.parse(row.actions) };
          } catch {
            memoryRewards[row.name] = { actions: [] };
          }
        }
      });
    }
  } catch {}

  try {
    const { data } = await supabaseAdmin.from('giveaway_participants').select('*');
    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        if (row && row.username) memoryParticipants.set(row.username, row);
      });
    }
  } catch {}

  try {
    const { data } = await supabaseAdmin.from('wa_group_members').select('*');
    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        if (row && row.group_jid && row.jid) {
          memoryWaMembers.set(`${row.group_jid}_${row.jid}`, row);
        }
      });
    }
  } catch {}

  try {
    const { data } = await supabaseAdmin.from('detected_gifts').select('*');
    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        if (row && row.name) {
          memoryDetectedGifts.set(row.name, {
            name: row.name,
            count: Number(row.count) || 1,
            last_seen: row.last_seen || new Date().toISOString()
          });
        }
      });
    }
  } catch {}
}

export { syncFromSupabase };
syncFromSupabase();
// Auto-sync dimatikan — hanya sync manual via tombol sinkronisasi


export async function safeSupabaseUpsert(table: string, payload: any, onConflict?: string) {
  try {
    const defaultConflict: Record<string, string> = {
      wa_group_members: 'group_jid,jid',
      giveaway_participants: 'username',
      settings: 'key',
      rewards: 'name',
      detected_gifts: 'name',
    };
    const conflictField = onConflict || defaultConflict[table];
    const options = conflictField ? { onConflict: conflictField } : undefined;
    const { error } = await supabaseAdmin.from(table).upsert(payload, options);
    if (error) {
      console.warn(`[Supabase UPSERT ${table} ERROR]:`, error.message || error);
    }
  } catch (err: any) {
    console.warn(`[Supabase UPSERT ${table} EXCEPTION]:`, err?.message || err);
  }
}

export async function safeSupabaseDelete(table: string, column: string, value: any) {
  try {
    const { error } = await supabaseAdmin.from(table).delete().eq(column, value);
    if (error) {
      console.warn(`[Supabase DELETE ${table} ERROR]:`, error.message || error);
    }
  } catch (err: any) {
    console.warn(`[Supabase DELETE ${table} EXCEPTION]:`, err?.message || err);
  }
}

let db: any = null;

try {
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(process.cwd(), 'data', 'app.db');

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {}
  }

  db = new Database(DB_PATH);

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS rewards (
      name TEXT PRIMARY KEY,
      actions TEXT
    );

    CREATE TABLE IF NOT EXISTS reward_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS detected_gifts (
      name TEXT PRIMARY KEY,
      count INTEGER DEFAULT 1,
      last_seen TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_likes (
      username TEXT PRIMARY KEY,
      nickname TEXT,
      total_likes INTEGER DEFAULT 0,
      last_milestone INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS giveaway_participants (
      username TEXT PRIMARY KEY,
      nickname TEXT,
      profile_picture TEXT,
      has_followed INTEGER DEFAULT 0,
      has_liked INTEGER DEFAULT 0,
      has_shared INTEGER DEFAULT 0,
      has_commented INTEGER DEFAULT 0,
      has_wa_group INTEGER DEFAULT 0,
      wa_member_tag TEXT,
      wa_phone TEXT,
      is_eligible INTEGER DEFAULT 0,
      is_tester INTEGER DEFAULT 0,
      registered_at TEXT DEFAULT (datetime('now')),
      last_updated TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wa_group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      jid TEXT NOT NULL,
      phone TEXT,
      member_tag TEXT,
      push_name TEXT,
      role TEXT,
      has_absen INTEGER DEFAULT 0,
      absen_at TEXT,
      last_seen TEXT DEFAULT (datetime('now')),
      UNIQUE(group_jid, jid)
    );
  `);

  try {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('lastMilestonePerformed', '0')
      ON CONFLICT(key) DO NOTHING
    `).run();
  } catch {}

  try { db.exec(`ALTER TABLE giveaway_participants ADD COLUMN is_tester INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE giveaway_participants ADD COLUMN has_liked INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE giveaway_participants ADD COLUMN has_wa_group INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE giveaway_participants ADD COLUMN wa_member_tag TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE giveaway_participants ADD COLUMN wa_phone TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE wa_group_members ADD COLUMN has_absen INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE wa_group_members ADD COLUMN absen_at TEXT`); } catch (_) {}
} catch (e: any) {
  console.warn('[DB] SQLite is unavailable or read-only (cloud/serverless environment). Operating via Memory & Supabase:', e?.message || e);
  db = null;
}

export default db;

export function getSetting(key: string, defaultValue: any = null) {
  // 1. Supabase / Memory cache (primary)
  if (memorySettings[key] !== undefined) {
    try {
      return JSON.parse(memorySettings[key]);
    } catch {
      return memorySettings[key];
    }
  }

  // 2. Fallback SQLite
  if (db) {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      if (row && row.value !== undefined) {
        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      }
    } catch {}
  }

  return defaultValue;
}

export function setSetting(key: string, value: any) {
  const valStr = typeof value === 'string' ? value : JSON.stringify(value);
  memorySettings[key] = valStr;

  if (db) {
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, valStr);
    } catch {}
  }

  // Asynchronously synchronize to Supabase
  safeSupabaseUpsert('settings', { key, value: valStr });
}

export function getRewards() {
  const rewards: Record<string, any> = { ...memoryRewards };
  if (db) {
    try {
      const rows = db.prepare('SELECT * FROM rewards').all() as { name: string, actions: string }[];
      rows.forEach(row => {
        try {
          const parsed = JSON.parse(row.actions);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.type) {
            rewards[row.name] = { actions: [parsed] };
          } else if (Array.isArray(parsed)) {
            rewards[row.name] = { actions: parsed };
          } else {
            rewards[row.name] = { actions: [] };
          }
        } catch (e) {
          rewards[row.name] = { actions: [] };
        }
      });
    } catch {}
  }
  return rewards;
}

export function setReward(name: string, actions: any) {
  const actionsArray = Array.isArray(actions) ? actions : (actions?.actions || []);
  memoryRewards[name] = { actions: actionsArray };
  if (db) {
    try {
      db.prepare('INSERT OR REPLACE INTO rewards (name, actions) VALUES (?, ?)').run(name, JSON.stringify(actionsArray));
    } catch {}
  }
  safeSupabaseUpsert('rewards', { name, actions: JSON.stringify(actionsArray) });
}

export function renameReward(oldName: string, newName: string) {
  if (memoryRewards[oldName]) {
    memoryRewards[newName] = memoryRewards[oldName];
    delete memoryRewards[oldName];
  }
  if (db) {
    try {
      db.prepare('UPDATE rewards SET name = ? WHERE name = ?').run(newName, oldName);
    } catch {}
  }
  (async () => {
    try {
      await supabaseAdmin.from('rewards').delete().eq('name', oldName);
      await supabaseAdmin.from('rewards').upsert({ name: newName, actions: JSON.stringify(memoryRewards[newName]?.actions || []) });
    } catch {}
  })();
}

export function deleteAllRewards() {
  for (const k in memoryRewards) delete memoryRewards[k];
  if (db) {
    try {
      db.prepare('DELETE FROM rewards').run();
    } catch {}
  }
  (async () => {
    try {
      await supabaseAdmin.from('rewards').delete().neq('name', '');
    } catch {}
  })();
}

// ==========================================
// REWARD PRESETS
// ==========================================
export function getRewardPresets() {
  if (db) {
    try {
      return db.prepare('SELECT id, name, created_at FROM reward_presets ORDER BY created_at DESC').all() as { id: number, name: string, created_at: string }[];
    } catch {}
  }
  return Object.entries(memoryRewardPresets).map(([name, val], id) => ({
    id: id + 1,
    name,
    created_at: val.created_at,
  }));
}

export function saveRewardPreset(name: string, rewards: Record<string, any>) {
  const now = new Date().toISOString();
  memoryRewardPresets[name] = { data: JSON.stringify(rewards), created_at: now };
  if (db) {
    try {
      db.prepare('INSERT OR REPLACE INTO reward_presets (name, data) VALUES (?, ?)').run(name, JSON.stringify(rewards));
    } catch {}
  }
}

export function loadRewardPreset(name: string): Record<string, any> | null {
  if (db) {
    try {
      const row = db.prepare('SELECT data FROM reward_presets WHERE name = ?').get(name) as { data: string } | undefined;
      if (row) {
        return JSON.parse(row.data);
      }
    } catch {}
  }
  if (memoryRewardPresets[name]) {
    try {
      return JSON.parse(memoryRewardPresets[name].data);
    } catch {}
  }
  return null;
}

export function deleteRewardPreset(name: string) {
  delete memoryRewardPresets[name];
  if (db) {
    try {
      db.prepare('DELETE FROM reward_presets WHERE name = ?').run(name);
    } catch {}
  }
}

export function renameRewardPreset(oldName: string, newName: string) {
  if (memoryRewardPresets[oldName]) {
    memoryRewardPresets[newName] = memoryRewardPresets[oldName];
    delete memoryRewardPresets[oldName];
  }
  if (db) {
    try {
      db.prepare('UPDATE reward_presets SET name = ? WHERE name = ?').run(newName, oldName);
    } catch {}
  }
}

// ==========================================
// DETECTED GIFTS
// ==========================================
export function recordDetectedGift(name: string) {
  const existing = memoryDetectedGifts.get(name);
  const count = (existing?.count || 0) + 1;
  const last_seen = new Date().toISOString();
  memoryDetectedGifts.set(name, { name, count, last_seen });

  if (db) {
    try {
      db.prepare(`
        INSERT INTO detected_gifts (name, count, last_seen) VALUES (?, 1, datetime('now'))
        ON CONFLICT(name) DO UPDATE SET count = count + 1, last_seen = datetime('now')
      `).run(name);
    } catch {}
  }

  safeSupabaseUpsert('detected_gifts', { name, count, last_seen });
}

export const addDetectedGift = recordDetectedGift;

export function getDetectedGifts() {
  if (db) {
    try {
      return db.prepare('SELECT name, count, last_seen FROM detected_gifts ORDER BY count DESC').all() as { name: string, count: number, last_seen: string }[];
    } catch {}
  }
  return Array.from(memoryDetectedGifts.values()).sort((a, b) => b.count - a.count);
}

// ==========================================
// LIKE MILESTONES & USER TRACKING
// ==========================================
export function resetLikeSession() {
  memoryUserLikes.clear();
  setSetting('lastMilestonePerformed', '0');
  if (db) {
    try {
      db.prepare('DELETE FROM user_likes').run();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('lastMilestonePerformed', '0')").run();
    } catch {}
  }
}

export function getUserLikes(username: string) {
  if (db) {
    try {
      return db.prepare('SELECT * FROM user_likes WHERE username = ?').get(username) as { 
        username: string, 
        nickname: string, 
        total_likes: number, 
        last_milestone: number 
      } | undefined;
    } catch {}
  }
  return memoryUserLikes.get(username);
}

export function updateUserLikes(username: string, nickname: string, totalLikes: number, lastMilestone?: number) {
  const current = memoryUserLikes.get(username) || { total_likes: 0, last_milestone: 0 };
  const updated = {
    username,
    nickname,
    total_likes: Math.max(current.total_likes, totalLikes),
    last_milestone: lastMilestone !== undefined ? lastMilestone : current.last_milestone,
    last_updated: new Date().toISOString()
  };
  memoryUserLikes.set(username, updated);

  if (db) {
    try {
      if (lastMilestone !== undefined) {
        db.prepare(`
          INSERT INTO user_likes (username, nickname, total_likes, last_milestone, last_updated) 
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(username) DO UPDATE SET 
            nickname = excluded.nickname,
            total_likes = MAX(total_likes, excluded.total_likes),
            last_milestone = excluded.last_milestone,
            last_updated = datetime('now')
        `).run(username, nickname, totalLikes, lastMilestone);
      } else {
        db.prepare(`
          INSERT INTO user_likes (username, nickname, total_likes, last_updated) 
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(username) DO UPDATE SET 
            nickname = excluded.nickname,
            total_likes = MAX(total_likes, excluded.total_likes),
            last_updated = datetime('now')
        `).run(username, nickname, totalLikes);
      }
    } catch {}
  }
}

// ==========================================
// GIVEAWAY SETTINGS & HELPERS
// ==========================================
export function isWaRequirementMandatory(): boolean {
  return !!getSetting('giveaway_wa_mandatory', false);
}

export function setWaRequirementMandatory(mandatory: boolean) {
  setSetting('giveaway_wa_mandatory', mandatory);
  recomputeAllEligibility();
}

export function getTargetWaGroup(): string {
  return getSetting('giveaway_target_wa_group', '');
}

export function setTargetWaGroup(groupJid: string) {
  setSetting('giveaway_target_wa_group', groupJid);
}

export function isWithinAbsenPeriod(date: Date = new Date()): boolean {
  const windowEnabled = getSetting('giveaway_absen_window_enabled', false);
  if (!windowEnabled) {
    // Jika window tidak diaktifkan, selalu izinkan deteksi ABSEN!
    return true;
  }
  try {
    const startStr = getSetting('giveaway_absen_start', '2026-09-06T00:00:00+07:00');
    const endStr   = getSetting('giveaway_absen_end', '2026-09-08T23:59:59+07:00');
    const start = new Date(startStr);
    const end   = new Date(endStr);
    end.setHours(23, 59, 59, 999);
    return date >= start && date <= end;
  } catch {
    return true;
  }
}

export function recordAbsenMessage(groupJid: string, senderJid: string, memberTag?: string, pushName?: string, phoneOverride?: string) {
  let phone = phoneOverride ? phoneOverride.trim() : '';
  if (!phone) {
    phone = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];
  }
  const nowIso = new Date().toISOString();

  let finalTag = memberTag && memberTag.trim() ? memberTag.trim().replace(/^@/, '').toLowerCase() : '';

  // 1. Jika belum ada tag, cari dari data member grup yang sudah tersimpan (berdasarkan JID atau No HP)
  if (!finalTag) {
    const existing = getWaGroupMembers(groupJid).find(m => 
      m.jid === senderJid || (m.phone && phone && m.phone === phone)
    );
    if (existing && existing.member_tag && !/^\d{10,}$/.test(existing.member_tag)) {
      finalTag = existing.member_tag.replace(/^@/, '').trim();
    }
  }

  // 2. Jika masih belum ada, cek apakah pushName pengirim persis sama dengan username peserta TikTok
  if (!finalTag && pushName) {
    const cleanPush = pushName.replace(/^[@~]/, '').trim().toLowerCase();
    const realParticipants = getRealParticipants();
    const matchedP = realParticipants.find(p => p.username.toLowerCase() === cleanPush);
    if (matchedP) {
      finalTag = matchedP.username;
    }
  }

  // 3. Cek apakah pushName mengandung username peserta giveaway (misal: "Sayang 💕 (@ilvy0uv)")
  if (!finalTag && pushName) {
    const cleanPush = pushName.replace(/^[@~]/, '').trim().toLowerCase();
    const realParticipants = getRealParticipants();
    const matchedP = realParticipants.find(p => p.username.length >= 3 && cleanPush.includes(p.username.toLowerCase()));
    if (matchedP) {
      finalTag = matchedP.username;
    }
  }

  const cleanPushName = pushName ? pushName.replace(/^~/, '').trim() : '';

  const memberPayload: WaMemberRecord = {
    group_jid: groupJid,
    jid: senderJid,
    phone,
    member_tag: finalTag || '',
    push_name: cleanPushName || '',
    role: 'member',
    has_absen: 1,
    absen_at: nowIso,
    last_seen: nowIso,
  };

  saveWaGroupMembers([memberPayload]);

  // Masukkan SEMUA yang absen ke pool giveaway (tidak perlu syarat TikTok tag valid)
  const phoneDigits = phone.replace(/\D/g, '') || senderJid.split('@')[0].replace(/\D/g, '');
  const last4 = phoneDigits ? phoneDigits.slice(-4) : '';
  const displayName = cleanPushName
    ? (last4 ? `${cleanPushName} ·${last4}` : cleanPushName)
    : (last4 ? `Peserta ·${last4}` : 'Peserta');
  const uid = phoneDigits ? `wa_${phoneDigits.slice(-10)}` : `wa_${senderJid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;

  addGiveawayParticipantFromWa(uid, displayName, finalTag || null, phone ? `+${phone}` : null);

  syncAllParticipantsWithWa();
}

export function registerWaAbsenManual(usernameOrTag: string, nickname?: string, phone?: string) {
  const cleanTag = usernameOrTag.replace(/^@/, '').trim();
  const displayName = nickname ? nickname.replace(/^~/, '').trim() : cleanTag;
  const targetGroup = getTargetWaGroup() || '120363409436448923@g.us';
  const cleanPhone = phone ? phone.replace(/[^0-9+]/g, '').trim() : '';
  const fakeJid = cleanPhone ? `${cleanPhone.replace(/^\+/, '')}@s.whatsapp.net` : `${cleanTag}@s.whatsapp.net`;
  const nowIso = new Date().toISOString();

  const memberPayload: WaMemberRecord = {
    group_jid: targetGroup,
    jid: fakeJid,
    phone: phone ? phone.trim() : cleanPhone,
    member_tag: cleanTag,
    push_name: displayName,
    role: 'member',
    has_absen: 1,
    absen_at: nowIso,
    last_seen: nowIso,
  };

  saveWaGroupMembers([memberPayload]);

  // Masukkan ke pool giveaway (semua yang absen, dengan format Nama ·XXXX)
  const phoneDigits = cleanPhone.replace(/\D/g, '');
  const last4 = phoneDigits ? phoneDigits.slice(-4) : '';
  const uiName = displayName
    ? (last4 ? `${displayName} ·${last4}` : displayName)
    : (last4 ? `Peserta ·${last4}` : 'Peserta');
  const uid = phoneDigits ? `wa_${phoneDigits.slice(-10)}` : `wa_${cleanTag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;

  addGiveawayParticipantFromWa(uid, uiName, cleanTag || null, phone ? phone.trim() : (cleanPhone || null));

  return { success: true, username: uid, nickname: uiName, phone: phone || cleanPhone };
}

export function checkUserInWaGroup(username: string): { found: boolean; memberTag?: string; phone?: string; hasAbsen?: boolean } {
  const cleanUser = (username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { found: false };
  const targetGroup = getTargetWaGroup();
  const allMembers = getWaGroupMembers(targetGroup || undefined);

  // 1. Cocokkan tepat berdasarkan member_tag
  let match = allMembers.find(m => {
    const tag = (m.member_tag || '').replace(/^@/, '').trim().toLowerCase();
    return tag === cleanUser;
  });

  // 2. Cocokkan tepat berdasarkan push_name atau nomor telepon atau JID
  if (!match) {
    const cleanNumeric = cleanUser.replace(/[^0-9]/g, '');
    match = allMembers.find(m => {
      const pName = (m.push_name || '').replace(/^[@~]/, '').trim().toLowerCase();
      const ph = (m.phone || '').replace(/[^0-9]/g, '');
      const jidPh = (m.jid || '').split('@')[0].replace(/[^0-9]/g, '');
      return pName === cleanUser || (cleanNumeric && (ph === cleanNumeric || jidPh === cleanNumeric));
    });
  }

  // 3. Fallback pencocokan parsial / substring (misal di WA: "ilvy0uv (Sayang 💕)" atau sebaliknya)
  if (!match && cleanUser.length >= 3) {
    match = allMembers.find(m => {
      const tag = (m.member_tag || '').replace(/^@/, '').trim().toLowerCase();
      const pName = (m.push_name || '').replace(/^[@~]/, '').trim().toLowerCase();
      return (tag && (tag.includes(cleanUser) || cleanUser.includes(tag))) ||
             (pName && (pName.includes(cleanUser) || cleanUser.includes(pName)));
    });
  }

  // 4. Fallback jika grup target spesifik tidak cocok tapi ada di grup WA manapun
  if (!match) {
    const globalMembers = getWaGroupMembers();
    match = globalMembers.find(m => {
      const tag = (m.member_tag || '').replace(/^@/, '').trim().toLowerCase();
      const pName = (m.push_name || '').replace(/^[@~]/, '').trim().toLowerCase();
      return tag === cleanUser || pName === cleanUser;
    });
  }

  if (match) {
    return {
      found: true,
      memberTag: match.member_tag || match.push_name,
      phone: match.phone,
      hasAbsen: !!match.has_absen,
    };
  }

  return { found: false };
}

function computeEligibility(username: string) {
  let participant = memoryParticipants.get(username);
  if (!participant && db) {
    try {
      participant = db.prepare('SELECT * FROM giveaway_participants WHERE username = ?').get(username) as GiveawayParticipant | undefined;
    } catch {}
  }

  if (!participant) return;

  const isMandatory = isWaRequirementMandatory();
  // Jika syarat WA wajib: peserta WAJIB masuk grup & absen. Jika opsional: langsung eligible!
  const eligible = isMandatory ? (participant.has_wa_group ? 1 : 0) : 1;
  participant.is_eligible = eligible;
  participant.last_updated = new Date().toISOString();
  memoryParticipants.set(username, participant);

  if (db) {
    try {
      db.prepare(`UPDATE giveaway_participants SET is_eligible = ?, last_updated = datetime('now') WHERE username = ?`).run(eligible, username);
    } catch {}
  }

  safeSupabaseUpsert('giveaway_participants', {
    username,
    is_eligible: eligible,
    last_updated: participant.last_updated
  });
}

export function recomputeAllEligibility() {
  const participants = getGiveawayParticipants();
  for (const p of participants) {
    computeEligibility(p.username);
  }
}

export function syncParticipantWaStatus(username: string) {
  const waCheck = checkUserInWaGroup(username);
  const isValidWa = waCheck.found && waCheck.hasAbsen;
  const nowIso = new Date().toISOString();

  let participant = memoryParticipants.get(username);
  if (!participant && db) {
    try {
      participant = db.prepare('SELECT * FROM giveaway_participants WHERE username = ?').get(username) as GiveawayParticipant | undefined;
    } catch {}
  }

  if (participant) {
    if (waCheck.found) {
      participant.has_wa_group = isValidWa ? 1 : 0;
      participant.wa_member_tag = waCheck.memberTag || participant.wa_member_tag || null;
      participant.wa_phone = waCheck.phone || participant.wa_phone || null;
    } else if (participant.has_wa_group && (participant.wa_phone || participant.wa_member_tag)) {
      // Pertahankan jika peserta sudah terverifikasi sebelumnya
    } else {
      participant.has_wa_group = 0;
      participant.wa_member_tag = null;
      participant.wa_phone = null;
    }
    participant.last_updated = nowIso;
    memoryParticipants.set(username, participant);

    safeSupabaseUpsert('giveaway_participants', {
      username,
      has_wa_group: participant.has_wa_group,
      wa_member_tag: participant.wa_member_tag,
      wa_phone: participant.wa_phone,
      last_updated: nowIso
    });
  }

  if (db) {
    try {
      if (waCheck.found) {
        db.prepare(`
          UPDATE giveaway_participants 
          SET has_wa_group = ?, wa_member_tag = ?, wa_phone = ?, last_updated = datetime('now')
          WHERE username = ?
        `).run(isValidWa ? 1 : 0, waCheck.memberTag || null, waCheck.phone || null, username);
      } else {
        db.prepare(`
          UPDATE giveaway_participants 
          SET has_wa_group = 0, last_updated = datetime('now')
          WHERE username = ?
        `).run(username);
      }
    } catch {}
  }

  computeEligibility(username);
}

export function syncAllParticipantsWithWa() {
  const absenMembers = getWaGroupMembers(getTargetWaGroup() || undefined).filter(m => !!m.has_absen);

  for (const m of absenMembers) {
    const rawTag = (m.member_tag || '').replace(/^@/, '').trim().toLowerCase();
    const cleanPush = m.push_name ? m.push_name.replace(/^~/, '').trim() : '';
    const phone = (m.phone || '').replace(/\D/g, '');
    const jidNum = (m.jid || '').split('@')[0].replace(/\D/g, '');

    // Buat unique ID yang stabil: preferensi nomor HP, fallback JID
    const phoneDigits = phone || jidNum;
    const last4 = phoneDigits ? phoneDigits.slice(-4) : '';

    // Buat display name: Nama + ·XXXX (4 digit terakhir HP)
    const displayName = cleanPush
      ? (last4 ? `${cleanPush} ·${last4}` : cleanPush)
      : (last4 ? `Peserta ·${last4}` : 'Peserta');

    // Username unik berbasis nomor HP (bukan username TikTok)
    // Format: wa_XXXXXXXX (8 digit terakhir HP atau JID)
    const uid = phoneDigits ? `wa_${phoneDigits.slice(-10)}` : `wa_${m.jid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;

    // Masukkan ke pool giveaway tanpa syarat TikTok username
    addGiveawayParticipantFromWa(uid, displayName, rawTag || null, phone ? `+${phone}` : (m.phone || null));
  }

  const realParticipants = getRealParticipants();
  for (const p of realParticipants) {
    syncParticipantWaStatus(p.username);
  }
}

/**
 * Daftarkan peserta giveaway DARI WhatsApp (tanpa butuh TikTok username).
 * Username = wa_XXXXXXXXXX (unik dari nomor HP).
 * Nickname = Nama + ·XXXX (4 digit terakhir HP).
 * TikTok username diisi nanti saat menang (via updateGiveawayWinnerTiktok).
 */
export function addGiveawayParticipantFromWa(
  uid: string,
  displayName: string,
  tiktokTag: string | null,
  waPhone: string | null
) {
  const nowIso = new Date().toISOString();
  const existing = memoryParticipants.get(uid);

  // Jangan timpa TikTok tag yang sudah ada dengan null/empty
  const finalTag = tiktokTag || existing?.wa_member_tag || null;

  const payload: GiveawayParticipant = {
    username: uid,
    nickname: displayName,
    profile_picture: null,
    has_followed: 1,
    has_liked: existing?.has_liked || 0,
    has_shared: 1,
    has_commented: 1,
    has_wa_group: 1,
    wa_member_tag: finalTag,
    wa_phone: waPhone || existing?.wa_phone || null,
    is_eligible: 1,
    is_tester: 0,
    registered_at: existing?.registered_at || nowIso,
    last_updated: nowIso,
  };

  memoryParticipants.set(uid, payload);

  if (db) {
    try {
      db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, has_followed, has_shared, has_commented, has_wa_group, wa_member_tag, wa_phone, is_eligible, is_tester, last_updated)
        VALUES (?, ?, 1, 1, 1, 1, ?, ?, 1, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
          nickname = excluded.nickname,
          has_wa_group = 1,
          is_eligible = 1,
          wa_member_tag = COALESCE(NULLIF(excluded.wa_member_tag, ''), giveaway_participants.wa_member_tag),
          wa_phone = COALESCE(NULLIF(excluded.wa_phone, ''), giveaway_participants.wa_phone),
          last_updated = datetime('now')
      `).run(uid, displayName, finalTag || null, waPhone || null);
    } catch {}
  }

  safeSupabaseUpsert('giveaway_participants', payload);
}

/**
 * Setelah pemenang diundi, admin input username TikTok untuk verifikasi.
 * Update wa_member_tag pada peserta (username = uid wa_XXXXXXXXXX).
 */
export function updateGiveawayWinnerTiktok(uid: string, tiktokUsername: string) {
  const clean = tiktokUsername.replace(/^@/, '').trim().toLowerCase();
  const existing = memoryParticipants.get(uid);
  if (!existing) return false;

  existing.wa_member_tag = clean || existing.wa_member_tag;
  existing.last_updated = new Date().toISOString();
  memoryParticipants.set(uid, existing);

  if (db) {
    try {
      db.prepare(`UPDATE giveaway_participants SET wa_member_tag = ?, last_updated = datetime('now') WHERE username = ?`)
        .run(clean || existing.wa_member_tag, uid);
    } catch {}
  }
  return true;
}

export function addGiveawayParticipant(
  username: string,
  nickname: string,
  profilePicture?: string | null,
  forceWaVerified = 0,
  waPhoneOverride?: string | null,
  waMemberTagOverride?: string | null
) {
  const waCheck = checkUserInWaGroup(username);
  const isValidWa = forceWaVerified ? 1 : (waCheck.found && waCheck.hasAbsen ? 1 : 0);
  const nowIso = new Date().toISOString();

  const existing = memoryParticipants.get(username);
  const finalPhone = waPhoneOverride || waCheck.phone || existing?.wa_phone || null;
  const finalMemberTag = waMemberTagOverride || waCheck.memberTag || existing?.wa_member_tag || username;

  const payload: GiveawayParticipant = {
    username,
    nickname: nickname || existing?.nickname || username,
    profile_picture: profilePicture || existing?.profile_picture || null,
    has_followed: 1,
    has_liked: existing?.has_liked || 0,
    has_shared: 1,
    has_commented: 1,
    has_wa_group: isValidWa,
    wa_member_tag: finalMemberTag,
    wa_phone: finalPhone,
    is_eligible: isValidWa ? 1 : 0,
    is_tester: 0,
    registered_at: existing?.registered_at || nowIso,
    last_updated: nowIso
  };

  memoryParticipants.set(username, payload);

  if (db) {
    try {
      db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, profile_picture, has_followed, has_shared, has_commented, has_wa_group, wa_member_tag, wa_phone, is_eligible, is_tester, last_updated)
        VALUES (?, ?, ?, 1, 1, 1, ?, ?, ?, ?, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
          nickname = excluded.nickname,
          profile_picture = COALESCE(excluded.profile_picture, giveaway_participants.profile_picture),
          has_wa_group = excluded.has_wa_group,
          wa_member_tag = COALESCE(excluded.wa_member_tag, giveaway_participants.wa_member_tag),
          wa_phone = COALESCE(excluded.wa_phone, giveaway_participants.wa_phone),
          last_updated = datetime('now')
      `).run(username, nickname, profilePicture || null, isValidWa, finalMemberTag, finalPhone, payload.is_eligible);
    } catch {}
  }

  safeSupabaseUpsert('giveaway_participants', payload);
  computeEligibility(username);
}


export function updateGiveawayFollow(username: string, nickname: string, profilePicture?: string) {
  const waCheck = checkUserInWaGroup(username);
  const isValidWa = waCheck.found && waCheck.hasAbsen ? 1 : 0;
  const nowIso = new Date().toISOString();

  const existing = memoryParticipants.get(username);
  const payload: GiveawayParticipant = {
    username,
    nickname: nickname || existing?.nickname || username,
    profile_picture: profilePicture || existing?.profile_picture || null,
    has_followed: 1,
    has_liked: existing?.has_liked || 0,
    has_shared: existing?.has_shared || 0,
    has_commented: existing?.has_commented || 0,
    has_wa_group: isValidWa || existing?.has_wa_group || 0,
    wa_member_tag: waCheck.memberTag || existing?.wa_member_tag || null,
    wa_phone: waCheck.phone || existing?.wa_phone || null,
    is_eligible: (isValidWa || existing?.has_wa_group) ? 1 : 0,
    is_tester: 0,
    registered_at: existing?.registered_at || nowIso,
    last_updated: nowIso
  };

  memoryParticipants.set(username, payload);

  if (db) {
    try {
      db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, profile_picture, has_followed, has_wa_group, wa_member_tag, wa_phone, is_tester, last_updated)
        VALUES (?, ?, ?, 1, ?, ?, ?, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
          nickname = excluded.nickname,
          profile_picture = COALESCE(excluded.profile_picture, giveaway_participants.profile_picture),
          has_followed = 1,
          has_wa_group = CASE WHEN excluded.has_wa_group = 1 THEN 1 ELSE giveaway_participants.has_wa_group END,
          wa_member_tag = COALESCE(excluded.wa_member_tag, giveaway_participants.wa_member_tag),
          wa_phone = COALESCE(excluded.wa_phone, giveaway_participants.wa_phone),
          last_updated = datetime('now')
      `).run(username, nickname, profilePicture || null, isValidWa, waCheck.memberTag || null, waCheck.phone || null);
    } catch {}
  }

  safeSupabaseUpsert('giveaway_participants', payload);
  computeEligibility(username);
}

export function updateGiveawayShare(username: string, nickname: string, profilePicture?: string) {
  const waCheck = checkUserInWaGroup(username);
  const isValidWa = waCheck.found && waCheck.hasAbsen ? 1 : 0;
  const nowIso = new Date().toISOString();

  const existing = memoryParticipants.get(username);
  const payload: GiveawayParticipant = {
    username,
    nickname: nickname || existing?.nickname || username,
    profile_picture: profilePicture || existing?.profile_picture || null,
    has_followed: existing?.has_followed || 0,
    has_liked: existing?.has_liked || 0,
    has_shared: 1,
    has_commented: existing?.has_commented || 0,
    has_wa_group: isValidWa || existing?.has_wa_group || 0,
    wa_member_tag: waCheck.memberTag || existing?.wa_member_tag || null,
    wa_phone: waCheck.phone || existing?.wa_phone || null,
    is_eligible: (isValidWa || existing?.has_wa_group) ? 1 : 0,
    is_tester: 0,
    registered_at: existing?.registered_at || nowIso,
    last_updated: nowIso
  };

  memoryParticipants.set(username, payload);

  if (db) {
    try {
      db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, profile_picture, has_shared, has_wa_group, wa_member_tag, wa_phone, is_tester, last_updated)
        VALUES (?, ?, ?, 1, ?, ?, ?, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
          nickname = excluded.nickname,
          profile_picture = COALESCE(excluded.profile_picture, giveaway_participants.profile_picture),
          has_shared = 1,
          has_wa_group = CASE WHEN excluded.has_wa_group = 1 THEN 1 ELSE giveaway_participants.has_wa_group END,
          wa_member_tag = COALESCE(excluded.wa_member_tag, giveaway_participants.wa_member_tag),
          wa_phone = COALESCE(excluded.wa_phone, giveaway_participants.wa_phone),
          last_updated = datetime('now')
      `).run(username, nickname, profilePicture || null, isValidWa, waCheck.memberTag || null, waCheck.phone || null);
    } catch {}
  }

  safeSupabaseUpsert('giveaway_participants', payload);
  computeEligibility(username);
}

export function updateGiveawayComment(username: string, nickname: string, profilePicture?: string) {
  const waCheck = checkUserInWaGroup(username);
  const isValidWa = waCheck.found && waCheck.hasAbsen ? 1 : 0;
  const nowIso = new Date().toISOString();

  const existing = memoryParticipants.get(username);
  const payload: GiveawayParticipant = {
    username,
    nickname: nickname || existing?.nickname || username,
    profile_picture: profilePicture || existing?.profile_picture || null,
    has_followed: existing?.has_followed || 0,
    has_liked: existing?.has_liked || 0,
    has_shared: existing?.has_shared || 0,
    has_commented: 1,
    has_wa_group: isValidWa || existing?.has_wa_group || 0,
    wa_member_tag: waCheck.memberTag || existing?.wa_member_tag || null,
    wa_phone: waCheck.phone || existing?.wa_phone || null,
    is_eligible: (isValidWa || existing?.has_wa_group) ? 1 : 0,
    is_tester: 0,
    registered_at: existing?.registered_at || nowIso,
    last_updated: nowIso
  };

  memoryParticipants.set(username, payload);

  if (db) {
    try {
      db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, profile_picture, has_commented, has_wa_group, wa_member_tag, wa_phone, is_tester, last_updated)
        VALUES (?, ?, ?, 1, ?, ?, ?, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
          nickname = excluded.nickname,
          profile_picture = COALESCE(excluded.profile_picture, giveaway_participants.profile_picture),
          has_commented = 1,
          has_wa_group = CASE WHEN excluded.has_wa_group = 1 THEN 1 ELSE giveaway_participants.has_wa_group END,
          wa_member_tag = COALESCE(excluded.wa_member_tag, giveaway_participants.wa_member_tag),
          wa_phone = COALESCE(excluded.wa_phone, giveaway_participants.wa_phone),
          last_updated = datetime('now')
      `).run(username, nickname, profilePicture || null, isValidWa, waCheck.memberTag || null, waCheck.phone || null);
    } catch {}
  }

  safeSupabaseUpsert('giveaway_participants', payload);
  computeEligibility(username);
}

// ── Real participants (is_tester = 0) ──────────────────────────────
export function getRealParticipants(): GiveawayParticipant[] {
  if (memoryParticipants.size > 0) {
    return Array.from(memoryParticipants.values())
      .filter(p => !p.is_tester)
      .sort((a, b) => (b.last_updated || '').localeCompare(a.last_updated || ''));
  }
  if (db) {
    try {
      return db.prepare('SELECT * FROM giveaway_participants WHERE is_tester = 0 ORDER BY last_updated DESC').all() as GiveawayParticipant[];
    } catch {}
  }
  return [];
}

export function getEligibleRealParticipants(): GiveawayParticipant[] {
  if (memoryParticipants.size > 0) {
    return Array.from(memoryParticipants.values())
      .filter(p => !p.is_tester && p.is_eligible === 1)
      .sort((a, b) => (a.registered_at || '').localeCompare(b.registered_at || ''));
  }
  if (db) {
    try {
      return db.prepare('SELECT * FROM giveaway_participants WHERE is_eligible = 1 AND is_tester = 0 ORDER BY registered_at ASC').all() as GiveawayParticipant[];
    } catch {}
  }
  return [];
}

export function resetRealGiveawayData() {
  for (const [k, v] of memoryParticipants.entries()) {
    if (!v.is_tester) memoryParticipants.delete(k);
  }
  if (db) {
    try {
      db.prepare('DELETE FROM giveaway_participants WHERE is_tester = 0').run();
    } catch {}
  }
  Promise.resolve(supabaseAdmin.from('giveaway_participants').delete().eq('is_tester', 0)).catch(() => {});
}

// ── Tester participants (is_tester = 1) ───────────────────────────
export function getTesterParticipants(): GiveawayParticipant[] {
  if (memoryParticipants.size > 0) {
    return Array.from(memoryParticipants.values())
      .filter(p => !!p.is_tester)
      .sort((a, b) => (b.last_updated || '').localeCompare(a.last_updated || ''));
  }
  if (db) {
    try {
      return db.prepare('SELECT * FROM giveaway_participants WHERE is_tester = 1 ORDER BY last_updated DESC').all() as GiveawayParticipant[];
    } catch {}
  }
  return [];
}

export function getEligibleTesterParticipants(): GiveawayParticipant[] {
  if (memoryParticipants.size > 0) {
    return Array.from(memoryParticipants.values())
      .filter(p => !!p.is_tester && p.is_eligible === 1)
      .sort((a, b) => (a.registered_at || '').localeCompare(b.registered_at || ''));
  }
  if (db) {
    try {
      return db.prepare('SELECT * FROM giveaway_participants WHERE is_eligible = 1 AND is_tester = 1 ORDER BY registered_at ASC').all() as GiveawayParticipant[];
    } catch {}
  }
  return [];
}

export function addGiveawayTester(username: string, nickname: string) {
  const nowIso = new Date().toISOString();
  const payload: GiveawayParticipant = {
    username,
    nickname,
    profile_picture: null,
    has_followed: 1,
    has_liked: 0,
    has_shared: 1,
    has_commented: 1,
    has_wa_group: 1,
    wa_member_tag: username.replace(/^_tester_/, ''),
    wa_phone: null,
    is_eligible: 1,
    is_tester: 1,
    registered_at: nowIso,
    last_updated: nowIso
  };

  memoryParticipants.set(username, payload);

  if (db) {
    try {
      db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, has_followed, has_shared, has_commented, has_wa_group, wa_member_tag, is_eligible, is_tester, last_updated)
        VALUES (?, ?, 1, 1, 1, 1, ?, 1, 1, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
          nickname = excluded.nickname,
          has_followed = 1,
          has_shared = 1,
          has_commented = 1,
          has_wa_group = 1,
          wa_member_tag = excluded.wa_member_tag,
          is_eligible = 1,
          is_tester = 1,
          last_updated = datetime('now')
      `).run(username, nickname, username.replace(/^_tester_/, ''));
    } catch {}
  }

  safeSupabaseUpsert('giveaway_participants', payload);
}

export function resetTesterData() {
  for (const [k, v] of memoryParticipants.entries()) {
    if (v.is_tester) memoryParticipants.delete(k);
  }
  if (db) {
    try {
      db.prepare('DELETE FROM giveaway_participants WHERE is_tester = 1').run();
    } catch {}
  }
  Promise.resolve(supabaseAdmin.from('giveaway_participants').delete().eq('is_tester', 1)).catch(() => {});
}

// ── Generic ──────────────────────────────────────────────────────
export function removeGiveawayParticipant(username: string) {
  memoryParticipants.delete(username);
  if (db) {
    try {
      db.prepare('DELETE FROM giveaway_participants WHERE username = ?').run(username);
    } catch {}
  }
  safeSupabaseDelete('giveaway_participants', 'username', username);
}

export function resetGiveawayData() {
  memoryParticipants.clear();
  if (db) {
    try {
      db.prepare('DELETE FROM giveaway_participants').run();
    } catch {}
  }
  Promise.resolve(supabaseAdmin.from('giveaway_participants').delete().neq('username', '')).catch(() => {});
}

export function getGiveawayParticipants(): GiveawayParticipant[] {
  if (memoryParticipants.size > 0) {
    return Array.from(memoryParticipants.values()).sort((a, b) => (b.last_updated || '').localeCompare(a.last_updated || ''));
  }
  if (db) {
    try {
      return db.prepare('SELECT * FROM giveaway_participants ORDER BY last_updated DESC').all() as GiveawayParticipant[];
    } catch {}
  }
  return [];
}

export function getEligibleParticipants(): GiveawayParticipant[] {
  if (memoryParticipants.size > 0) {
    return Array.from(memoryParticipants.values()).filter(p => p.is_eligible === 1);
  }
  if (db) {
    try {
      return db.prepare('SELECT * FROM giveaway_participants WHERE is_eligible = 1 ORDER BY registered_at ASC').all() as GiveawayParticipant[];
    } catch {}
  }
  return [];
}

export function toggleGiveawayRequirement(
  username: string,
  field: 'has_followed' | 'has_shared' | 'has_commented' | 'has_wa_group',
  value: number
) {
  const p = memoryParticipants.get(username);
  if (p) {
    (p as any)[field] = value;
    p.last_updated = new Date().toISOString();
    memoryParticipants.set(username, p);
    safeSupabaseUpsert('giveaway_participants', {
      username,
      [field]: value,
      last_updated: p.last_updated
    });
  }

  if (db) {
    try {
      db.prepare(`
        UPDATE giveaway_participants 
        SET ${field} = ?, last_updated = datetime('now') 
        WHERE username = ?
      `).run(value, username);
    } catch {}
  }

  computeEligibility(username);
}

export function setGiveawayVideoUrl(url: string) {
  setSetting('giveaway_video_url', url);
}

export function getGiveawayVideoUrl(): string {
  return getSetting('giveaway_video_url', '');
}

// ==========================================
// WHATSAPP GROUP MEMBERS REPOSITORY
// ==========================================
export function saveWaGroupMembers(members: WaMemberRecord[]) {
  const nowIso = new Date().toISOString();
  const toUpsert: WaMemberRecord[] = [];

  for (const item of members) {
    const key = `${item.group_jid}_${item.jid}`;
    const existing = memoryWaMembers.get(key);
    const updated: WaMemberRecord = {
      group_jid: item.group_jid,
      jid: item.jid,
      phone: (item.phone && !/^\d{15,}$/.test(item.phone)) ? item.phone : (existing?.phone || item.phone || ''),
      member_tag: item.member_tag || existing?.member_tag || '',
      push_name: item.push_name || existing?.push_name || '',
      role: item.role || existing?.role || 'member',
      has_absen: item.has_absen !== undefined ? item.has_absen : (existing?.has_absen || 0),
      absen_at: item.absen_at || existing?.absen_at || null,
      last_seen: nowIso,
    };
    memoryWaMembers.set(key, updated);
    toUpsert.push(updated);
  }

  if (toUpsert.length > 0) {
    safeSupabaseUpsert('wa_group_members', toUpsert, 'group_jid,jid');
  }

  if (db) {
    try {
      const insertStmt = db.prepare(`
        INSERT INTO wa_group_members (group_jid, jid, phone, member_tag, push_name, role, has_absen, absen_at, last_seen)
        VALUES (@group_jid, @jid, @phone, @member_tag, @push_name, @role, @has_absen, @absen_at, datetime('now'))
        ON CONFLICT(group_jid, jid) DO UPDATE SET
          phone = COALESCE(NULLIF(excluded.phone, ''), wa_group_members.phone),
          member_tag = COALESCE(NULLIF(excluded.member_tag, ''), wa_group_members.member_tag),
          push_name = COALESCE(NULLIF(excluded.push_name, ''), wa_group_members.push_name),
          role = COALESCE(NULLIF(excluded.role, ''), wa_group_members.role),
          has_absen = MAX(excluded.has_absen, wa_group_members.has_absen),
          absen_at = COALESCE(excluded.absen_at, wa_group_members.absen_at),
          last_seen = datetime('now')
      `);

      const insertMany = db.transaction((items: WaMemberRecord[]) => {
        for (const item of items) {
          insertStmt.run({
            group_jid: item.group_jid,
            jid: item.jid,
            phone: item.phone || '',
            member_tag: item.member_tag || '',
            push_name: item.push_name || '',
            role: item.role || 'member',
            has_absen: item.has_absen || 0,
            absen_at: item.absen_at || null,
          });
        }
      });

      insertMany(members);
    } catch (err: any) {
      console.warn('[DB] SQLite saveWaGroupMembers error:', err?.message || err);
    }
  }

  // After saving WA members, automatically re-sync participants status
  syncAllParticipantsWithWa();
}

export function getWaGroupMembers(groupJid?: string): WaMemberRecord[] {
  // 1. Ambil dari SQLite jika ada (karena SQLite menyimpan data paling persisten dan lengkap)
  let dbRows: WaMemberRecord[] = [];
  if (db) {
    try {
      if (groupJid) {
        dbRows = db.prepare('SELECT * FROM wa_group_members WHERE group_jid = ? ORDER BY member_tag ASC, push_name ASC').all(groupJid) as WaMemberRecord[];
      } else {
        dbRows = db.prepare('SELECT * FROM wa_group_members ORDER BY last_seen DESC').all() as WaMemberRecord[];
      }
    } catch {}
  }

  // 2. Jika SQLite mengembalikan data, sinkronkan ke memoryWaMembers dan return
  if (dbRows.length > 0) {
    for (const r of dbRows) {
      const key = `${r.group_jid}_${r.jid}`;
      const mem = memoryWaMembers.get(key);
      memoryWaMembers.set(key, {
        ...r,
        member_tag: r.member_tag || mem?.member_tag || '',
        phone: r.phone || mem?.phone || '',
        push_name: r.push_name || mem?.push_name || '',
      });
    }
    return dbRows;
  }

  // 3. Fallback jika SQLite kosong (misal di cloud tanpa file db), ambil dari memory
  const all = Array.from(memoryWaMembers.values());
  if (all.length > 0) {
    if (groupJid) {
      return all.filter(m => m.group_jid === groupJid).sort((a, b) => (a.member_tag || '').localeCompare(b.member_tag || ''));
    }
    return all.sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''));
  }

  return [];
}

export function clearWaGroupMembers(groupJid?: string) {
  if (groupJid) {
    for (const [k, v] of memoryWaMembers.entries()) {
      if (v.group_jid === groupJid) memoryWaMembers.delete(k);
    }
    safeSupabaseDelete('wa_group_members', 'group_jid', groupJid);
    if (db) {
      try {
        db.prepare('DELETE FROM wa_group_members WHERE group_jid = ?').run(groupJid);
      } catch {}
    }
  } else {
    memoryWaMembers.clear();
    Promise.resolve(supabaseAdmin.from('wa_group_members').delete().neq('jid', '')).catch(() => {});
    if (db) {
      try {
        db.prepare('DELETE FROM wa_group_members').run();
      } catch {}
    }
  }
  syncAllParticipantsWithWa();
}

export function getDuplicateUsernames(groupJid?: string): { member_tag: string; count: number; members: WaMemberRecord[] }[] {
  const members = getWaGroupMembers(groupJid);
  const tagMap = new Map<string, WaMemberRecord[]>();

  for (const m of members) {
    const cleanTag = (m.member_tag || '').replace(/^@/, '').trim().toLowerCase();
    if (!cleanTag) continue;
    const list = tagMap.get(cleanTag) || [];
    list.push(m);
    tagMap.set(cleanTag, list);
  }

  const duplicates: { member_tag: string; count: number; members: WaMemberRecord[] }[] = [];
  for (const [tag, list] of tagMap.entries()) {
    if (list.length > 1) {
      duplicates.push({
        member_tag: tag,
        count: list.length,
        members: list,
      });
    }
  }

  return duplicates;
}
