const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('C:/.TiktokScrcpyApp/data/app.db');

const before = db.prepare('SELECT COUNT(*) as cnt FROM giveaway_participants WHERE is_tester = 0').get();
console.log('Before cleanup (real):', before.cnt);

// Hapus entri lama yang bukan format wa_*
const result = db.prepare("DELETE FROM giveaway_participants WHERE is_tester = 0 AND username NOT LIKE 'wa_%'").run();
console.log('Deleted old-format records:', result.changes);

const after = db.prepare('SELECT COUNT(*) as cnt FROM giveaway_participants WHERE is_tester = 0').get();
console.log('After cleanup (real):', after.cnt);

// Ambil semua member yang has_absen = 1
const absenMembers = db.prepare('SELECT jid, phone, member_tag, push_name FROM wa_group_members WHERE has_absen = 1').all();
console.log('\nAbsen members to re-sync:', absenMembers.length);

const insertStmt = db.prepare(`
  INSERT INTO giveaway_participants (
    username, nickname, has_followed, has_shared, has_commented, 
    has_wa_group, wa_member_tag, wa_phone, is_eligible, is_tester, last_updated
  ) VALUES (?, ?, 1, 1, 1, 1, ?, ?, 1, 0, datetime('now'))
  ON CONFLICT(username) DO UPDATE SET 
    nickname = excluded.nickname, 
    has_wa_group = 1, 
    is_eligible = 1, 
    wa_member_tag = COALESCE(NULLIF(excluded.wa_member_tag, ''), giveaway_participants.wa_member_tag), 
    wa_phone = COALESCE(NULLIF(excluded.wa_phone, ''), giveaway_participants.wa_phone), 
    last_updated = datetime('now')
`);

let added = 0;
for (const m of absenMembers) {
  const phoneDigits = (m.phone || '').replace(/\D/g, '') || (m.jid || '').split('@')[0].replace(/\D/g, '');
  const last4 = phoneDigits ? phoneDigits.slice(-4) : '';
  const cleanPush = m.push_name ? m.push_name.replace(/^~/, '').trim() : '';
  
  const displayName = cleanPush
    ? (last4 ? `${cleanPush} ·${last4}` : cleanPush)
    : (last4 ? `Peserta ·${last4}` : 'Peserta');
  
  const uid = phoneDigits 
    ? `wa_${phoneDigits.slice(-10)}` 
    : `wa_${(m.jid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
  
  const rawTag = (m.member_tag || '').replace(/^@/, '').trim().toLowerCase() || null;
  const waPhone = phoneDigits ? `+${phoneDigits}` : (m.phone || null);
  
  try {
    insertStmt.run(uid, displayName, rawTag, waPhone);
    added++;
  } catch (e) {
    console.error(`  Error adding ${uid}:`, e.message);
  }
}

console.log(`\nRe-sync complete! ${added} participants added/updated.`);

const finalPool = db.prepare('SELECT username, nickname, wa_phone, wa_member_tag FROM giveaway_participants WHERE is_tester = 0 ORDER BY last_updated DESC').all();
console.log(`\n=== Final Pool (${finalPool.length} participants) ===`);
finalPool.forEach(p => {
  console.log(`  ${p.username} | "${p.nickname}" | phone: ${p.wa_phone} | tag: ${p.wa_member_tag}`);
});
