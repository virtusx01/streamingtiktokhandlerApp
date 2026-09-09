import { NextResponse } from 'next/server';
import { parseGroupMembersListText, applyParsedGroupMembers } from '@/lib/whatsapp-chat-parser';
import { getTargetWaGroup, getWaGroupMembers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = body.text || '';
    const targetGroup = body.targetGroup || getTargetWaGroup() || '';

    if (!text || !text.trim()) {
      return NextResponse.json({ success: false, error: 'Daftar teks anggota grup tidak boleh kosong' }, { status: 400 });
    }

    const parsedEntries = parseGroupMembersListText(text);

    if (parsedEntries.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Tidak ada data anggota grup atau format teks yang terbaca. Pastikan format: Nama lalu Member Tag di bawahnya.',
      }, { status: 400 });
    }

    const applyResult = applyParsedGroupMembers(parsedEntries, targetGroup || undefined);
    const updatedMembers = getWaGroupMembers(targetGroup || undefined);

    return NextResponse.json({
      success: true,
      totalParsed: applyResult.totalParsed,
      updatedCount: applyResult.updatedCount,
      addedCount: applyResult.addedCount,
      savedCount: applyResult.savedCount,
      members: updatedMembers,
      message: `Berhasil mengimpor ${applyResult.totalParsed} anggota grup! (${applyResult.updatedCount} diperbarui, ${applyResult.addedCount} anggota baru ditambahkan).`,
    });
  } catch (err: any) {
    console.error('[API /api/whatsapp/import-members] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Gagal mengimpor anggota grup' }, { status: 500 });
  }
}
