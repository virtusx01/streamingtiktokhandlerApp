import { NextResponse } from 'next/server';
import { emitGiftEvent } from '@/lib/events';
import { getRewards, addDetectedGift, getSetting } from '@/lib/db';
import { isDuplicate } from '@/lib/dedup';

const GIFT_ALIASES: Record<string, string> = {
  "Rose": "Mawar",
// ... (rest of aliases remains the same)
  "Sunflower": "Bunga Matahari",
  "Heart": "Hati",
  "Star": "Bintang",
  "Love": "Cinta",
  "Diamond": "Berlian",
  "Crown": "Mahkota",
  "Fire": "Api",
  "Ice Cream": "Es Krim",
  "Finger Heart": "Hati Jari",
  "GG": "GG",
  "TikTok": "TikTok",
  "Perfume": "Parfum",
  "Doughnut": "Donat",
  "Hand Heart": "Hati Tangan",
  "Paper Crane": "Bangau Kertas",
  "Little Crown": "Mahkota Kecil",
  "Rosa": "Mawar",
  "Peso Rose": "Mawar",
  "Lion": "Singa",
  "Whale": "Paus",
  "Money Rain": "Hujan Uang",
  "Swan": "Angsa",
  "Private Jet": "Jet Pribadi",
  "Yacht": "Kapal Pesiar",
  "Ferris Wheel": "Bianglala",
  "Elephant": "Gajah",
  "Fireworks": "Kembang Api",
  "Racing Car": "Mobil Balap",
  "Leon and Lion": "Leon dan Singa",
  "TikTok Universe": "TikTok Universe",
  "Rice Tumpeng": "Nasi Tumpeng",
  "Money Gun": "Pistol Uang",
};

interface GiftEventPayload {
  giftName: string;
  nickname?: string;
  username: string;
  repeatCount: number;
  repeatEnd: boolean;
  eventId: string;
  msgId: string;
  giftId?: string;
  giftIcon?: string;
  timestamp?: number;
  actions?: unknown[];
}

interface AggregationRecord {
  timeout: ReturnType<typeof setTimeout>;
  giftData: GiftEventPayload;
  combos: Map<string, number>;
  firstTimestamp: number;
}

// Persist aggregation registry across hot reloads in Next.js development mode
const globalWithAggregations = global as typeof globalThis & {
  __gift_aggregations?: Map<string, AggregationRecord>;
};

const aggregations = globalWithAggregations.__gift_aggregations || new Map<string, AggregationRecord>();

if (process.env.NODE_ENV !== 'production') {
  globalWithAggregations.__gift_aggregations = aggregations;
}

async function processAggregatedGift(aggKey: string) {
  try {
    const agg = aggregations.get(aggKey);
    if (!agg) return;

    // Remove from registry so subsequent gifts start a new window
    aggregations.delete(aggKey);

    const giftData = agg.giftData;
    
    // Sum the maximum repeatCount of all tracked combos in this window
    let totalCount = 0;
    for (const count of agg.combos.values()) {
      totalCount += count;
    }

    console.log(`[Aggregation] Processing aggregated ${giftData.giftName} for ${giftData.username}: Total Count is ${totalCount} (across ${agg.combos.size} unique combos/clicks)`);

    const rawGiftName = giftData.giftName || "Unknown";

    // 1. Store in Detected Gifts Database asynchronously
    try {
      addDetectedGift(rawGiftName);
    } catch (e) {
      console.error("Failed to store detected gift", e);
    }

    // 2. Perform Reward Matching (use incoming actions if provided for UI testing)
    const rewards = getRewards();
    let matchedReward = null;
    let finalGiftName = rawGiftName;
    const rawLower = rawGiftName.toLowerCase();

    // Prioritize actions from the request (Test Button in UI)
    if (giftData.actions) {
        matchedReward = { actions: giftData.actions };
    } else {
        // Normal lookup logic
        const reverseAliases = Object.fromEntries(Object.entries(GIFT_ALIASES).map(([k, v]) => [v.toLowerCase(), k.toLowerCase()]));
        const forwardAliases = Object.fromEntries(Object.entries(GIFT_ALIASES).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));

        const candidates = [rawLower];
        if (reverseAliases[rawLower]) candidates.push(reverseAliases[rawLower]);
        if (forwardAliases[rawLower]) candidates.push(forwardAliases[rawLower]);

        for (const [key, val] of Object.entries(rewards)) {
            if (candidates.includes(key.toLowerCase())) {
                matchedReward = val;
                finalGiftName = key;
                break;
            }
        }

        // Fallback for Rose variants
        if (!matchedReward) {
            const roseKeywords = ["rose", "mawar", "rosa"];
            if (roseKeywords.some(kw => rawLower.includes(kw))) {
                 for (const [key, val] of Object.entries(rewards)) {
                     if (roseKeywords.some(kw => key.toLowerCase().includes(kw))) {
                          matchedReward = val;
                          finalGiftName = key;
                          break;
                     }
                 }
            }
        }
    }

    // 3. Determine Display Name (Indonesian for TTS)
    let displayName = rawGiftName;
    for (const [eng, indo] of Object.entries(GIFT_ALIASES)) {
        if (eng.toLowerCase() === rawLower) { displayName = indo; break; }
        if (indo.toLowerCase() === rawLower) { displayName = indo; break; }
    }

    // 4. Construct enriched payload for widget
    // Ensure matchedReward.actions is always an array
    const verifiedActions = matchedReward?.actions ? (Array.isArray(matchedReward.actions) ? matchedReward.actions : [matchedReward.actions]) : null;

    const enrichedData = {
      ...giftData,
      repeatCount: totalCount,
      repeatEnd: true,
      giftName: finalGiftName, 
      giftIcon: giftData.giftIcon || "", 
      namaHadiah: displayName,        
      displayGiftName: displayName,    
      nickname: giftData.nickname || giftData.username || "Viewer",
      actions: verifiedActions,
      triggerRewardsEnabled: getSetting('triggerRewardsEnabled', true)
    };

    if (verifiedActions) {
        console.log(`🚀 Emitting Enriched Aggregated Gift Event: Matched Reward '${finalGiftName}' with ${verifiedActions.length} actions (TTS: ${displayName}, count: ${totalCount})`);
    } else {
         console.log(`🚀 Emitting Enriched Aggregated Gift Event: No Actions for '${finalGiftName}' (TTS: ${displayName}, count: ${totalCount})`);
    }
    
    // 5. Notify Widget via SSE
    emitGiftEvent(enrichedData);

  } catch (err: any) {
    console.error("Error in processAggregatedGift:", err);
  }
}

export async function POST(req: Request) {
  try {
    const giftData: GiftEventPayload = await req.json();
    
    // 1. Primary Deduplication (Event ID)
    if (isDuplicate(giftData.eventId, 10000)) {
        console.log(`⚠️ Dropping Duplicate Gift (EventID): ${giftData.eventId}`);
        return NextResponse.json({ success: true, message: 'Duplicate dropped' });
    }

    // NOTE: Secondary Deduplication (Content-based) is REMOVED here because it was incorrectly dropping 
    // separate consecutive single gifts of count 1 (e.g. sending 1 rose multiple times).
    // Our 5-second debounce aggregation will handle pooling these events correctly.

    const username = giftData.username || "viewer";
    const giftName = giftData.giftName || "Unknown";
    const repeatCount = giftData.repeatCount || 1;
    const msgId = giftData.msgId || `msg_${Date.now()}`;

    console.log(`🎁 Received Raw Gift Event from Python: ${giftName} x${repeatCount} from ${username} (msgId: ${msgId})`);

    const aggKey = `${username.toLowerCase()}_${giftName.toLowerCase()}`;
    const existingAgg = aggregations.get(aggKey);

    if (existingAgg) {
      // Clear the active timer
      clearTimeout(existingAgg.timeout);

      // Update gift data with latest info
      existingAgg.giftData = giftData;

      // Update the max repeat count for this msgId
      const currentMax = existingAgg.combos.get(msgId) || 0;
      existingAgg.combos.set(msgId, Math.max(currentMax, repeatCount));

      console.log(`[Aggregation] Updated pending ${giftName} aggregation for ${username}. Current combos tracked:`, 
        Array.from(existingAgg.combos.entries()).map(([m, c]) => `${m}: x${c}`).join(', ')
      );

      // Schedule a new 5-second timer from now
      existingAgg.timeout = setTimeout(() => {
        processAggregatedGift(aggKey);
      }, 5000);
    } else {
      // Create new aggregation record
      const combos = new Map<string, number>();
      combos.set(msgId, repeatCount);

      const newAgg: AggregationRecord = {
        giftData,
        combos,
        firstTimestamp: Date.now(),
        timeout: setTimeout(() => {
          processAggregatedGift(aggKey);
        }, 5000)
      };

      console.log(`[Aggregation] Created new 5s window for ${giftName} from ${username} (msgId: ${msgId}, x${repeatCount})`);

      aggregations.set(aggKey, newAgg);
    }

    // Return response immediately to Python to keep it fast
    return NextResponse.json({ success: true, message: 'Gift queued for aggregation' });
  } catch (err: any) {
    console.error("Gift Event Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
