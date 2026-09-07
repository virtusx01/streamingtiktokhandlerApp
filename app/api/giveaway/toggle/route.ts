import { NextResponse } from 'next/server';
import { toggleGiveawayRequirement } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { username, field, value } = await req.json();
    if (!username || !field || value === undefined) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!['has_followed', 'has_shared', 'has_commented', 'has_wa_group'].includes(field)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
    }

    toggleGiveawayRequirement(username, field, value ? 1 : 0);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
