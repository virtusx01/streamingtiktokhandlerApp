const Database = require('better-sqlite3');
const db = new Database('./data/app.db');

function maskPhone(phone) {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('08') && digits.length >= 9) {
    digits = '628' + digits.slice(2);
  }
  if (digits.length <= 7) return digits;
  const prefix = digits.slice(0, 5);
  const suffix = digits.slice(-3);
  return `${prefix}****${suffix}`;
}

const participants = db.prepare("SELECT username, nickname, wa_phone FROM giveaway_participants WHERE username LIKE 'wa_%'").all();
console.log('Total wa participants:', participants.length);

const updateStmt = db.prepare('UPDATE giveaway_participants SET nickname = ? WHERE username = ?');

for (const p of participants) {
  let nick = (p.nickname || '').trim();
  // Strip trailing ·XXXX if present
  nick = nick.replace(/\s*·\d{4}$/, '').trim();
  
  // Cek apakah nick adalah nomor HP
  const isPhone = /^[+\d\s\-().]{7,}$/.test(nick);
  if (isPhone || !nick) {
    nick = maskPhone(p.wa_phone || p.username.replace('wa_', ''));
  }
  
  updateStmt.run(nick, p.username);
  console.log(p.username, '->', nick);
}
console.log('Done cleaning participants!');
