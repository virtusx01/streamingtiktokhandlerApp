import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from './supabase';

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
}

syncFromSupabase();

function safeSupabaseUpsert(table: string, payload: any) {
  Promise.resolve(supabaseAdmin.from(table).upsert(payload)).catch(() => {});
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
  console.warn('[DB] SQLite is unavailable or read-only (cloud/serverless environment). Operating via Memory & Supabase:', e.message);
  db = null;
}

export default db;

export function getSetting(key: string, defaultValue: any = null) {
  if (db) {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      if (row) {
        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      }
    } catch {}
  }

  if (memorySettings[key] !== undefined) {
    try {
      return JSON.parse(memorySettings[key]);
    } catch {
      return memorySettings[key];
    }
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
    return db.prepare('SELECT id, name, created_at FROM reward_presets ORDER BY created_at DESC').all() as { id: number, name: string, created_at: string }[];
}

export function saveRewardPreset(name: string, rewards: Record<string, any>) {
    db.prepare('INSERT OR REPLACE INTO reward_presets (name, data) VALUES (?, ?)').run(name, JSON.stringify(rewards));
}

export function loadRewardPreset(name: string): Record<string, any> | null {
    const row = db.prepare('SELECT data FROM reward_presets WHERE name = ?').get(name) as { data: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
}

export function deleteRewardPreset(name: string) {
    db.prepare('DELETE FROM reward_presets WHERE name = ?').run(name);
}

export function renameRewardPreset(oldName: string, newName: string) {
    db.prepare('UPDATE reward_presets SET name = ? WHERE name = ?').run(newName, oldName);
}

// ==========================================
// DETECTED GIFTS
// ==========================================
export function addDetectedGift(name: string) {
    db.prepare(`
      INSERT INTO detected_gifts (name, count, last_seen) VALUES (?, 1, datetime('now'))
      ON CONFLICT(name) DO UPDATE SET count = count + 1, last_seen = datetime('now')
    `).run(name);
}

export function getDetectedGifts() {
    return db.prepare('SELECT name, count, last_seen FROM detected_gifts ORDER BY count DESC').all() as { name: string, count: number, last_seen: string }[];
}

// ==========================================
// LIKE MILESTONES & USER TRACKING
// ==========================================
export function resetLikeSession() {
    db.prepare('DELETE FROM user_likes').run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('lastMilestonePerformed', '0')").run();
}

export function getUserLikes(username: string) {
    return db.prepare('SELECT * FROM user_likes WHERE username = ?').get(username) as { 
        username: string, 
        nickname: string, 
        total_likes: number, 
        last_milestone: number 
    } | undefined;
}

export function updateUserLikes(username: string, nickname: string, totalLikes: number, lastMilestone?: number) {
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
}

// ==========================================
// GIVEAWAY PARTICIPANTS
// ==========================================
export interface GiveawayParticipant {
    username: string;
    nickname: string;
    profile_picture: string | null;
    has_followed: number;
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
    // 6 September 2026 00:00:00 WIB s/d 8 September 2026 23:59:59 WIB (UTC+7)
    const start = new Date('2026-09-06T00:00:00+07:00');
    const end   = new Date('2026-09-08T23:59:59+07:00');
    return date >= start && date <= end;
}

export function recordAbsenMessage(groupJid: string, senderJid: string, memberTag?: string, pushName?: string) {
    const phone = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];
    const nowIso = new Date().toISOString();

    // Pastikan jika memberTag kosong, cari apakah sebelumnya sudah pernah tersimpan member_tag untuk jid ini
    let finalTag = memberTag && memberTag.trim() ? memberTag.trim() : '';
    if (!finalTag) {
        const existing = db.prepare('SELECT member_tag FROM wa_group_members WHERE group_jid = ? AND jid = ?').get(groupJid, senderJid) as { member_tag: string } | undefined;
        if (existing && existing.member_tag) {
            finalTag = existing.member_tag;
        }
    }

    db.prepare(`
        INSERT INTO wa_group_members (group_jid, jid, phone, member_tag, push_name, role, has_absen, absen_at, last_seen)
        VALUES (?, ?, ?, ?, ?, 'member', 1, ?, datetime('now'))
        ON CONFLICT(group_jid, jid) DO UPDATE SET
            phone = excluded.phone,
            member_tag = COALESCE(NULLIF(excluded.member_tag, ''), wa_group_members.member_tag),
            push_name = COALESCE(NULLIF(excluded.push_name, ''), wa_group_members.push_name),
            has_absen = 1,
            absen_at = excluded.absen_at,
            last_seen = datetime('now')
    `).run(groupJid, senderJid, phone, finalTag || null, pushName || null, nowIso);

    // Otomatis daftarkan langsung ke peserta giveaway
    // Jika ada memberTag (misal: ilvy0uv), jadikan username. Jika belum ada tag, gunakan pushName atau phone sebagai username
    const cleanTag = finalTag ? finalTag.replace(/^@/, '').trim() : (pushName ? pushName.trim() : phone);
    const displayName = pushName || cleanTag;

    if (cleanTag) {
        db.prepare(`
            INSERT INTO giveaway_participants (username, nickname, has_followed, has_shared, has_commented, has_wa_group, wa_member_tag, wa_phone, is_eligible, is_tester, last_updated)
            VALUES (?, ?, 1, 1, 1, 1, ?, ?, 1, 0, datetime('now'))
            ON CONFLICT(username) DO UPDATE SET
                nickname = excluded.nickname,
                has_followed = 1,
                has_shared = 1,
                has_commented = 1,
                has_wa_group = 1,
                is_eligible = 1,
                wa_member_tag = COALESCE(NULLIF(excluded.wa_member_tag, ''), giveaway_participants.wa_member_tag),
                wa_phone = excluded.wa_phone,
                last_updated = datetime('now')
        `).run(cleanTag, displayName, finalTag || cleanTag, phone);
        console.log(`[Giveaway Auto-Register] ✅ Berhasil mendaftarkan peserta dari WA: @${cleanTag} (${displayName})`);
    }

    // Otomatis sinkronkan seluruh peserta giveaway yang ada
    syncAllParticipantsWithWa();
}

export function registerWaAbsenManual(usernameOrTag: string, nickname?: string, phone?: string) {
    const cleanTag = usernameOrTag.replace(/^@/, '').trim();
    const displayName = nickname?.trim() || cleanTag;
    const targetGroup = getTargetWaGroup() || '120363409436448923@g.us';
    const fakeJid = `${cleanTag}@s.whatsapp.net`;

    db.prepare(`
        INSERT INTO wa_group_members (group_jid, jid, phone, member_tag, push_name, role, has_absen, absen_at, last_seen)
        VALUES (?, ?, ?, ?, ?, 'member', 1, datetime('now'), datetime('now'))
        ON CONFLICT(group_jid, jid) DO UPDATE SET
            member_tag = excluded.member_tag,
            push_name = excluded.push_name,
            has_absen = 1,
            absen_at = datetime('now'),
            last_seen = datetime('now')
    `).run(targetGroup, fakeJid, phone || '', cleanTag, displayName);

    db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, has_followed, has_shared, has_commented, has_wa_group, wa_member_tag, wa_phone, is_eligible, is_tester, last_updated)
        VALUES (?, ?, 1, 1, 1, 1, ?, ?, 1, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
            nickname = excluded.nickname,
            has_followed = 1,
            has_shared = 1,
            has_commented = 1,
            has_wa_group = 1,
            wa_member_tag = excluded.wa_member_tag,
            wa_phone = excluded.wa_phone,
            is_eligible = 1,
            is_tester = 0,
            last_updated = datetime('now')
    `).run(cleanTag, displayName, cleanTag, phone || '');

    computeEligibility(cleanTag);
    return { success: true, username: cleanTag, nickname: displayName };
}

export function checkUserInWaGroup(username: string): { found: boolean; memberTag?: string; phone?: string; hasAbsen?: boolean } {
    const cleanUser = username.replace(/^@/, '').trim().toLowerCase();
    const targetGroup = getTargetWaGroup();

    // 1. Cek berdasarkan member_tag
    let query = `
        SELECT phone, member_tag, push_name, has_absen 
        FROM wa_group_members 
        WHERE LOWER(TRIM(REPLACE(member_tag, '@', ''))) = ?
    `;
    const params: any[] = [cleanUser];
    if (targetGroup) {
        query += ` AND group_jid = ?`;
        params.push(targetGroup);
    }

    let row = db.prepare(query).get(...params) as { phone: string; member_tag: string; push_name: string; has_absen: number } | undefined;

    // 2. Fallback jika username cocok dengan push_name (nama profil WA) atau phone
    if (!row) {
        let fallbackQuery = `
            SELECT phone, member_tag, push_name, has_absen 
            FROM wa_group_members 
            WHERE (LOWER(TRIM(REPLACE(push_name, '@', ''))) = ? OR LOWER(TRIM(phone)) = ?)
        `;
        const fallbackParams: any[] = [cleanUser, cleanUser];
        if (targetGroup) {
            fallbackQuery += ` AND group_jid = ?`;
            fallbackParams.push(targetGroup);
        }
        row = db.prepare(fallbackQuery).get(...fallbackParams) as { phone: string; member_tag: string; push_name: string; has_absen: number } | undefined;
    }

    if (row) {
        return {
            found: true,
            memberTag: row.member_tag || row.push_name,
            phone: row.phone,
            hasAbsen: !!row.has_absen,
        };
    }
    return { found: false };
}

function computeEligibility(username: string) {
    const p = db.prepare('SELECT has_wa_group FROM giveaway_participants WHERE username = ?').get(username) as { has_wa_group: number } | undefined;
    if (!p) return;

    // SYARAT MUTLAK: Wajib memiliki Member Tag Username TikTok & sudah mengetik ABSEN di grup WhatsApp (has_wa_group = 1)
    const eligible = p.has_wa_group ? 1 : 0;

    db.prepare(`UPDATE giveaway_participants SET is_eligible = ?, last_updated = datetime('now') WHERE username = ?`).run(eligible, username);
}

export function recomputeAllEligibility() {
    const participants = db.prepare('SELECT username FROM giveaway_participants').all() as { username: string }[];
    for (const p of participants) {
        computeEligibility(p.username);
    }
}

export function syncParticipantWaStatus(username: string) {
    const waCheck = checkUserInWaGroup(username);
    const isValidWa = waCheck.found && waCheck.hasAbsen;
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
    computeEligibility(username);
}

export function syncAllParticipantsWithWa() {
    // 1. Ambil semua member WA yang sudah absen di grup
    const targetGroup = getTargetWaGroup();
    let query = 'SELECT * FROM wa_group_members WHERE has_absen = 1';
    const params: any[] = [];
    if (targetGroup) {
        query += ' AND group_jid = ?';
        params.push(targetGroup);
    }
    const absenMembers = db.prepare(query).all(...params) as WaMemberRecord[];

    for (const m of absenMembers) {
        const cleanTag = (m.member_tag || '').replace(/^@/, '').trim();
        const username = cleanTag || (m.push_name ? m.push_name.trim() : m.phone);
        const displayName = m.push_name || username;

        if (username) {
            db.prepare(`
                INSERT INTO giveaway_participants (username, nickname, has_followed, has_shared, has_commented, has_wa_group, wa_member_tag, wa_phone, is_eligible, is_tester, last_updated)
                VALUES (?, ?, 1, 1, 1, 1, ?, ?, 1, 0, datetime('now'))
                ON CONFLICT(username) DO UPDATE SET
                    nickname = COALESCE(NULLIF(excluded.nickname, ''), giveaway_participants.nickname),
                    has_followed = 1,
                    has_shared = 1,
                    has_commented = 1,
                    has_wa_group = 1,
                    is_eligible = 1,
                    wa_member_tag = COALESCE(NULLIF(excluded.wa_member_tag, ''), giveaway_participants.wa_member_tag),
                    wa_phone = excluded.wa_phone,
                    last_updated = datetime('now')
            `).run(username, displayName, cleanTag || username, m.phone);
        }
    }

    // 2. Sinkronkan semua peserta real yang sudah terdaftar
    const participants = db.prepare('SELECT username FROM giveaway_participants WHERE is_tester = 0').all() as { username: string }[];
    for (const p of participants) {
        syncParticipantWaStatus(p.username);
    }
}

export function updateGiveawayFollow(username: string, nickname: string, profilePicture?: string) {
    const waCheck = checkUserInWaGroup(username);
    const isValidWa = waCheck.found && waCheck.hasAbsen ? 1 : 0;
    db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, profile_picture, has_followed, has_wa_group, wa_member_tag, wa_phone, is_tester, last_updated)
        VALUES (?, ?, ?, 1, ?, ?, ?, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
            nickname = excluded.nickname,
            profile_picture = COALESCE(excluded.profile_picture, profile_picture),
            has_followed = 1,
            has_wa_group = CASE WHEN excluded.has_wa_group = 1 THEN 1 ELSE giveaway_participants.has_wa_group END,
            wa_member_tag = COALESCE(excluded.wa_member_tag, giveaway_participants.wa_member_tag),
            wa_phone = COALESCE(excluded.wa_phone, giveaway_participants.wa_phone),
            last_updated = datetime('now')
    `).run(username, nickname, profilePicture || null, isValidWa, waCheck.memberTag || null, waCheck.phone || null);
    computeEligibility(username);
}

export function updateGiveawayShare(username: string, nickname: string, profilePicture?: string) {
    const waCheck = checkUserInWaGroup(username);
    const isValidWa = waCheck.found && waCheck.hasAbsen ? 1 : 0;
    db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, profile_picture, has_shared, has_wa_group, wa_member_tag, wa_phone, is_tester, last_updated)
        VALUES (?, ?, ?, 1, ?, ?, ?, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
            nickname = excluded.nickname,
            profile_picture = COALESCE(excluded.profile_picture, profile_picture),
            has_shared = 1,
            has_wa_group = CASE WHEN excluded.has_wa_group = 1 THEN 1 ELSE giveaway_participants.has_wa_group END,
            wa_member_tag = COALESCE(excluded.wa_member_tag, giveaway_participants.wa_member_tag),
            wa_phone = COALESCE(excluded.wa_phone, giveaway_participants.wa_phone),
            last_updated = datetime('now')
    `).run(username, nickname, profilePicture || null, isValidWa, waCheck.memberTag || null, waCheck.phone || null);
    computeEligibility(username);
}

export function updateGiveawayComment(username: string, nickname: string, profilePicture?: string) {
    const waCheck = checkUserInWaGroup(username);
    const isValidWa = waCheck.found && waCheck.hasAbsen ? 1 : 0;
    db.prepare(`
        INSERT INTO giveaway_participants (username, nickname, profile_picture, has_commented, has_wa_group, wa_member_tag, wa_phone, is_tester, last_updated)
        VALUES (?, ?, ?, 1, ?, ?, ?, 0, datetime('now'))
        ON CONFLICT(username) DO UPDATE SET
            nickname = excluded.nickname,
            profile_picture = COALESCE(excluded.profile_picture, profile_picture),
            has_commented = 1,
            has_wa_group = CASE WHEN excluded.has_wa_group = 1 THEN 1 ELSE giveaway_participants.has_wa_group END,
            wa_member_tag = COALESCE(excluded.wa_member_tag, giveaway_participants.wa_member_tag),
            wa_phone = COALESCE(excluded.wa_phone, giveaway_participants.wa_phone),
            last_updated = datetime('now')
    `).run(username, nickname, profilePicture || null, isValidWa, waCheck.memberTag || null, waCheck.phone || null);
    computeEligibility(username);
}

// ── Real participants (is_tester = 0) ──────────────────────────────
export function getRealParticipants(): GiveawayParticipant[] {
    return db.prepare('SELECT * FROM giveaway_participants WHERE is_tester = 0 ORDER BY last_updated DESC').all() as GiveawayParticipant[];
}

export function getEligibleRealParticipants(): GiveawayParticipant[] {
    return db.prepare('SELECT * FROM giveaway_participants WHERE is_eligible = 1 AND is_tester = 0 ORDER BY registered_at ASC').all() as GiveawayParticipant[];
}

export function resetRealGiveawayData() {
    db.prepare('DELETE FROM giveaway_participants WHERE is_tester = 0').run();
}

// ── Tester participants (is_tester = 1) ───────────────────────────
export function getTesterParticipants(): GiveawayParticipant[] {
    return db.prepare('SELECT * FROM giveaway_participants WHERE is_tester = 1 ORDER BY last_updated DESC').all() as GiveawayParticipant[];
}

export function getEligibleTesterParticipants(): GiveawayParticipant[] {
    return db.prepare('SELECT * FROM giveaway_participants WHERE is_eligible = 1 AND is_tester = 1 ORDER BY registered_at ASC').all() as GiveawayParticipant[];
}

export function addGiveawayTester(username: string, nickname: string) {
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
}

export function resetTesterData() {
    db.prepare('DELETE FROM giveaway_participants WHERE is_tester = 1').run();
}

// ── Generic ──────────────────────────────────────────────────────
export function removeGiveawayParticipant(username: string) {
    db.prepare('DELETE FROM giveaway_participants WHERE username = ?').run(username);
}

export function resetGiveawayData() {
    db.prepare('DELETE FROM giveaway_participants').run();
}

// Legacy aliases kept for compatibility
export function getGiveawayParticipants(): GiveawayParticipant[] {
    return db.prepare('SELECT * FROM giveaway_participants ORDER BY last_updated DESC').all() as GiveawayParticipant[];
}

export function getEligibleParticipants(): GiveawayParticipant[] {
    return db.prepare('SELECT * FROM giveaway_participants WHERE is_eligible = 1 ORDER BY registered_at ASC').all() as GiveawayParticipant[];
}

export function toggleGiveawayRequirement(username: string, field: 'has_followed' | 'has_shared' | 'has_commented' | 'has_wa_group', value: number) {
    db.prepare(`
        UPDATE giveaway_participants 
        SET ${field} = ?, last_updated = datetime('now') 
        WHERE username = ?
    `).run(value, username);
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
export interface WaMemberRecord {
    group_jid: string;
    jid: string;
    phone: string;
    member_tag: string;
    push_name: string;
    role?: string;
}

export function saveWaGroupMembers(members: WaMemberRecord[]) {
    const insertStmt = db.prepare(`
        INSERT INTO wa_group_members (group_jid, jid, phone, member_tag, push_name, role, last_seen)
        VALUES (@group_jid, @jid, @phone, @member_tag, @push_name, @role, datetime('now'))
        ON CONFLICT(group_jid, jid) DO UPDATE SET
            phone = excluded.phone,
            member_tag = COALESCE(NULLIF(excluded.member_tag, ''), wa_group_members.member_tag),
            push_name = COALESCE(NULLIF(excluded.push_name, ''), wa_group_members.push_name),
            role = COALESCE(NULLIF(excluded.role, ''), wa_group_members.role),
            last_seen = datetime('now')
    `);

    const insertMany = db.transaction((items: WaMemberRecord[]) => {
        for (const item of items) {
            insertStmt.run(item);
        }
    });

    insertMany(members);
    // After saving WA members, automatically re-sync participants status
    syncAllParticipantsWithWa();
}

export function getWaGroupMembers(groupJid?: string): WaMemberRecord[] {
    if (groupJid) {
        return db.prepare('SELECT * FROM wa_group_members WHERE group_jid = ? ORDER BY member_tag ASC, push_name ASC').all(groupJid) as WaMemberRecord[];
    }
    return db.prepare('SELECT * FROM wa_group_members ORDER BY last_seen DESC').all() as WaMemberRecord[];
}

export function clearWaGroupMembers(groupJid?: string) {
    if (groupJid) {
        db.prepare('DELETE FROM wa_group_members WHERE group_jid = ?').run(groupJid);
    } else {
        db.prepare('DELETE FROM wa_group_members').run();
    }
    syncAllParticipantsWithWa();
}

export function getDuplicateUsernames(groupJid?: string): { member_tag: string; count: number; members: WaMemberRecord[] }[] {
    const targetGroup = groupJid || getTargetWaGroup();
    let query = `
        SELECT LOWER(TRIM(REPLACE(member_tag, '@', ''))) as clean_tag, COUNT(*) as count
        FROM wa_group_members
        WHERE member_tag IS NOT NULL AND TRIM(member_tag) != ''
    `;
    const params: any[] = [];
    if (targetGroup) {
        query += ` AND group_jid = ?`;
        params.push(targetGroup);
    }
    query += ` GROUP BY clean_tag HAVING count > 1`;

    const dupRows = db.prepare(query).all(...params) as { clean_tag: string; count: number }[];
    return dupRows.map(row => {
        let mQuery = `
            SELECT * FROM wa_group_members 
            WHERE LOWER(TRIM(REPLACE(member_tag, '@', ''))) = ?
        `;
        const mParams: any[] = [row.clean_tag];
        if (targetGroup) {
            mQuery += ` AND group_jid = ?`;
            mParams.push(targetGroup);
        }
        const members = db.prepare(mQuery).all(...mParams) as WaMemberRecord[];
        return {
            member_tag: row.clean_tag,
            count: row.count,
            members,
        };
    });
}
