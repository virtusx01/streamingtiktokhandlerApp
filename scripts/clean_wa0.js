const Database = require('better-sqlite3');
const db = new Database('C:/.TiktokScrcpyApp/data/app.db');

// Hapus peserta dummy wa_0
db.prepare("DELETE FROM giveaway_participants WHERE username = 'wa_0'").run();
db.prepare("DELETE FROM wa_group_members WHERE phone = '0' OR jid LIKE '%@lid'").run();

const participants = db.prepare('SELECT username, nickname, wa_phone, wa_member_tag FROM giveaway_participants WHERE is_tester = 0 ORDER BY nickname ASC').all();
console.log(`Total real participants: ${participants.length}`);
participants.forEach((p, idx) => {
  console.log(`${idx + 1}. [${p.nickname}] | No: ${p.wa_phone} | Tag: ${p.wa_member_tag || '-'}`);
});
