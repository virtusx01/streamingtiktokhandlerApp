const Database = require('better-sqlite3');
const db = new Database('./data/app.db');

const memberTag = 'ilvy0uv';
const pushName = 'Sayang 💕';
const phone = 'Sayang';
const groupJid = '120363409436448923@g.us';
const jid = 'ilvy0uv@s.whatsapp.net';

db.prepare(`
    INSERT INTO wa_group_members (group_jid, jid, phone, member_tag, push_name, role, has_absen, absen_at, last_seen)
    VALUES (?, ?, ?, ?, ?, 'member', 1, datetime('now'), datetime('now'))
    ON CONFLICT(group_jid, jid) DO UPDATE SET
        member_tag = excluded.member_tag,
        push_name = excluded.push_name,
        has_absen = 1,
        absen_at = datetime('now'),
        last_seen = datetime('now')
`).run(groupJid, jid, phone, memberTag, pushName);

db.prepare(`
    INSERT INTO giveaway_participants (username, nickname, has_followed, has_shared, has_commented, has_wa_group, wa_member_tag, wa_phone, is_eligible, is_tester, last_updated)
    VALUES (?, ?, 1, 1, 1, 1, ?, ?, 1, 0, datetime('now'))
    ON CONFLICT(username) DO UPDATE SET
        has_followed = 1,
        has_shared = 1,
        has_commented = 1,
        has_wa_group = 1,
        wa_member_tag = excluded.wa_member_tag,
        wa_phone = excluded.wa_phone,
        is_eligible = 1,
        is_tester = 0,
        last_updated = datetime('now')
`).run(memberTag, pushName, memberTag, phone);

console.log('Real participants now:');
console.log(db.prepare('SELECT * FROM giveaway_participants WHERE is_tester = 0').all());
