import { NextResponse } from 'next/server';
import { getParticipatingGroups } from '@/lib/whatsapp';
import { getTargetWaGroup, setTargetWaGroup } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const groups = await getParticipatingGroups();
    const targetGroup = getTargetWaGroup();
    return NextResponse.json({
      success: true,
      groups: Array.isArray(groups) ? groups : [],
      targetGroup: targetGroup || '',
    });
  } catch (err: any) {
    const fallbackTarget = getTargetWaGroup();
    return NextResponse.json({
      success: true,
      groups: fallbackTarget ? [{ id: fallbackTarget, subject: 'Grup Target Komunitas', size: 0 }] : [],
      targetGroup: fallbackTarget || '',
      error: err?.message
    });
  }
}

export async function POST(req: Request) {
  try {
    const { groupJid } = await req.json();
    if (groupJid !== undefined) {
      setTargetWaGroup(groupJid);
      return NextResponse.json({ success: true, targetGroup: groupJid });
    }
    return NextResponse.json({ success: false, error: 'groupJid is required' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
