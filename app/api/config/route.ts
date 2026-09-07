import { NextResponse } from 'next/server';
import { getSetting, setSetting, getRewards, setReward, deleteAllRewards } from '@/lib/db';

const GLOBAL_SYNC_KEYS = [
  'tiktokUsername',
  'ttsSpeed',
  'ttsEnabled',
  'useLocalTTS',
  // Gift
  'giftEnabled',
  'giftTtsEnabled',
  'giftVoice',
  'voiceOverTemplate',
  'openingSoundUrl',
  // Comment
  'commentEnabled',
  'commentTtsEnabled',
  'commentVoice',
  'commentVoiceOverTemplate',
  'commentOpeningSoundUrl',
  // Like
  'likeEnabled',
  'likeTtsEnabled',
  'likeVoice',
  'likeVoiceOverTemplate',
  'likeOpeningSoundUrl',
  // Join
  'joinEnabled',
  'joinTtsEnabled',
  'joinVoiceOverTemplate',
  'joinOpeningSoundUrl',
  // Follow
  'followEnabled',
  'followTtsEnabled',
  'followVoice',
  'followVoiceOverTemplate',
  'followOpeningSoundUrl',
  // Fan
  'fanEnabled',
  'fanTtsEnabled',
  'fanVoice',
  'fanVoiceOverTemplate',
  'fanOpeningSoundUrl',
  // Share
  'shareEnabled',
  'shareTtsEnabled',
  'shareVoice',
  'shareVoiceOverTemplate',
  'shareOpeningSoundUrl'
];

export async function GET() {
  try {
    const config: any = {
      tiktokUsername: getSetting('tiktokUsername', '@onlyvirtus'),
      autoStartListener: getSetting('autoStartListener', true),
      widgetConfig: getSetting('widgetConfig', {}),
      commentConfig: getSetting('commentConfig', {
        theme: 'modern',
        borderRadius: 24,
        maxComments: 15,
        position: { x: 0, y: 0 }
      }),
      textBerjalanConfig: getSetting('textBerjalanConfig', {}),
      rewards: getRewards(),
      triggerRewardsEnabled: getSetting('triggerRewardsEnabled', true),
      adbMode: getSetting('adbMode', 'usb'),
      adbIP: getSetting('adbIP', ''),
      adbPort: getSetting('adbPort', '5555')
    };

    // Inject global settings into the response for easy access
    GLOBAL_SYNC_KEYS.forEach(key => {
      config[key] = getSetting(key, config.widgetConfig?.[key] || config.commentConfig?.[key]);
    });

    return NextResponse.json(config);
  } catch (err: any) {
    console.error('Failed to get config from DB:', err);
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const config = await req.json();
    
    // 1. Handle Global Sync Keys (if present in root or inside blobs)
    GLOBAL_SYNC_KEYS.forEach(key => {
        let value = config[key];
        
        // Prioritize values from widgetConfig or commentConfig if they are explicitly provided
        if (config.widgetConfig && config.widgetConfig[key] !== undefined) value = config.widgetConfig[key];
        else if (config.commentConfig && config.commentConfig[key] !== undefined) value = config.commentConfig[key];
        
        if (value !== undefined) {
            setSetting(key, value);
        }
    });

    if (config.tiktokUsername !== undefined) setSetting('tiktokUsername', config.tiktokUsername);
    if (config.autoStartListener !== undefined) setSetting('autoStartListener', config.autoStartListener);
    if (config.widgetConfig !== undefined) setSetting('widgetConfig', config.widgetConfig);
    if (config.commentConfig !== undefined) setSetting('commentConfig', config.commentConfig);
    if (config.textBerjalanConfig !== undefined) setSetting('textBerjalanConfig', config.textBerjalanConfig);
    if (config.triggerRewardsEnabled !== undefined) setSetting('triggerRewardsEnabled', config.triggerRewardsEnabled);
    if (config.adbMode !== undefined) setSetting('adbMode', config.adbMode);
    if (config.adbIP !== undefined) setSetting('adbIP', config.adbIP);
    if (config.adbPort !== undefined) setSetting('adbPort', config.adbPort);
    
    if (config.rewards) {
      deleteAllRewards(); // Clear existing ones to prevent ghosts
      for (const [name, reward] of Object.entries(config.rewards)) {
        const r = reward as any;
        setReward(name, r.actions || []);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Failed to save config to DB:', err);
    return NextResponse.json({ error: 'Failed to write config' }, { status: 500 });
  }
}
