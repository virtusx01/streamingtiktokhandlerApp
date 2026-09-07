const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const SUPABASE_URL = 'https://msrbonxwkcuiyezmldzj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zcmJvbnh3a2N1aXllem1sZHpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc2MDU4MiwiZXhwIjoyMTA0MzM2NTgyfQ.9JVU5bAZbvHzI01VwFzZBsQvjSOCzCcg48KuEIKA3gM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const dbPath = path.join(__dirname, '..', 'data', 'app.db');
if (!fs.existsSync(dbPath)) {
  console.log('No local app.db found at', dbPath);
  process.exit(0);
}

const sqlite = new Database(dbPath);

async function migrateTable(tableName, primaryKey, transform = null) {
  try {
    const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
    console.log(`\nMigrating ${tableName} (${rows.length} rows)...`);
    if (rows.length === 0) return;

    const transformedRows = transform ? rows.map(transform) : rows;

    const batchSize = 100;
    for (let i = 0; i < transformedRows.length; i += batchSize) {
      const batch = transformedRows.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from(tableName)
        .upsert(batch, { onConflict: primaryKey });
      
      if (error) {
        console.error(`Error migrating batch ${i} of ${tableName}:`, error.message);
      } else {
        process.stdout.write(`  Inserted ${Math.min(i + batchSize, transformedRows.length)} / ${transformedRows.length}\r`);
      }
    }
    console.log(`\n Successfully migrated ${tableName}!`);
  } catch (err) {
    console.error(`Error reading ${tableName}:`, err.message);
  }
}

async function run() {
  console.log('Starting migration from SQLite to Supabase...');

  // 1. settings
  await migrateTable('settings', 'key');

  // 2. rewards
  await migrateTable('rewards', 'name');

  // 3. reward_presets
  await migrateTable('reward_presets', 'name');

  // 4. detected_gifts
  await migrateTable('detected_gifts', 'name', r => ({
    name: r.name,
    count: r.count,
    last_seen: r.last_seen ? new Date(r.last_seen).toISOString() : new Date().toISOString()
  }));

  // 5. user_likes
  await migrateTable('user_likes', 'username', r => ({
    username: r.username,
    nickname: r.nickname,
    total_likes: r.total_likes || 0,
    last_milestone: r.last_milestone || 0,
    last_updated: r.last_updated ? new Date(r.last_updated).toISOString() : new Date().toISOString()
  }));

  // 6. giveaway_participants
  await migrateTable('giveaway_participants', 'username', r => ({
    username: r.username,
    nickname: r.nickname,
    profile_picture: r.profile_picture || null,
    has_followed: r.has_followed || 0,
    has_liked: r.has_liked || 0,
    has_shared: r.has_shared || 0,
    has_commented: r.has_commented || 0,
    has_wa_group: r.has_wa_group || 0,
    wa_member_tag: r.wa_member_tag || null,
    wa_phone: r.wa_phone || null,
    is_eligible: r.is_eligible || 0,
    is_tester: r.is_tester || 0,
    registered_at: r.registered_at ? new Date(r.registered_at).toISOString() : new Date().toISOString(),
    last_updated: r.last_updated ? new Date(r.last_updated).toISOString() : new Date().toISOString()
  }));

  // 7. wa_group_members
  await migrateTable('wa_group_members', 'group_jid, jid', r => ({
    group_jid: r.group_jid,
    jid: r.jid,
    phone: r.phone || null,
    member_tag: r.member_tag || null,
    push_name: r.push_name || null,
    role: r.role || 'member',
    has_absen: r.has_absen || 0,
    absen_at: r.absen_at ? new Date(r.absen_at).toISOString() : null,
    last_seen: r.last_seen ? new Date(r.last_seen).toISOString() : new Date().toISOString()
  }));

  console.log('\n--- ALL TABLES MIGRATED TO SUPABASE SUCCESSFULLY ---');
}

run();
