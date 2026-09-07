import { NextResponse } from 'next/server';
import { getRewardPresets, saveRewardPreset, loadRewardPreset, deleteRewardPreset, renameRewardPreset, getRewards, setReward, deleteAllRewards } from '@/lib/db';

export async function GET() {
  try {
    const presets = getRewardPresets();
    return NextResponse.json({ presets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, name } = body;

    if (action === 'save') {
      // Save current rewards as a preset
      const rewards = getRewards();
      saveRewardPreset(name, rewards);
      return NextResponse.json({ success: true, message: `Preset "${name}" saved` });
    }

    if (action === 'load') {
      const presetData = loadRewardPreset(name);
      if (!presetData) {
        return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
      }
      
      deleteAllRewards();
      for (const [rewardName, rewardConfig] of Object.entries(presetData)) {
        // Standardize: rewardConfig could be { actions: [] } or just the array itself (legacy)
        const actions = (rewardConfig as any).actions || (Array.isArray(rewardConfig) ? rewardConfig : []);
        setReward(rewardName, actions);
      }
      return NextResponse.json({ success: true, rewards: presetData });
    }

    if (action === 'rename') {
      const { oldName, newName } = body;
      if (!oldName || !newName) return NextResponse.json({ error: 'oldName and newName required' }, { status: 400 });
      renameRewardPreset(oldName, newName);
      return NextResponse.json({ success: true, message: `Preset renamed to "${newName}"` });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    
    deleteRewardPreset(name);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
