const appUrlInput = document.getElementById('appUrl');
const tokenInput = document.getElementById('token');
const statusElement = document.getElementById('status');

function showStatus(message) {
  statusElement.textContent = message;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || {});
    });
  });
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(['appUrl', 'listenerToken']);
  appUrlInput.value = settings.appUrl || 'https://tiktoklistener.onrender.com';
  tokenInput.value = settings.listenerToken || '';
  const state = await sendMessage({ type: 'get-status' });
  showStatus(state.running ? `Aktif untuk @${state.username}` : 'Listener tidak aktif.');
}

document.getElementById('save').addEventListener('click', async () => {
  const result = await sendMessage({
    type: 'save-settings',
    appUrl: appUrlInput.value,
    listenerToken: tokenInput.value
  });
  showStatus(result.error || 'Pengaturan tersimpan.');
});

document.getElementById('start').addEventListener('click', async () => {
  const saved = await sendMessage({
    type: 'save-settings',
    appUrl: appUrlInput.value,
    listenerToken: tokenInput.value
  });
  if (saved.error) return showStatus(saved.error);
  const result = await sendMessage({ type: 'start' });
  showStatus(result.error || `Listener aktif untuk @${result.username}.`);
});

document.getElementById('stop').addEventListener('click', async () => {
  const result = await sendMessage({ type: 'stop' });
  showStatus(result.error || 'Listener dihentikan.');
});

void loadSettings();
