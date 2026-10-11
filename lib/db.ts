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
  `);

  db.exec(`
    DROP TABLE IF EXISTS giveaway_participants;
    DROP TABLE IF EXISTS wa_group_members;
    DELETE FROM settings WHERE key LIKE 'giveaway_%';
  `);

  try {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('lastMilestonePerformed', '0')
      ON CONFLICT(key) DO NOTHING
    `).run();
  } catch {}

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
