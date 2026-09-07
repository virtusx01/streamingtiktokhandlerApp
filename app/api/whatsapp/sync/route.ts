import { NextResponse } from 'next/server';
import { syncGroupMembers } from '@/lib/whatsapp';
import { getTargetWaGroup, getWaGroupMembers, getEligibleRealParticipants, getDuplicateUsernames } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const groupJid = body.groupJid || getTargetWaGroup();

    if (!groupJid) {
      return NextResponse.json({ success: false, error: 'Pilih grup WhatsApp target terlebih dahulu' }, { status: 400 });
    }

    const res = await syncGroupMembers(groupJid);
    const members = getWaGroupMembers(groupJid);
    const eligibleReal = getEligibleRealParticipants();
    const absenCount = members.filter(m => (m as any).has_absen).length;
    const duplicates = getDuplicateUsernames(groupJid);

    return NextResponse.json({
      success: true,
      count: res.count,
      groupName: res.groupName,
      absenCount,
      eligibleCount: eligibleReal.length,
      duplicates,
      members,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const groupJid = searchParams.get('groupJid') || getTargetWaGroup();
    const members = getWaGroupMembers(groupJid || undefined);
    const duplicates = getDuplicateUsernames(groupJid || undefined);
    return NextResponse.json({ success: true, members, duplicates });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
