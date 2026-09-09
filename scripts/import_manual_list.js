const Database = require('better-sqlite3');
const db = new Database('./data/app.db');

const list = [
  '+62 831-4071-6257',
  '+62 821-6475-1918',
  '+62 838-1473-6245',
  '+62 815-1413-0997',
  '+62 853-1283-4898',
  '+62 878-0576-2442',
  '+62 895-3521-73090',
  '+62 851-3776-0147',
  '+62 812-5166-8233',
  '+62 855-3657-6658',
  '+62 857-8742-6546',
  '+62 858-9501-5942',
  '+62 897-9044-577',
  'leon',
  'redplek',
  '+62 851-8939-5200',
  '+62 813-8007-5294',
  'Kirei',
  '+62 857-0354-2511',
  '+62 812-3058-9103',
  '+62 895-1832-3022',
  '+62 859-6431-8961',
  '+62 831-6616-9809',
  '+62 895-1717-8975',
  '+62 812-9580-5975',
  '+62 858-6568-7335',
  '+62 822-6115-3752',
  '+62 895-1078-0303',
  'Lecii ValoM',
  '+62 877-1850-1820',
  '+62 821-3115-9611',
  '+62 857-4239-4112',
  '+62 897-6781-185',
  '+62 853-3332-9892',
  '+62 823-5201-3282',
  '+62 856-9172-7420',
  '+62 878-9423-4451',
  '+62 813-2107-498',
  '+62 812-5244-7410',
  '+62 895-3044-0838',
  '+62 859-7177-5419',
  '+62 812-1633-7009',
  '+62 852-2715-4478',
  '+62 821-2281-4017',
  '+62 838-3926-9525',
  '+62 895-2678-8636',
  'Nextaro',
  '+62 838-4443-0190',
  '+62 856-5744-5576',
  '+62 882-3920-1656',
  '+62 889-8078-8204',
  '+62 895-3376-80936',
  '+60 11-5556 0385'
];

function isPhone(str) {
  const nonNum = str.replace(/[0-9+\s\-().]/g, '');
  const digits = str.replace(/\D/g, '');
  return nonNum.length === 0 && digits.length >= 7;
}

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('08') && digits.length >= 9) {
    return '628' + digits.slice(2);
  }
  return digits;
}

// 6 nomor pertama dan 3 angka terakhir: 628898****204
function maskPhone(digits) {
  if (digits.length <= 8) return digits;
  return digits.slice(0, 6) + '****' + digits.slice(-3);
}

const existing = db.prepare('SELECT username, nickname, wa_phone, wa_member_tag FROM giveaway_participants WHERE is_tester = 0').all();
const waMembers = db.prepare('SELECT phone, push_name, member_tag FROM wa_group_members').all();

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

console.log('Processing list into database...');

let inserted = 0;
let updated = 0;

for (const item of list) {
  const trimmed = item.trim();
  if (isPhone(trimmed)) {
    const digits = normalizePhone(trimmed);
    const last10 = digits.slice(-10);
    const phoneFormatted = '+' + digits;
    const masked = maskPhone(digits);

    // Cek apakah ada di existing
    const match = existing.find(e => {
      const eDigits = (e.wa_phone || '').replace(/\D/g, '');
      return (eDigits && (eDigits === digits || eDigits.endsWith(digits.slice(-8)) || digits.endsWith(eDigits.slice(-8)))) ||
             e.username === 'wa_' + last10;
    });

    // Cek apakah ada member_tag di wa_group_members
    const memberRecord = waMembers.find(m => {
      const mDigits = (m.phone || '').replace(/\D/g, '');
      return mDigits && (mDigits === digits || mDigits.endsWith(digits.slice(-8)) || digits.endsWith(mDigits.slice(-8)));
    });
    const memberTag = memberRecord?.member_tag || null;

    if (match) {
      // Pertahankan nickname asli yang sudah ada jika bukan nomor HP mentah
      const isMatchNickPhone = /^[+\d\s\-().]{7,}$/.test(match.nickname.trim());
      const finalNick = (!isMatchNickPhone && match.nickname) ? match.nickname : masked;
      insertStmt.run(match.username, finalNick, memberTag, phoneFormatted);
      updated++;
      console.log(`[UPDATE] ${match.username}: "${finalNick}" (${phoneFormatted})`);
    } else {
      const uid = 'wa_' + last10;
      insertStmt.run(uid, masked, memberTag, phoneFormatted);
      inserted++;
      console.log(`[INSERT] ${uid}: "${masked}" (${phoneFormatted})`);
    }
  } else {
    // Contact Name (leon, redplek, Kirei, Lecii ValoM, Nextaro)
    const match = existing.find(e => {
      const eNick = (e.nickname || '').toLowerCase();
      const eTag = (e.wa_member_tag || '').toLowerCase();
      const cleanItem = trimmed.toLowerCase();
      return eNick === cleanItem || eTag === cleanItem || e.username === 'wa_' + cleanItem.replace(/[^a-z0-9]/g, '');
    });

    const memberRecord = waMembers.find(m => {
      const mPush = (m.push_name || '').toLowerCase();
      const mTag = (m.member_tag || '').toLowerCase();
      const cleanItem = trimmed.toLowerCase();
      return mPush === cleanItem || mTag === cleanItem;
    });
    const memberTag = memberRecord?.member_tag || null;
    const memberPhone = memberRecord?.phone || null;

    if (match) {
      insertStmt.run(match.username, trimmed, memberTag, memberPhone);
      updated++;
      console.log(`[UPDATE CONTACT] ${match.username}: "${trimmed}"`);
    } else {
      const uid = 'wa_' + trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
      insertStmt.run(uid, trimmed, memberTag, memberPhone);
      inserted++;
      console.log(`[INSERT CONTACT] ${uid}: "${trimmed}"`);
    }
  }
}

const totalReal = db.prepare('SELECT COUNT(*) as count FROM giveaway_participants WHERE is_tester = 0').get().count;
console.log(`\nSuccessfully processed! Inserted: ${inserted}, Updated: ${updated}, Total Real Participants in DB: ${totalReal}`);
