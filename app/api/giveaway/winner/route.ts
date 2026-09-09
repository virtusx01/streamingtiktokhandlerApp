import { NextResponse } from 'next/server';
import { removeGiveawayParticipant, updateGiveawayWinnerTiktok } from '@/lib/db';

// DELETE /api/giveaway/winner
// Remove a winner from the pool after they've been drawn
export async function DELETE(req: Request) {
  try {
    const { username } = await req.json();

    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 });
    }

    removeGiveawayParticipant(username);

    return NextResponse.json({
      success: true,
      message: `Participant "${username}" removed from pool`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/giveaway/winner
// Simpan username TikTok pemenang setelah undian (input manual oleh admin)
export async function PATCH(req: Request) {
  try {
    const { username, tiktokUsername } = await req.json();

    if (!username || !tiktokUsername) {
      return NextResponse.json({ error: 'username dan tiktokUsername wajib diisi' }, { status: 400 });
    }

    const ok = updateGiveawayWinnerTiktok(username, tiktokUsername);

    if (!ok) {
      return NextResponse.json({ success: false, error: 'Peserta tidak ditemukan' }, { status: 404 });
    }

    const cleanTag = tiktokUsername.replace(/^@/, '').trim().toLowerCase();
    return NextResponse.json({
      success: true,
      message: `Username TikTok @${cleanTag} berhasil disimpan untuk pemenang!`,
      tiktokUsername: cleanTag,
      tiktokUrl: `https://www.tiktok.com/@${cleanTag}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
