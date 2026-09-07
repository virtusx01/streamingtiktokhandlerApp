import { NextResponse } from 'next/server';
import { emitGiftEvent, emitCommentEvent, emitFollowEvent, emitFanEvent, emitLikeEvent, emitJoinEvent, emitShareEvent } from '@/lib/events';

export async function POST(req: Request) {
  try {
    const { type, giftName, comment } = await req.json();
    
    if (type === 'comment') {
      const isSticker = comment === "sticker";
      const testComment = {
        nickname: "Test User",
        username: "testuser",
        comment: isSticker ? "" : (comment || "Halo! Ini adalah komentar percobaan untuk cek tema."),
        images: isSticker ? ["https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Beaming%20Face%20with%20Smiling%20Eyes.png"] : [],
        timestamp: Date.now()
      };
      console.log(`[Test] Emitting test comment ${isSticker ? 'with sticker' : ''}`);
      emitCommentEvent(testComment);
    } else if (type === 'follow') {
      console.log(`[Test] Emitting test follow`);
      emitFollowEvent({
        nickname: "New Follower",
        username: "newfollower",
        timestamp: Date.now()
      });
    } else if (type === 'fan') {
      console.log(`[Test] Emitting test fan`);
      emitFanEvent({
        nickname: "New Fan",
        username: "newfan",
        timestamp: Date.now()
      });
    } else if (type === 'like') {
      const isMilestone = req.url.includes('milestone=true') || !!(await req.clone().json().catch(() => ({}))).isMilestone;
      console.log(`[Test] Emitting test like ${isMilestone ? '(MILESTONE)' : ''}`);
      emitLikeEvent({
        type: 'like',
        nickname: "Likers",
        username: "likers",
        likeCount: isMilestone ? 1000 : 50,
        totalLikeCount: isMilestone ? 1000 : 1500,
        timestamp: Date.now(),
        isTest: true,
        isMilestone: isMilestone,
        actions: isMilestone ? [
            { type: 'click', x: 500, y: 500, delayAfter: 500 }
        ] : []
      });
    } else if (type === 'join') {
      console.log(`[Test] Emitting test join`);
      emitJoinEvent({
        nickname: "New Viewer",
        username: "newviewer",
        timestamp: Date.now()
      });
    } else if (type === 'share') {
      console.log(`[Test] Emitting test share`);
      emitShareEvent({
        nickname: "Sharer User",
        username: "shareruser",
        timestamp: Date.now()
      });
    } else {
      const testData = {
        giftName: giftName || "Rose",
        namaHadiah: giftName === "Rose" ? "Mawar" : (giftName || "Mawar"),
        giftIcon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Rose.png",
        displayGiftName: giftName === "Rose" ? "Mawar" : (giftName || "Mawar"),
        nickname: "Test User 👑",
        username: "testuser",
        userId: "123",
        giftId: "1",
        repeatCount: 1,
        actions: [
            { type: 'click', x: 500, y: 500, delayAfter: 500 }
        ]
      };
      console.log(`[Test] Emitting test gift: ${testData.giftName} (Indo: ${testData.namaHadiah})`);
      emitGiftEvent(testData);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
