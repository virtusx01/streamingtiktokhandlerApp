import { NextResponse } from 'next/server';
import {
  getRealParticipants,
  getEligibleRealParticipants,
  getTesterParticipants,
  getEligibleTesterParticipants,
  resetGiveawayData,
  resetRealGiveawayData,
  resetTesterData,
  getDuplicateUsernames,
} from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') ?? 'all';  // 'all' | 'eligible'
    const mode   = searchParams.get('mode')   ?? 'real'; // 'real' | 'tester'

    let participants;
    if (mode === 'tester') {
      participants = filter === 'eligible' ? getEligibleTesterParticipants() : getTesterParticipants();
    } else {
      participants = filter === 'eligible' ? getEligibleRealParticipants() : getRealParticipants();
    }

    // Stats for both pools
    const allReal   = getRealParticipants();
    const allTester = getTesterParticipants();
    const duplicates = getDuplicateUsernames();

    return NextResponse.json({
      success: true,
      participants,
      duplicates,
      stats: {
        real: {
          total:        allReal.length,
          eligible:     allReal.filter(p => p.is_eligible).length,
          hasFollowed:  allReal.filter(p => p.has_followed).length,
          hasShared:    allReal.filter(p => p.has_shared).length,
          hasCommented: allReal.filter(p => p.has_commented).length,
          hasWaGroup:   allReal.filter(p => p.has_wa_group).length,
        },
        tester: {
          total:    allTester.length,
          eligible: allTester.filter(p => p.is_eligible).length,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') ?? 'all'; // 'all' | 'real' | 'tester'

    if (mode === 'real') {
      resetRealGiveawayData();
      return NextResponse.json({ success: true, message: 'Data peserta real berhasil direset' });
    } else if (mode === 'tester') {
      resetTesterData();
      return NextResponse.json({ success: true, message: 'Data tester berhasil direset' });
    } else {
      resetGiveawayData();
      return NextResponse.json({ success: true, message: 'Semua data giveaway berhasil direset' });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
