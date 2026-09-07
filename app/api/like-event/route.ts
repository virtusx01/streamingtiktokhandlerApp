import { NextResponse } from 'next/server';
import { emitLikeEvent } from '@/lib/events';
import { getSetting, setSetting, getRewards, getUserLikes, updateUserLikes } from '@/lib/db';
import { isDuplicate } from '@/lib/dedup';

export async function POST(req: Request) {
  try {
    const likeData = await req.json();

    // Server-side Deduplication
    if (isDuplicate(likeData.eventId, 5000)) {
        return NextResponse.json({ success: true, duplicated: true });
    }

    const username = likeData.username || 'unknown';
    const nickname = likeData.nickname || 'Viewer';
    const incomingTotal = likeData.likeCount || 0; // Cumulative session total from TikTok

    const widgetConfig = getSetting('widgetConfig', {});
    const threshold = widgetConfig.likeThreshold || 100;
    const milestoneMode = widgetConfig.milestoneMode || 'global'; // 'individual' or 'global'

    let isMilestone = false;
    let milestoneCount = 0;

    if (milestoneMode === 'individual') {
      // PER-USER LOGIC
      const userRecord = getUserLikes(username);
      const lastMilestoneReached = userRecord?.last_milestone || 0;
      
      // Since TikTok sends session total, we use it directly
      const currentMilestone = Math.floor(incomingTotal / threshold) * threshold;

      if (currentMilestone > 0 && currentMilestone > lastMilestoneReached) {
        isMilestone = true;
        milestoneCount = currentMilestone;
        updateUserLikes(username, nickname, incomingTotal, currentMilestone);
      } else {
        updateUserLikes(username, nickname, incomingTotal);
      }
    } else {
      // GLOBAL LOGIC (Everyone)
      // For global, TikTok's likeCount in the event is usually the current stream total
      const lastGlobalMilestone = getSetting('lastMilestonePerformed', 0);
      const currentMilestone = Math.floor(incomingTotal / threshold) * threshold;

      if (currentMilestone > 0 && currentMilestone > lastGlobalMilestone) {
        setSetting('lastMilestonePerformed', currentMilestone);
        isMilestone = true;
        milestoneCount = currentMilestone;
      }
    }

    // Enrich with ADB actions if it's a milestone
    if (isMilestone) {
      const rewards = getRewards();
      const milestoneReward = rewards["Like Milestone"];
      if (milestoneReward) {
        likeData.actions = milestoneReward.actions;
      }
      likeData.isMilestone = true;
      likeData.milestoneCount = milestoneCount;
      console.log(`❤️ [${milestoneMode.toUpperCase()}] Like Milestone Reached: ${milestoneCount}! (User: ${nickname})`);
    }

    // Notify Widget via SSE
    emitLikeEvent({
      ...likeData,
      type: 'like',
      triggerRewardsEnabled: getSetting('triggerRewardsEnabled', true)
    });

    return NextResponse.json({ success: true, isMilestone, milestoneMode });
  } catch (err: any) {
    console.error("Like Event Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

