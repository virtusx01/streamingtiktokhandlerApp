const DEBUGGER_VERSION = '1.3';
const MAX_BATCH_SIZE = 12;
const FLUSH_INTERVAL_MS = 300;
const HEARTBEAT_INTERVAL_MS = 15000;

let activeTabId = null;
let activeUsername = '';
let frameQueue = [];
let flushTimer = null;
let heartbeatTimer = null;

function parseLiveUsername(url) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) return '';
    const match = parsed.pathname.match(/^\/@([^/]+)\/live\/?$/i);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function normalizeAppUrl(rawUrl) {
  const value = String(rawUrl || 'https://tiktoklistener.onrender.com').trim();
  if (!value) return 'https://tiktoklistener.onrender.com';
  return value
    .replace(/\/+$/, '')
    .replace(/\/api\/tiktok-live\/event\/?$/, '')
    .replace(/\/widget\/callback\/?$/, '')
    .replace(/\/widget\/?$/, '')
    .replace(/\/callback\/?$/, '');
}

async function getSettings() {
  const saved = await chrome.storage.local.get(['appUrl', 'listenerToken']);
  return {
    appUrl: normalizeAppUrl(saved.appUrl || 'https://tiktoklistener.onrender.com'),
    listenerToken: String(saved.listenerToken || '').trim()
  };
}

async function postBridge(action, extra = {}) {
  const { appUrl, listenerToken } = await getSettings();
  if (!listenerToken) throw new Error('Isi TIKTOK_LISTENER_TOKEN pada pengaturan extension.');

  const payload = action === 'frames'
    ? {
        type: 'frames',
        data: {
          username: activeUsername,
          frames: Array.isArray(extra.frames) ? extra.frames : []
        }
      }
    : {
        type: 'status',
        data: {
          action,
          username: activeUsername,
          ...extra
        }
      };

  const response = await fetch(appUrl + '/api/tiktok-live/event', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + listenerToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Server menolak permintaan (' + response.status + ').');
  }
  return response.json();
}

function flushFrames() {
  flushTimer = null;
  if (!frameQueue.length || !activeUsername) return;
  const frames = frameQueue.splice(0, MAX_BATCH_SIZE);
  void postBridge('frames', { frames }).catch((error) => {
    console.warn('[TikTok Tab Listener] Gagal meneruskan frame ke callback widget:', error.message);
  });
  if (frameQueue.length) scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flushFrames, FLUSH_INTERVAL_MS);
}

function onDebuggerEvent(source, method, params) {
  if (source.tabId !== activeTabId || method !== 'Network.webSocketFrameReceived') return;
  const response = params.response;
  if (response?.opcode !== 2 || typeof response.payloadData !== 'string') return;

  frameQueue.push(response.payloadData);
  if (frameQueue.length >= MAX_BATCH_SIZE) {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushFrames();
  } else {
    scheduleFlush();
  }
}

async function stopListener(reason = 'Listener browser dihentikan.') {
  const tabId = activeTabId;
  activeTabId = null;
  activeUsername = '';
  frameQueue = [];
  if (flushTimer !== null) clearTimeout(flushTimer);
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  flushTimer = null;
  heartbeatTimer = null;

  if (tabId !== null) {
    chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // The target may already have closed or detached.
    }
  }

  try {
    await postBridge('stop', { statusText: reason });
  } catch (error) {
    console.warn('[TikTok Tab Listener] Gagal memberi tahu server saat berhenti:', error.message);
  }
}

async function startListener(tab) {
  const username = parseLiveUsername(tab?.url || '');
  if (!tab?.id || !username) {
    throw new Error('Buka URL LIVE TikTok, misalnya tiktok.com/@username/live, lalu coba lagi.');
  }

  const { listenerToken } = await getSettings();
  if (!listenerToken) throw new Error('Isi TIKTOK_LISTENER_TOKEN pada pengaturan extension.');

  if (activeTabId !== null && activeTabId !== tab.id) await stopListener();
  activeTabId = tab.id;
  activeUsername = username;

  try {
    await chrome.debugger.attach({ tabId: activeTabId }, DEBUGGER_VERSION);
    chrome.debugger.onEvent.addListener(onDebuggerEvent);
    await chrome.debugger.sendCommand({ tabId: activeTabId }, 'Network.enable');
    await postBridge('start');

    heartbeatTimer = setInterval(() => {
      void postBridge('heartbeat').catch((error) => {
        console.warn('[TikTok Tab Listener] Heartbeat gagal:', error.message);
      });
    }, HEARTBEAT_INTERVAL_MS);
  } catch (error) {
    await stopListener('Gagal memasang listener browser.');
    throw error;
  }

  return { running: true, username };
}

async function ensureCurrentTabListener() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const username = parseLiveUsername(tab.url || '');
  if (!username) {
    if (activeTabId !== null) {
      await stopListener('Tab aktif bukan URL LIVE TikTok.');
    }
    return;
  }

  if (activeTabId !== tab.id || activeUsername !== username) {
    await startListener(tab);
  }
}

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId !== activeTabId) return;
  void stopListener('Tab TikTok terlepas dari debugger (' + reason + ').');
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => {
    if (!tab?.url) return;
    if (parseLiveUsername(tab.url)) {
      void ensureCurrentTabListener();
    } else if (activeTabId === tabId) {
      void stopListener('Tab aktif bukan URL LIVE TikTok.');
    }
  }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && parseLiveUsername(changeInfo.url)) {
    if (tabId === activeTabId) {
      const username = parseLiveUsername(changeInfo.url);
      if (username && username !== activeUsername) {
        void startListener(tab).catch((error) => console.warn('[TikTok Tab Listener] Gagal restart tab listener:', error.message));
      }
      return;
    }

    void chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
      if (activeTab?.id === tabId) {
        void startListener(tab).catch((error) => console.warn('[TikTok Tab Listener] Gagal aktifkan tab baru:', error.message));
      }
    }).catch(() => {});
    return;
  }

  if (changeInfo.url && tabId === activeTabId) {
    void stopListener('URL tab berubah keluar dari LIVE TikTok.');
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) void stopListener('Tab TikTok ditutup.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'save-settings') {
    chrome.storage.local.set({
      appUrl: String(message.appUrl || '').trim(),
      listenerToken: String(message.listenerToken || '').trim()
    }).then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === 'get-status') {
    sendResponse({ running: activeTabId !== null, username: activeUsername });
    return false;
  }

  if (message?.type === 'start') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => startListener(tab))
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === 'stop') {
    stopListener().then(() => sendResponse({ running: false }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});
