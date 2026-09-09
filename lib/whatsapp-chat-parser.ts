import {
  getWaGroupMembers,
  saveWaGroupMembers,
  getTargetWaGroup,
  syncAllParticipantsWithWa,
  getRealParticipants,
  addGiveawayParticipant,
  isWithinAbsenPeriod,
  WaMemberRecord,
} from './db';
import { extractMemberTagFromMessage, isValidTikTokUsername } from './whatsapp';

export interface ParsedChatMessage {
  dateStr: string;
  timeStr: string;
  timestamp: Date | null;
  timestampIso: string;
  sender: string;
  text: string;
  rawLine: string;
}

export interface ImportAbsenItemResult {
  sender: string;
  senderType: 'phone' | 'contact_name';
  phone: string;
  matchedMemberName: string;
  memberTag: string;
  isValidTag: boolean;
  messageText: string;
  timestampIso: string;
  status: 'VERIFIED' | 'TAG_MISSING' | 'INVALID_TAG';
  notes: string;
}

export interface ImportChatResult {
  success: boolean;
  totalLines: number;
  totalMessages: number;
  totalAbsenDetected: number;
  matchedWithGroupCount: number;
  newlyVerifiedCount: number;
  missingTagCount: number;
  invalidTagCount: number;
  results: ImportAbsenItemResult[];
  message: string;
}

/**
 * Bersihkan karakter tak terlihat (Unicode invisible characters, LRM, RLM, BOM, dsb.)
 */
export function cleanInvisibleChars(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u200E\u200F\u200B\u200C\u200D\u202A-\u202E\uFEFF]/g, '')
    .replace(/[\u202F\u00A0]/g, ' ')
    .trim();
}

/**
 * Normalisasi nomor HP:
 * +62 878-0576-2442 -> 6287805762442
 * 0812-3456-7890 -> 6281234567890
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('08') && digits.length >= 9) {
    return '628' + digits.slice(2);
  }
  return digits;
}

/**
 * Cek apakah string adalah nomor telepon (bukan nama kontak)
 */
export function isPhoneNumber(sender: string): boolean {
  if (!sender) return false;
  // Hapus karakter nomor umum (+, -, spasi, tanda kurung)
  const nonNum = sender.replace(/[0-9+\s\-().]/g, '');
  // Jika tidak ada huruf alfabet dan memiliki minimal 7 digit, anggap ini nomor telepon
  const digits = sender.replace(/\D/g, '');
  return nonNum.length === 0 && digits.length >= 7;
}

/**
 * Parsing waktu WhatsApp ke Date object
 * Format yang didukung:
 * 9/8/26, 4:36 PM
 * 08/09/2026, 16.36
 * 08/09/26, 16:36:12
 * 2026-09-08, 16:36
 */
export function parseWaTimestamp(dateStr: string, timeStr: string): Date | null {
  try {
    const cleanDate = dateStr.trim();
    const cleanTime = timeStr.trim();

    // Parse jam dan menit
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    const isPm = /pm/i.test(cleanTime);
    const isAm = /am/i.test(cleanTime);
    const timeDigitsMatch = cleanTime.replace(/[ap]m/i, '').trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/);

    if (timeDigitsMatch) {
      hours = parseInt(timeDigitsMatch[1], 10);
      minutes = parseInt(timeDigitsMatch[2], 10);
      seconds = timeDigitsMatch[3] ? parseInt(timeDigitsMatch[3], 10) : 0;

      if (isPm && hours < 12) hours += 12;
      if (isAm && hours === 12) hours = 0;
    }

    // Parse tanggal: M/D/YY atau D/M/YYYY atau YYYY-MM-DD
    const parts = cleanDate.split(/[/\-.]/).map(p => parseInt(p, 10));
    if (parts.length === 3) {
      let year = parts[2];
      let month = parts[0] - 1; // Default US: M/D/Y
      let day = parts[1];

      // Jika bagian pertama adalah 4 digit: YYYY-MM-DD
      if (parts[0] > 1000) {
        year = parts[0];
        month = parts[1] - 1;
        day = parts[2];
      } else if (parts[2] < 100) {
        // 2 digit year: 26 -> 2026
        year = 2000 + parts[2];
      }

      // Jika day > 12 dan month <= 12, maka formatnya D/M/Y (format umum di Indonesia)
      if (parts[0] > 12 && parts[1] <= 12) {
        day = parts[0];
        month = parts[1] - 1;
      }

      const d = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {}
  return null;
}

/**
 * Regex utama untuk mencocokkan awal baris pesan WhatsApp
 * Contoh:
 * 9/8/26, 4:36 PM - +62 878-0576-2442: ABSEN
 * 9/8/26, 4:36 PM - Kirei: ABSEN
 * [08/09/2026 16.36] Bal: ABSEN
 */
const REGEX_WA_CHAT = /^\[?(\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}),?\s+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s*[APap][Mm])?)\]?\s*(?:-\s*)?([^:]+?):\s*([\s\S]*)$/;

/**
 * Parsing teks chat WhatsApp utuh menjadi deretan pesan terstruktur
 */
export function parseWaChatText(rawText: string): ParsedChatMessage[] {
  if (!rawText) return [];
  const lines = rawText.split(/\r?\n/);
  const messages: ParsedChatMessage[] = [];

  for (const rawLine of lines) {
    const cleaned = cleanInvisibleChars(rawLine);
    if (!cleaned) continue;

    const match = cleaned.match(REGEX_WA_CHAT);
    if (match) {
      const dateStr = match[1];
      const timeStr = match[2];
      const sender = match[3].trim();
      const text = match[4].trim();
      const timestamp = parseWaTimestamp(dateStr, timeStr);

      messages.push({
        dateStr,
        timeStr,
        timestamp,
        timestampIso: timestamp ? timestamp.toISOString() : new Date().toISOString(),
        sender,
        text,
        rawLine: cleaned,
      });
    } else if (messages.length > 0) {
      // Baris kelanjutan dari pesan sebelumnya (multi-line chat)
      messages[messages.length - 1].text += '\n' + cleaned;
    }
  }

  return messages;
}

/**
 * Cek apakah isi chat mengandung kata ABSEN
 */
export function isAbsenMessage(text: string): boolean {
  if (!text) return false;
  return (
    /(?:^|[^a-zA-Z0-9])(absen|hadir|ikutan)(?:$|[^a-zA-Z0-9])/i.test(text) ||
    /^[!#/]absen/i.test(text)
  );
}

/**
 * Proses import chat WhatsApp:
 * 1. Baca semua baris chat
 * 2. Filter yang berisi kata ABSEN
 * 3. Cocokkan pengirim (nomor HP atau nama kontak) ke daftar member grup
 * 4. Periksa dan validasi Member Tag (username TikTok)
 * 5. Update database wa_group_members dan sinkronkan ke giveaway_participants
 */
export function processImportedChat(
  chatText: string,
  targetGroupJid?: string,
  options: { enforceDateFilter?: boolean } = {}
): ImportChatResult {
  const targetGroup = targetGroupJid || getTargetWaGroup() || '120363409436448923@g.us';
  const groupMembers = getWaGroupMembers(targetGroup);
  const existingParticipants = getRealParticipants();
  const knownUsernames = existingParticipants.map(p => p.username.toLowerCase());

  const parsedMessages = parseWaChatText(chatText);
  const totalLines = chatText.split(/\r?\n/).length;

  // Lacak pengirim unik agar tidak dobel proses jika seseorang ketik ABSEN berkali-kali
  const processedSenders = new Set<string>();
  const results: ImportAbsenItemResult[] = [];
  const membersToSave: WaMemberRecord[] = [];

  let totalAbsenDetected = 0;
  let matchedWithGroupCount = 0;
  let newlyVerifiedCount = 0;
  let missingTagCount = 0;
  let invalidTagCount = 0;

  for (const msg of parsedMessages) {
    if (!isAbsenMessage(msg.text)) continue;

    // Filter tanggal jika opsi diaktifkan
    if (options.enforceDateFilter && msg.timestamp) {
      if (!isWithinAbsenPeriod(msg.timestamp)) {
        continue;
      }
    }

    totalAbsenDetected++;

    const rawSender = msg.sender.trim();
    const senderKey = rawSender.toLowerCase();
    if (processedSenders.has(senderKey)) {
      // Sudah diproses dari pesan sebelumnya dalam file yang sama
      continue;
    }
    processedSenders.add(senderKey);

    const isPhone = isPhoneNumber(rawSender);
    const normalizedPhone = isPhone ? normalizePhoneNumber(rawSender) : '';
    const senderDigits = isPhone ? rawSender.replace(/\D/g, '') : '';
    const contactName = !isPhone ? rawSender.replace(/^[~@]/, '').trim() : '';

    // 1. CARI PENGIRIM DI DALAM MEMBER GRUP WHATSAPP
    let matchedMember: WaMemberRecord | undefined;

    if (isPhone && normalizedPhone) {
      // Cocokkan berdasarkan nomor telepon (strip non-digit dan cocokkan akhiran digit nomor telepon)
      const normDigits = normalizedPhone.replace(/\D/g, '');
      matchedMember = groupMembers.find(m => {
        const mPhone = (m.phone || '').replace(/\D/g, '');
        const mJid = (m.jid || '').replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0].replace(/\D/g, '');
        if (!mPhone && !mJid) return false;
        if (mPhone === normDigits || mJid === normDigits) return true;
        if (normDigits.length >= 8) {
          if (mPhone && (mPhone.endsWith(normDigits.slice(-8)) || normDigits.endsWith(mPhone.slice(-8)))) return true;
          if (mJid && !mJid.endsWith('@lid') && (mJid.endsWith(normDigits.slice(-8)) || normDigits.endsWith(mJid.slice(-8)))) return true;
        }
        return false;
      });
    } else if (contactName) {
      // Cocokkan berdasarkan nama kontak / push_name
      const cleanContact = contactName.toLowerCase();
      const cleanAlpha = cleanContact.replace(/[^a-z0-9]/g, '');

      // 1. Coba exact match push_name, phone, atau member_tag
      matchedMember = groupMembers.find(m => {
        const mPush = (m.push_name || '').replace(/^[~@]/, '').trim().toLowerCase();
        const mTag = (m.member_tag || '').replace(/^@/, '').trim().toLowerCase();
        return mPush === cleanContact || mTag === cleanContact;
      });

      // 2. Coba strip emoji / non-alphanumeric match
      if (!matchedMember && cleanAlpha && cleanAlpha.length >= 2) {
        matchedMember = groupMembers.find(m => {
          const mPushAlpha = (m.push_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const mTagAlpha = (m.member_tag || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          return mPushAlpha === cleanAlpha || mTagAlpha === cleanAlpha;
        });
      }

      // 3. Coba substring match jika nama cukup panjang
      if (!matchedMember && cleanAlpha && cleanAlpha.length >= 3) {
        matchedMember = groupMembers.find(m => {
          const mPushAlpha = (m.push_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const mTagAlpha = (m.member_tag || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          return (mPushAlpha && (mPushAlpha.includes(cleanAlpha) || cleanAlpha.includes(mPushAlpha))) ||
                 (mTagAlpha && (mTagAlpha.includes(cleanAlpha) || cleanAlpha.includes(mTagAlpha)));
        });
      }
    }

    if (matchedMember) {
      matchedWithGroupCount++;
    }

    // 2. PERIKSA MEMBER TAG (USERNAME TIKTOK)
    // HANYA DARI DATA GROUP MEMBER WHATSAPP (BUKAN DARI TEKS PESAN CHAT)
    let finalMemberTag = '';

    // A. Ambil member tag resmi yang sudah tersimpan di data grup WhatsApp untuk member ini
    if (matchedMember && matchedMember.member_tag) {
      const existingTag = matchedMember.member_tag.replace(/^@/, '').trim().toLowerCase();
      if (existingTag && !/^\d{10,}$/.test(existingTag) && isValidTikTokUsername(existingTag)) {
        finalMemberTag = existingTag;
      }
    }

    // B. Cek apakah nomor telepon pengirim cocok dengan member grup WhatsApp lain yang memiliki member_tag resmi
    if (!finalMemberTag && (normalizedPhone || matchedMember?.phone)) {
      const targetPhone = (normalizedPhone || matchedMember?.phone || '').replace(/\D/g, '');
      if (targetPhone.length >= 7) {
        const phoneMatchMember = groupMembers.find(m => {
          const mPhone = (m.phone || '').replace(/\D/g, '');
          const mJid = (m.jid || '').split('@')[0].replace(/\D/g, '');
          return (mPhone && (mPhone === targetPhone || mPhone.endsWith(targetPhone.slice(-8)))) ||
                 (mJid && !m.jid.endsWith('@lid') && (mJid === targetPhone || mJid.endsWith(targetPhone.slice(-8))));
        });
        if (phoneMatchMember && phoneMatchMember.member_tag) {
          const cTag = phoneMatchMember.member_tag.replace(/^@/, '').trim().toLowerCase();
          if (isValidTikTokUsername(cTag) && !/^\d{10,}$/.test(cTag)) {
            finalMemberTag = cTag;
          }
        }
      }
    }

    // C. Cek apakah nomor telepon pengirim cocok dengan nomor WA yang terdaftar pada peserta giveaway di database
    if (!finalMemberTag && (normalizedPhone || matchedMember?.phone)) {
      const targetPhone = (normalizedPhone || matchedMember?.phone || '').replace(/\D/g, '');
      if (targetPhone.length >= 7) {
        const matchedParticipant = existingParticipants.find(p => {
          if (!p.wa_phone) return false;
          const pPhone = p.wa_phone.replace(/\D/g, '');
          return pPhone === targetPhone || (pPhone.length >= 8 && (pPhone.endsWith(targetPhone.slice(-8)) || targetPhone.endsWith(pPhone.slice(-8))));
        });
        if (matchedParticipant && isValidTikTokUsername(matchedParticipant.username.toLowerCase())) {
          finalMemberTag = matchedParticipant.username.toLowerCase();
        }
      }
    }

    // 3. VALIDASI MEMBER TAG (Hanya huruf kecil, angka, titik, underscore, tanpa spasi)
    const isValidTag = isValidTikTokUsername(finalMemberTag);
    const resolvedPhone = normalizedPhone || matchedMember?.phone || '';
    const resolvedName = contactName || matchedMember?.push_name || rawSender;

    let itemStatus: 'VERIFIED' | 'TAG_MISSING' | 'INVALID_TAG' = 'TAG_MISSING';
    let notes = '';

    if (isValidTag) {
      itemStatus = 'VERIFIED';
      newlyVerifiedCount++;
      notes = `✓ Terverifikasi! Username TikTok: @${finalMemberTag}`;
    } else if (finalMemberTag) {
      itemStatus = 'INVALID_TAG';
      invalidTagCount++;
      notes = `✗ Tag "@${finalMemberTag}" tidak valid (harus huruf kecil & tanpa spasi)`;
    } else {
      itemStatus = 'TAG_MISSING';
      missingTagCount++;
      notes = `⚠️ Absen tercatat, tetapi Member Tag / Username TikTok belum terisi`;
    }

    // 4. SIMPAN KE WA GROUP MEMBERS DATABASE
    const memberJid = matchedMember?.jid || (
      normalizedPhone
        ? `${normalizedPhone}@s.whatsapp.net`
        : `imported_${contactName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || Date.now()}@s.whatsapp.net`
    );

    const recordToSave: WaMemberRecord = {
      group_jid: targetGroup,
      jid: memberJid,
      phone: resolvedPhone ? (resolvedPhone.startsWith('+') ? resolvedPhone : `+${resolvedPhone}`) : (matchedMember?.phone || ''),
      member_tag: isValidTag ? finalMemberTag : (matchedMember?.member_tag || ''),
      push_name: resolvedName,
      role: matchedMember?.role || 'member',
      has_absen: 1,
      absen_at: msg.timestampIso,
      last_seen: new Date().toISOString(),
    };

    membersToSave.push(recordToSave);

    // 5. JIKA TAG VALID, MASUKKAN LANGSUNG KE PESERTA GIVEAWAY
    if (isValidTag) {
      addGiveawayParticipant(
        finalMemberTag,
        resolvedName || finalMemberTag,
        null,
        1,
        resolvedPhone ? (resolvedPhone.startsWith('+') ? resolvedPhone : `+${resolvedPhone}`) : null,
        finalMemberTag
      );
    }

    results.push({
      sender: rawSender,
      senderType: isPhone ? 'phone' : 'contact_name',
      phone: resolvedPhone,
      matchedMemberName: matchedMember?.push_name || (matchedMember ? 'Grup Member' : '-'),
      memberTag: finalMemberTag,
      isValidTag,
      messageText: msg.text,
      timestampIso: msg.timestampIso,
      status: itemStatus,
      notes,
    });
  }

  // Simpan data semua member yang terdeteksi
  if (membersToSave.length > 0) {
    saveWaGroupMembers(membersToSave);
  }

  // Sinkronkan seluruh data peserta giveaway
  syncAllParticipantsWithWa();

  return {
    success: true,
    totalLines,
    totalMessages: parsedMessages.length,
    totalAbsenDetected,
    matchedWithGroupCount,
    newlyVerifiedCount,
    missingTagCount,
    invalidTagCount,
    results,
    message: `Berhasil memproses ${parsedMessages.length} pesan. ${totalAbsenDetected} absen terdeteksi, ${newlyVerifiedCount} member tag terverifikasi masuk ke giveaway!`,
  };
}

export interface ParsedGroupMemberEntry {
  name: string;
  tag: string;
  phone: string;
  role?: 'admin' | 'member';
}

/**
 * Parsing teks daftar anggota grup WhatsApp dari UI (seperti yang dicopy dari Info Grup WhatsApp Web/Desktop atau format Nama \n Tag \n NoHP)
 * Format yang didukung:
 * 
 * Format 1 (Multi-baris seperti screenshot info anggota grup):
 * Lecii ValoM
 * ramadhan1929
 * 
 * ~?!
 * Okimcats
 * +62 813-2107-498
 * 
 * Format 2 (Satu baris):
 * redplek - nbil2705 - +6281290313162
 * atau: Lecii ValoM: ramadhan1929
 */
export function parseGroupMembersListText(rawText: string): ParsedGroupMemberEntry[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map(l => cleanInvisibleChars(l))
    .filter(l => l.length > 0);

  const entries: ParsedGroupMemberEntry[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Abaikan header grup atau teks bantuan umum
    if (/^(anggota|members|participants|deskripsi grup|group info|keluar dari grup|search|cari)/i.test(line)) {
      i++;
      continue;
    }

    // Cek format 1-baris: "Nama - Tag - NoHP" atau "Nama : Tag" atau "Tag (NoHP)"
    if (line.includes(' - ') || line.includes(' : ') || (line.includes(':') && !line.startsWith('http')) || line.includes('\t')) {
      const parts = line.split(/[-:\t]/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        let name = '';
        let tag = '';
        let phone = '';

        for (const p of parts) {
          if (isPhoneNumber(p)) {
            phone = normalizePhoneNumber(p);
          } else if (isValidTikTokUsername(p.replace(/^@/, '').toLowerCase())) {
            if (!tag) {
              tag = p.replace(/^@/, '').toLowerCase();
            } else if (!name) {
              name = p;
            }
          } else if (!name) {
            name = p;
          }
        }

        if (name || tag || phone) {
          entries.push({
            name: name || tag || phone,
            tag: tag || '',
            phone: phone ? (phone.startsWith('+') ? phone : `+${phone}`) : '',
          });
          i++;
          continue;
        }
      }
    }

    // Format Multi-baris (seperti di screenshot UI Info Grup WhatsApp):
    // Baris 1: Nama Kontak / Nama Profil (misal: "Lecii ValoM", "leon", "Nextaro", "redplek", "~?!", "~.")
    // Baris 2: Member Tag (misal: "ramadhan1929", "leon", "bgtaro", "nbil2705", "Okimcats", "onlynatch")
    // Baris 3 (opsional): Nomor HP (misal: "+62 813-2107-498")
    const line1 = line;
    let line2 = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
    let line3 = (i + 2 < lines.length) ? lines[i + 2].trim() : '';

    const line1IsPhone = isPhoneNumber(line1);
    const line2IsPhone = isPhoneNumber(line2);
    const line3IsPhone = isPhoneNumber(line3);

    let parsedName = '';
    let parsedTag = '';
    let parsedPhone = '';
    let consumedLines = 1;

    if (line1IsPhone) {
      parsedPhone = normalizePhoneNumber(line1);
      if (line2 && !line2IsPhone && isValidTikTokUsername(line2.replace(/^@/, '').toLowerCase())) {
        parsedTag = line2.replace(/^@/, '').toLowerCase();
        consumedLines = 2;
      }
    } else {
      parsedName = line1;
      if (line2) {
        if (line2IsPhone) {
          parsedPhone = normalizePhoneNumber(line2);
          consumedLines = 2;
        } else {
          // Baris 2 kemungkinan besar adalah Member Tag (tepat di bawah nama di UI WhatsApp)
          parsedTag = line2.replace(/^@/, '').trim().toLowerCase();
          consumedLines = 2;

          // Cek apakah baris 3 adalah nomor HP
          if (line3 && line3IsPhone) {
            parsedPhone = normalizePhoneNumber(line3);
            consumedLines = 3;
          }
        }
      }
    }

    if (parsedName || parsedTag || parsedPhone) {
      entries.push({
        name: parsedName || parsedPhone,
        tag: parsedTag,
        phone: parsedPhone ? (parsedPhone.startsWith('+') ? parsedPhone : `+${parsedPhone}`) : '',
      });
      i += consumedLines;
    } else {
      i++;
    }
  }

  return entries;
}

/**
 * Simpan dan perbarui Member Tag dari daftar anggota grup WhatsApp
 */
export function applyParsedGroupMembers(entries: ParsedGroupMemberEntry[], targetGroupJid?: string) {
  const targetGroup = targetGroupJid || getTargetWaGroup() || '120363409436448923@g.us';
  const existingMembers = getWaGroupMembers(targetGroup);
  const membersToSave: WaMemberRecord[] = [];
  let updatedCount = 0;
  let addedCount = 0;

  for (const entry of entries) {
    const cleanTag = (entry.tag || '').replace(/^@/, '').trim().toLowerCase();
    const rawPhone = (entry.phone || '').replace(/\D/g, '');
    const cleanName = (entry.name || '').replace(/^[~@]/, '').trim();

    // Cari member yang cocok di grup berdasarkan nomor HP atau Nama
    let matched = existingMembers.find(m => {
      const mPhone = (m.phone || '').replace(/\D/g, '');
      const mJid = (m.jid || '').split('@')[0].replace(/\D/g, '');
      if (rawPhone && rawPhone.length >= 7) {
        if (mPhone === rawPhone || mJid === rawPhone) return true;
        if (mPhone.endsWith(rawPhone.slice(-8)) || rawPhone.endsWith(mPhone.slice(-8))) return true;
      }
      return false;
    });

    if (!matched && cleanName) {
      const cleanAlpha = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
      matched = existingMembers.find(m => {
        const mPush = (m.push_name || '').replace(/^[~@]/, '').trim().toLowerCase();
        if (mPush === cleanName.toLowerCase()) return true;
        if (cleanAlpha && cleanAlpha.length >= 2) {
          const mAlpha = mPush.replace(/[^a-z0-9]/g, '');
          if (mAlpha === cleanAlpha) return true;
        }
        return false;
      });
    }

    const jid = matched?.jid || (
      rawPhone
        ? `${rawPhone}@s.whatsapp.net`
        : `member_${cleanTag || cleanName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || Date.now()}@s.whatsapp.net`
    );

    const record: WaMemberRecord = {
      group_jid: targetGroup,
      jid,
      phone: entry.phone || matched?.phone || (rawPhone ? `+${rawPhone}` : ''),
      member_tag: cleanTag || matched?.member_tag || '',
      push_name: cleanName || matched?.push_name || '',
      role: matched?.role || 'member',
      has_absen: matched?.has_absen || 0,
      absen_at: matched?.absen_at || null,
      last_seen: new Date().toISOString(),
    };

    membersToSave.push(record);

    if (matched) {
      updatedCount++;
    } else {
      addedCount++;
    }

    // Jika member ini punya absen dan tag valid, langsung masukkan ke giveaway_participants
    if (cleanTag && isValidTikTokUsername(cleanTag) && record.has_absen) {
      addGiveawayParticipant(
        cleanTag,
        record.push_name || cleanTag,
        null,
        1,
        record.phone || null,
        cleanTag
      );
    }
  }

  if (membersToSave.length > 0) {
    saveWaGroupMembers(membersToSave);
    syncAllParticipantsWithWa();
  }

  return {
    success: true,
    totalParsed: entries.length,
    updatedCount,
    addedCount,
    savedCount: membersToSave.length,
  };
}
