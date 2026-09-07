export interface ListenerStatus {
  running: boolean;
  connected: boolean;
  isLive: boolean;
  username: string;
  roomId?: string;
  statusText?: string;
  lastLog?: string;
  lastError?: string;
  updatedAt: number;
}

const globalWithState = global as typeof globalThis & {
  __tiktok_listener_state?: ListenerStatus;
};

export const listenerStatus: ListenerStatus = globalWithState.__tiktok_listener_state || {
  running: false,
  connected: false,
  isLive: false,
  username: 'onlyvirtus',
  statusText: 'Stopped',
  updatedAt: Date.now()
};

globalWithState.__tiktok_listener_state = listenerStatus;

export function updateListenerStatus(patch: Partial<ListenerStatus>) {
  Object.assign(listenerStatus, patch, { updatedAt: Date.now() });
  return listenerStatus;
}
