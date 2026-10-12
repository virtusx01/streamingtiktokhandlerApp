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

async function getSettings() {
  const saved = await chrome.storage.local.get(['appUrl', 'listenerToken']);
  return {
    appUrl: String(saved.appUrl || 'https://tiktoklistener.onrender.com').replace(/\/+$/, ''),
    listenerToken: String(saved.listenerToken || '').trim()
  };
}

async function postBridge(action, extra = {}) {
  const { appUrl, listenerToken } = await getSettings();
  if (!listenerToken) throw new Error('Isi TIKTOK_LISTENER_TOKEN pada pengaturan extension.');

  const response = await fetch(`${appUrl}/api/browser-listener`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${listenerToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, username: activeUsername, ...extra })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Server menolak permintaan (${response.status}).`);
  }
  return response.json();
}

function flushFrames() {
  flushTimer = null;
  if (!frameQueue.length || !activeUsername) return;
  const frames = frameQueue.splice(0, MAX_BATCH_SIZE);
  void postBridge('frames', { frames }).catch((error) => {
    console.warn('[TikTok Tab Listener] Gagal meneruskan frame:', error.message);
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

  if (activeTabId !== null) await stopListener();
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

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId !== activeTabId) return;
  void stopListener(`Tab TikTok terlepas dari debugger (${reason}).`);
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
