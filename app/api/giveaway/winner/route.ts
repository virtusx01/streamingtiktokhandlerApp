import { NextResponse } from 'next/server';
import { removeGiveawayParticipant } from '@/lib/db';

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
