import { NextResponse } from 'next/server';
import { addGiveawayTester } from '@/lib/db';

// POST /api/giveaway/tester
// Tambahkan peserta tester (semua syarat otomatis terpenuhi)
export async function POST(req: Request) {
  try {
    const { username, nickname } = await req.json();

    if (!username || !nickname) {
      return NextResponse.json(
        { error: 'username and nickname are required' },
        { status: 400 }
      );
    }

    // Add prefix to avoid collision with real users
    const testerUsername = username.startsWith('_tester_') ? username : `_tester_${username}`;
    const testerNickname = `[TEST] ${nickname}`;

    addGiveawayTester(testerUsername, testerNickname);

    return NextResponse.json({
      success: true,
      message: `Tester "${testerNickname}" added as eligible participant`,
      participant: { username: testerUsername, nickname: testerNickname }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
