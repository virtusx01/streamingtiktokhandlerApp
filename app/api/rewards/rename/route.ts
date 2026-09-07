import { NextResponse } from 'next/server';
import { renameReward } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { oldName, newName } = await req.json();
    
    if (!oldName || !newName) {
      return NextResponse.json({ error: 'oldName and newName are required' }, { status: 400 });
    }
    
    renameReward(oldName, newName);
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Failed to rename reward:', err);
    return NextResponse.json({ error: 'Failed to rename reward' }, { status: 500 });
  }
}
