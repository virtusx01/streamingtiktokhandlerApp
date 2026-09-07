import { EventEmitter } from 'events';

// In Next.js dev mode, files can be re-evaluated, leading to multiple EventEmitter instances.
// Using globalThis ensures we have a single source of truth for events.
const globalWithEmitter = global as typeof globalThis & {
  __tiktok_emitter?: EventEmitter;
};

const eventEmitter = globalWithEmitter.__tiktok_emitter || new EventEmitter();

if (process.env.NODE_ENV !== 'production') {
  globalWithEmitter.__tiktok_emitter = eventEmitter;
}

eventEmitter.setMaxListeners(100);

// Log to help debugging
const emitWithLog = (name: string, data: any) => {
  const listenerCount = eventEmitter.listenerCount(name);
  console.log(`[Events] Emitting ${name} to ${listenerCount} listeners`);
  eventEmitter.emit(name, data);
};

export const GIFT_EVENT = 'gift_event';
export const COMMENT_EVENT = 'comment_event';
export const LIKE_EVENT = 'like_event';
export const JOIN_EVENT = 'join_event';
export const FOLLOW_EVENT = 'follow_event';
export const FAN_EVENT = 'fan_event';
export const SHARE_EVENT = 'share_event';

export function emitGiftEvent(data: any) {
  emitWithLog(GIFT_EVENT, data);
}

export function subscribeToGiftEvents(callback: (data: any) => void) {
  eventEmitter.on(GIFT_EVENT, callback);
  return () => {
    eventEmitter.off(GIFT_EVENT, callback);
  };
}

export function emitCommentEvent(data: any) {
  emitWithLog(COMMENT_EVENT, data);
}

export function subscribeToCommentEvents(callback: (data: any) => void) {
  eventEmitter.on(COMMENT_EVENT, callback);
  return () => {
    eventEmitter.off(COMMENT_EVENT, callback);
  };
}

export function emitLikeEvent(data: any) {
  emitWithLog(LIKE_EVENT, data);
}

export function subscribeToLikeEvents(callback: (data: any) => void) {
  eventEmitter.on(LIKE_EVENT, callback);
  return () => {
    eventEmitter.off(LIKE_EVENT, callback);
  };
}

export function emitJoinEvent(data: any) {
  emitWithLog(JOIN_EVENT, data);
}

export function subscribeToJoinEvents(callback: (data: any) => void) {
  eventEmitter.on(JOIN_EVENT, callback);
  return () => {
    eventEmitter.off(JOIN_EVENT, callback);
  };
}

export function emitFollowEvent(data: any) {
  emitWithLog(FOLLOW_EVENT, data);
}

export function subscribeToFollowEvents(callback: (data: any) => void) {
  eventEmitter.on(FOLLOW_EVENT, callback);
  return () => {
    eventEmitter.off(FOLLOW_EVENT, callback);
  };
}

export function emitFanEvent(data: any) {
  emitWithLog(FAN_EVENT, data);
}

export function subscribeToFanEvents(callback: (data: any) => void) {
  eventEmitter.on(FAN_EVENT, callback);
  return () => {
    eventEmitter.off(FAN_EVENT, callback);
  };
}

export function emitShareEvent(data: any) {
  emitWithLog(SHARE_EVENT, data);
}

export function subscribeToShareEvents(callback: (data: any) => void) {
  eventEmitter.on(SHARE_EVENT, callback);
  return () => {
    eventEmitter.off(SHARE_EVENT, callback);
  };
}

export const STATUS_EVENT = 'status_event';

export function emitStatusEvent(data: any) {
  emitWithLog(STATUS_EVENT, data);
}

export function subscribeToStatusEvents(callback: (data: any) => void) {
  eventEmitter.on(STATUS_EVENT, callback);
  return () => {
    eventEmitter.off(STATUS_EVENT, callback);
  };
}

