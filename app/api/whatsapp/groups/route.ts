import { NextResponse } from 'next/server';
import { getParticipatingGroups } from '@/lib/whatsapp';
import { getTargetWaGroup, setTargetWaGroup, setSetting, getWaGroupMembers, getSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';
    const groups = await getParticipatingGroups(refresh);
    const targetGroup = getTargetWaGroup() || (groups.length > 0 ? groups[0].id : '');
    return NextResponse.json({
      success: true,
      groups: Array.isArray(groups) ? groups : [],
      targetGroup: targetGroup || '',
    });
  } catch (err: any) {
    const fallbackTarget = getTargetWaGroup();
    const targetMembersCount = fallbackTarget ? getWaGroupMembers(fallbackTarget).length : 0;
    const targetGroupName = getSetting('giveaway_target_wa_group_name', 'Komunitas Valorant Mobile Anti Toxic - by Virtus');
    return NextResponse.json({
      success: true,
      groups: fallbackTarget ? [{ id: fallbackTarget, subject: targetGroupName, size: targetMembersCount || 68 }] : [],
      targetGroup: fallbackTarget || '',
      error: err?.message
    });
  }
}

export async function POST(req: Request) {
  try {
    const { groupJid, subject } = await req.json();
    if (groupJid !== undefined) {
      setTargetWaGroup(groupJid);
      if (subject) {
        setSetting('giveaway_target_wa_group_name', subject);
      }
      return NextResponse.json({ success: true, targetGroup: groupJid });
    }
    return NextResponse.json({ success: false, error: 'groupJid is required' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
