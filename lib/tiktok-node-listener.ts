import { WebcastPushConnection } from 'tiktok-live-connector';
import { listenerStatus, updateListenerStatus } from './listener-state';
import {
  emitStatusEvent,
  emitCommentEvent,
  emitLikeEvent,
  emitJoinEvent,
  emitFollowEvent,
  emitShareEvent
} from './events';

interface SeenEventsTracker {
  has(id: string): boolean;
  add(id: string): void;
}

class BoundedSet implements SeenEventsTracker {
  private set = new Set<string>();
  private list: string[] = [];
  private maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  has(id: string): boolean {
    return this.set.has(id);
  }

  add(id: string): void {
    if (this.set.has(id)) return;
    this.set.add(id);
    this.list.push(id);
    if (this.list.length > this.maxSize) {
      const oldest = this.list.shift();
      if (oldest) this.set.delete(oldest);
    }
  }
}

class TikTokNodeListener {
  private active = false;
  private currentUsername = '';
  private connection: WebcastPushConnection | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private seenEvents = new BoundedSet(200);

  public isActive(): boolean {
    return this.active;
  }

  public getUsername(): string {
    return this.currentUsername;
  }

  public async start(username: string): Promise<void> {
    const cleanUser = username.replace(/^@/, '').trim();
    if (!cleanUser) {
      throw new Error('Username TikTok tidak valid.');
    }

    // If already active with the same username and connected, do nothing
    if (this.active && this.currentUsername.toLowerCase() === cleanUser.toLowerCase()) {
      console.log(`[TikTokNodeListener] Already active for @${cleanUser}`);
      return;
    }

    // Stop any existing session
    await this.stop();

    this.active = true;
    this.currentUsername = cleanUser;

    updateListenerStatus({
      running: true,
      connected: false,
      isLive: false,
      username: cleanUser,
      statusText: `Menghubungkan ke @${cleanUser} (Node.js)...`
    });
    emitStatusEvent(listenerStatus);

    console.log(`🚀 [TikTokNodeListener] Memulai listener JavaScript murni untuk @${cleanUser}`);
    this.connectLoop();
  }

  public async stop(): Promise<void> {
    this.active = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch (err) {
        console.warn(`[TikTokNodeListener] Disconnect error:`, err);
      }
      this.connection = null;
    }

    updateListenerStatus({
      running: false,
      connected: false,
      isLive: false,
      statusText: 'Listener JavaScript dihentikan.'
    });
    emitStatusEvent(listenerStatus);
    console.log(`🛑 [TikTokNodeListener] Listener dihentikan.`);
  }

  private async connectLoop(): Promise<void> {
    if (!this.active) return;

    const username = this.currentUsername;

    try {
      if (this.connection) {
        try {
          await this.connection.disconnect();
        } catch {}
        this.connection = null;
      }

      console.log(`🔄 [TikTokNodeListener] Mencoba koneksi ke @${username}...`);
      updateListenerStatus({
        running: true,
        connected: false,
        isLive: false,
        username,
        statusText: `Menghubungkan ke @${username}...`
      });
      emitStatusEvent(listenerStatus);

      const conn = new WebcastPushConnection(username, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        requestPollingIntervalMs: 1000
      });
      this.connection = conn;

      this.setupHandlers(conn, username);

      // Attempt to connect
      const state = await conn.connect();
      console.log(`📡 [TikTokNodeListener] Berhasil terhubung ke Live @${username} (Room: ${state.roomId})`);

      updateListenerStatus({
        running: true,
        connected: true,
        isLive: true,
        username,
        roomId: String(state.roomId || ''),
        statusText: `Terhubung ke Live @${username}`
      });
      emitStatusEvent(listenerStatus);

    } catch (err: any) {
      const errMsg = String(err?.message || err);
      console.log(`⏳ [TikTokNodeListener] Gagal terhubung: ${errMsg}`);

      const isOffline = errMsg.toLowerCase().includes('offline') || 
                        errMsg.toLowerCase().includes("isn't online") ||
                        errMsg.toLowerCase().includes('not online') ||
                        errMsg.toLowerCase().includes('not found') ||
                        errMsg.toLowerCase().includes('missing');

      const statusMsg = isOffline
        ? `@${username} sedang Offline. Standby mengecek ulang...`
        : `Standby (${errMsg.slice(0, 40)}). Mencoba lagi...`;

      updateListenerStatus({
        running: this.active,
        connected: false,
        isLive: false,
        username,
        statusText: statusMsg
      });
      emitStatusEvent(listenerStatus);

      // Retry after delay if still active
      if (this.active) {
        const delay = isOffline ? 10000 : 12000;
        this.reconnectTimer = setTimeout(() => {
          this.connectLoop();
        }, delay);
      }
    }
  }

  private setupHandlers(conn: WebcastPushConnection, username: string): void {
    conn.on('connected', (state: any) => {
      console.log(`📡 [TikTokNodeListener] Event 'connected' room: ${state?.roomId}`);
      updateListenerStatus({
        running: true,
        connected: true,
        isLive: true,
        username,
        roomId: String(state?.roomId || conn.roomId || ''),
        statusText: `Terhubung ke Live @${username}`
      });
      emitStatusEvent(listenerStatus);
    });

    conn.on('disconnected', () => {
      console.log(`🔌 [TikTokNodeListener] Event 'disconnected' dari @${username}`);
      updateListenerStatus({
        connected: false,
        isLive: false,
        statusText: `Terputus dari @${username}. Standby...`
      });
      emitStatusEvent(listenerStatus);

      if (this.active) {
        this.reconnectTimer = setTimeout(() => {
          this.connectLoop();
        }, 10000);
      }
    });

    conn.on('streamEnd', () => {
      console.log(`🛑 [TikTokNodeListener] Live streaming @${username} berakhir.`);
      updateListenerStatus({
        connected: false,
        isLive: false,
        statusText: `Live @${username} telah berakhir. Standby...`
      });
      emitStatusEvent(listenerStatus);

      if (this.active) {
        this.reconnectTimer = setTimeout(() => {
          this.connectLoop();
        }, 12000);
      }
    });

    conn.on('chat', (data: any) => {
      try {
        const msgId = String(data.msgId || Date.now());
        const eventId = `comment_${msgId}`;
        if (this.seenEvents.has(eventId)) return;
        this.seenEvents.add(eventId);

        const payload = {
          comment: String(data.comment || ''),
          nickname: String(data.nickname || data.uniqueId || 'Viewer'),
          username: String(data.uniqueId || 'viewer'),
          images: [],
          eventId
        };

        console.log(`💬 [TikTokNodeListener] ${payload.nickname}: ${payload.comment}`);
        emitCommentEvent(payload);
      } catch (e) {
        console.error('[TikTokNodeListener] Error processing chat event:', e);
      }
    });

    conn.on('gift', async (data: any) => {
      try {
        const uniqueId = String(data.uniqueId || 'viewer');
        const nickname = String(data.nickname || uniqueId || 'Viewer');
        const giftName = String(data.giftName || data.giftDetails?.giftName || data.describe || 'Hadiah');
        const giftId = String(data.giftId || data.gift?.gift_id || '0');
        const repeatCount = Number(data.repeatCount || data.gift?.repeat_count || 1);
        const repeatEnd = Boolean(data.repeatEnd || data.gift?.repeat_end);
        const groupId = String(data.groupId || data.msgId || Date.now());
        const giftIcon = data.giftPictureUrl || (Array.isArray(data.giftDetails?.giftImage?.url) ? data.giftDetails.giftImage.url[0] : '');

        const eventId = `gift_${uniqueId}_${groupId}_${repeatCount}`;
        if (this.seenEvents.has(eventId)) return;
        this.seenEvents.add(eventId);

        const payload = {
          giftName,
          nickname,
          username: uniqueId,
          repeatCount,
          repeatEnd,
          eventId,
          msgId: groupId,
          giftId,
          giftIcon,
          timestamp: Date.now()
        };

        // Forward to internal gift event API for 5s debounce & reward matching
        const port = process.env.PORT || '3005';
        const baseUrl = process.env.NEXT_BASE_URL || `http://127.0.0.1:${port}`;
        fetch(`${baseUrl}/api/gift-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch((err) => {
          console.warn('[TikTokNodeListener] Failed to post gift to internal route:', err.message);
        });

        console.log(`🎁 [TikTokNodeListener] Gift: '${giftName}' x${repeatCount} dari ${nickname} (@${uniqueId})`);
      } catch (e) {
        console.error('[TikTokNodeListener] Error processing gift event:', e);
      }
    });

    conn.on('like', (data: any) => {
      try {
        const uniqueId = String(data.uniqueId || 'viewer');
        const nickname = String(data.nickname || uniqueId || 'Viewer');
        const likeCount = Number(data.likeCount || data.totalLikeCount || 1);

        const payload = {
          likeCount,
          nickname,
          username: uniqueId,
          eventId: `like_${uniqueId}_${Date.now()}`
        };

        emitLikeEvent(payload);
      } catch (e) {}
    });

    conn.on('member', (data: any) => {
      try {
        const uniqueId = String(data.uniqueId || 'viewer');
        const nickname = String(data.nickname || uniqueId || 'Viewer');
        const eventId = `join_${uniqueId}_${Math.floor(Date.now() / 30000)}`;
        if (this.seenEvents.has(eventId)) return;
        this.seenEvents.add(eventId);

        emitJoinEvent({
          nickname,
          username: uniqueId,
          eventId
        });
      } catch (e) {}
    });

    conn.on('follow', (data: any) => {
      try {
        const uniqueId = String(data.uniqueId || 'viewer');
        const nickname = String(data.nickname || uniqueId || 'Viewer');
        const eventId = `follow_${uniqueId}`;
        if (this.seenEvents.has(eventId)) return;
        this.seenEvents.add(eventId);

        emitFollowEvent({
          nickname,
          username: uniqueId,
          eventId
        });
      } catch (e) {}
    });

    conn.on('share', (data: any) => {
      try {
        const uniqueId = String(data.uniqueId || 'viewer');
        const nickname = String(data.nickname || uniqueId || 'Viewer');
        const eventId = `share_${uniqueId}_${Math.floor(Date.now() / 10000)}`;
        if (this.seenEvents.has(eventId)) return;
        this.seenEvents.add(eventId);

        emitShareEvent({
          nickname,
          username: uniqueId,
          eventId
        });
      } catch (e) {}
    });

    conn.on('error', (err: any) => {
      console.warn(`[TikTokNodeListener] Connection warning:`, err?.message || err);
    });
  }
}

// Persist singleton instance across Next.js dev server hot-reloads
const globalWithListener = global as typeof globalThis & {
  __tiktok_node_listener?: TikTokNodeListener;
};

export const tiktokNodeListener: TikTokNodeListener =
  globalWithListener.__tiktok_node_listener || new TikTokNodeListener();

if (process.env.NODE_ENV !== 'production') {
  globalWithListener.__tiktok_node_listener = tiktokNodeListener;
}
