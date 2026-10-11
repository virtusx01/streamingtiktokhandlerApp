'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Code2, Copy, LoaderCircle, RefreshCw, Save, Settings, X } from 'lucide-react';

type AlertConfig = {
  mode: 'default' | 'custom';
  html: string;
  durationMs: number;
  webhookTokenConfigured: boolean;
};

type AlertData = {
  amount: string;
  supporter: string;
  message: string;
  mediaUrl: string;
  fromText?: string;
};

type WebhookLog = {
  id: string;
  receivedAt: string;
  eventType: string;
  payloadFields: { path: string; value: string }[];
  mapped: AlertData;
};

const CALLBACK_URL = 'https://tiktoklistener.onrender.com/sociabuzz/callback';
const DEFAULT_HTML = '<div class="cyber-alert"><div class="custom-media" style="background-image:url(\'{{mediaUrl}}\');"></div><div class="cyber-card"><div class="cyber-header"><span class="badge bell-ring">{{amount}}</span><span class="action">{{fromText}}</span><span class="user bell-ring">{{supporter}}</span></div><div class="cyber-msg">{{message}}</div></div></div>';
const TEST_ALERT: AlertData = {
  amount: '25000',
  supporter: 'Supporter Test',
  message: 'Semangat terus stream-nya!',
  mediaUrl: 'https://example.com/media.mp4',
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function renderHtml(template: string, alert: AlertData) {
  return template.replace(/\{\{\s*(supporter|amount|message|mediaUrl|fromText|from_text)\s*\}\}/g, (_match, key: string) => {
    const safeKey = key === 'from_text' ? 'fromText' : key;
    const value = alert[safeKey as keyof AlertData] ?? (safeKey === 'fromText' ? 'mengirim' : '');
    return escapeHtml(String(value));
  });
}

function createDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;900&family=Rajdhani:wght@600;700&display=swap');
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:'Rajdhani',sans-serif;color:#fff;background:#050b14}
    body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;background:linear-gradient(180deg,#050b14 0%,#0b1220 100%);overflow:hidden}
    .cyber-alert{display:flex;flex-direction:column;justify-content:center;align-items:center;max-width:480px;width:100%;margin:0 auto;font-family:'Rajdhani',sans-serif;animation:cyberPop .4s cubic-bezier(.18,.89,.32,1.28) forwards}
    .custom-media{width:220px;height:180px;margin:0 auto 12px auto;background-size:contain;background-repeat:no-repeat;background-position:center;display:block;animation:randomShuffleMedia 25s infinite steps(1);border-radius:16px;box-shadow:0 16px 35px rgba(0,0,0,.35)}
    .cyber-card{position:relative;width:100%;background:transparent;padding:0 15px;color:#fff;text-align:center;box-sizing:border-box}
    .cyber-header{font-family:'Orbitron',sans-serif;font-size:1.1rem;margin-bottom:12px;text-transform:uppercase;display:flex;align-items:center;justify-content:center;flex-wrap:wrap}
    .badge{background:#00ffcc;color:#0b0f19;padding:5px 12px;font-weight:900;border-radius:4px;display:inline-block;margin-right:4px;border:1.5px solid #000}
    .action{color:#fff;font-size:.95rem;font-weight:700;margin:0 4px;letter-spacing:1px;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000}
    .user{color:#ff007f;font-weight:900;display:inline-block;margin-left:4px;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000}
    .cyber-msg{font-size:1.25rem;font-weight:700;color:#fff;line-height:1.4;border:none;padding-top:4px;word-break:break-word;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000}
    .bell-ring{animation:bellShake 2s ease-in-out infinite}
    @keyframes randomShuffleMedia{0%,33.32%{background-image:url('https://xkslvfdguwvrhxetbmyw.supabase.co/storage/v1/object/public/assets/c-d-kompilasi-final.webp') }}
    @keyframes cyberPop{0%{transform:scale(.7) translateY(30px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}
    @keyframes bellShake{0%{transform:rotate(0)}5%{transform:rotate(14deg)}10%{transform:rotate(-12deg)}15%{transform:rotate(10deg)}20%{transform:rotate(-8deg)}25%{transform:rotate(4deg)}30%{transform:rotate(0)}100%{transform:rotate(0)}}
  </style></head><body>${html}</body></html>`;
}

export default function SociabuzzPage() {
  const [config, setConfig] = useState<AlertConfig>({
    mode: 'default',
    html: DEFAULT_HTML,
    durationMs: 8000,
    webhookTokenConfigured: false,
  });
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [visible, setVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webhookToken, setWebhookToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loadingWebhookLogs, setLoadingWebhookLogs] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const callbackUrl = webhookToken.trim()
    ? `${CALLBACK_URL}?token=${encodeURIComponent(webhookToken.trim())}`
    : CALLBACK_URL;
  const displayedCallbackUrl = webhookToken.trim()
    ? `${CALLBACK_URL}?token=********`
    : CALLBACK_URL;

  useEffect(() => {
    void fetch('/api/sociabuzz/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('Gagal memuat konfigurasi alert.');
        const data = await response.json();
        setConfig(data);
      })
      .catch((loadError: unknown) => {
        console.error('[SociaBuzz] Config load failed:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Gagal memuat konfigurasi.');
      });

    void fetch('/api/auth/me')
      .then((response) => response.json())
      .then((data) => setIsAdmin(Boolean(data?.authenticated && data?.user?.role === 'admin')))
      .catch(() => setIsAdmin(false));

    const source = new EventSource('/api/events');
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== 'sociabuzz') return;
        const data = payload.data as Partial<AlertData>;
        setAlert({
          amount: typeof data.amount === 'string' ? data.amount : '0',
          supporter: typeof data.supporter === 'string' ? data.supporter : 'Supporter',
          message: typeof data.message === 'string' ? data.message : '',
          mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : '',
          fromText: typeof data.fromText === 'string' ? data.fromText : 'mengirim',
        });
        setVisible(true);
      } catch (parseError) {
        console.error('[SociaBuzz] Could not parse incoming event:', parseError);
      }
    };
    source.onerror = (event) => console.warn('[SociaBuzz] Event stream connection issue:', event);
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), config.durationMs);
    return () => window.clearTimeout(timer);
  }, [visible, alert, config.durationMs]);

  const previewHtml = useMemo(() => {
    if (!alert) return '';
    const template = config.mode === 'custom' ? config.html : DEFAULT_HTML;
    return createDocument(renderHtml(template, alert));
  }, [alert, config.html, config.mode]);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/sociabuzz/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, webhookToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal menyimpan pengaturan.');
      setConfig((current) => ({ ...current, webhookTokenConfigured: result.webhookTokenConfigured }));
      setWebhookToken('');
      setSettingsOpen(false);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  }, [config, webhookToken]);

  const loadWebhookLogs = useCallback(async () => {
    setLoadingWebhookLogs(true);
    try {
      const response = await fetch('/api/sociabuzz/logs', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal memuat log webhook.');
      setWebhookLogs(Array.isArray(result.logs) ? result.logs : []);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Gagal memuat log webhook.');
    } finally {
      setLoadingWebhookLogs(false);
    }
  }, []);

  useEffect(() => {
    if (settingsOpen && isAdmin) void loadWebhookLogs();
  }, [settingsOpen, isAdmin, loadWebhookLogs]);

  const copyCallbackUrl = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (copyError) {
      console.error('[SociaBuzz] Could not copy callback URL:', copyError);
      setError('Gagal menyalin URL callback.');
    }
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#050b14]">
      {alert && (
        <iframe
          title="SociaBuzz alert"
          sandbox=""
          srcDoc={previewHtml}
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        />
      )}

      {isAdmin && (
        <>
          <button
            type="button"
            onClick={() => {
              setAlert(TEST_ALERT);
              setVisible(true);
            }}
            className="fixed bottom-5 left-5 rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-slate-800"
          >
            Test Alert
          </button>
          <button
            type="button"
            aria-label="Pengaturan SociaBuzz"
            onClick={() => setSettingsOpen(true)}
            className="fixed bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-full border border-violet-300/30 bg-slate-950/90 text-violet-200 shadow-xl backdrop-blur hover:bg-violet-950"
          >
            <Settings size={19} />
          </button>
        </>
      )}

      {settingsOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
          <section className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl">
            <header className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold">Pengaturan SociaBuzz Alert</h1>
                <p className="mt-1 text-xs text-slate-400">Custom HTML hanya berjalan di iframe terisolasi; JavaScript tidak diizinkan.</p>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Tutup pengaturan" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X size={18} />
              </button>
            </header>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold">Mode alert</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['default', 'custom'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConfig((current) => ({ ...current, mode }))}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${config.mode === mode ? 'border-violet-400 bg-violet-500/20 text-violet-100' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {config.mode === 'custom' && (
                <div>
                  <label htmlFor="sociabuzz-html" className="mb-2 flex items-center gap-2 text-sm font-semibold"><Code2 size={16} /> HTML alert</label>
                  <textarea
                    id="sociabuzz-html"
                    value={config.html}
                    onChange={(event) => setConfig((current) => ({ ...current, html: event.target.value }))}
                    rows={10}
                    spellCheck={false}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-mono text-xs leading-5 text-emerald-100 outline-none focus:border-violet-400"
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Placeholder: <code>{'{{supporter}}'}</code>, <code>{'{{amount}}'}</code>, <code>{'{{message}}'}</code>, <code>{'{{mediaUrl}}'}</code>. Contoh media: <code>{'<video src="{{mediaUrl}}" autoplay controls></video>'}</code>.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="sociabuzz-duration" className="mb-2 block text-sm font-semibold">Durasi alert (detik)</label>
                <input
                  id="sociabuzz-duration"
                  type="number"
                  min={1}
                  max={60}
                  value={Math.round(config.durationMs / 1000)}
                  onChange={(event) => setConfig((current) => ({ ...current, durationMs: Number(event.target.value) * 1000 }))}
                  className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400"
                />
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <label htmlFor="sociabuzz-token" className="mb-2 block text-sm font-semibold">Webhook token</label>
                <p className="mb-3 text-xs leading-5 text-slate-400">Masukkan token yang sama dengan pengaturan webhook SociaBuzz. Token disimpan sebagai teks biasa agar dapat dicocokkan langsung; batasi akses ke database dan URL callback.</p>
                <input
                  id="sociabuzz-token"
                  type="password"
                  autoComplete="new-password"
                  value={webhookToken}
                  onChange={(event) => setWebhookToken(event.target.value)}
                  placeholder={config.webhookTokenConfigured ? 'Token sudah tersimpan — isi hanya jika ingin mengganti' : 'Masukkan token webhook'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-black/40 px-3 py-2 text-xs text-cyan-200">{displayedCallbackUrl}</code>
                  <button type="button" onClick={copyCallbackUrl} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800">
                    <Copy size={14} /> {copied ? 'Tersalin' : 'Salin URL'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">Isi token yang sama di atas lalu salin URL untuk parameter token URL. URL salinan memuat token pada parameter <code>?token=</code>; jaga URL tersebut tetap privat.</p>
              </div>

              <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Log payload webhook</h2>
                    <p className="mt-1 text-xs text-slate-400">Maksimal 20 webhook valid terakhir. Token dan field sensitif dikecualikan.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadWebhookLogs()}
                    disabled={loadingWebhookLogs}
                    className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
                  >
                    <RefreshCw size={14} className={loadingWebhookLogs ? 'animate-spin' : ''} />
                    Muat ulang
                  </button>
                </div>
                {webhookLogs.length === 0 ? (
                  <p className="rounded-lg bg-black/30 px-3 py-4 text-center text-xs text-slate-500">
                    {loadingWebhookLogs ? 'Memuat log...' : 'Belum ada webhook valid yang tercatat.'}
                  </p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {webhookLogs.map((log) => (
                      <details key={log.id} className="rounded-lg border border-slate-800 bg-black/30 p-3">
                        <summary className="cursor-pointer text-xs text-slate-200">
                          <span className="font-semibold">{log.mapped?.supporter || 'Supporter'}</span>
                          <span className="text-slate-400"> · {log.mapped?.amount || '0'} · {log.eventType}</span>
                          <time className="mt-1 block text-[10px] text-slate-500">
                            {new Date(log.receivedAt).toLocaleString()}
                          </time>
                        </summary>
                        <div className="mt-3 space-y-3 text-xs">
                          <div>
                            <p className="mb-1 font-semibold text-violet-200">Hasil mapping alert</p>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-2 text-slate-300">{JSON.stringify(log.mapped, null, 2)}</pre>
                          </div>
                          <div>
                            <p className="mb-1 font-semibold text-cyan-200">Field payload diterima</p>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-2 text-slate-300">{JSON.stringify(log.payloadFields, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </section>

              {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}

              <footer className="flex justify-end gap-2 border-t border-slate-800 pt-4">
                <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Batal</button>
                <button type="button" onClick={() => void saveSettings()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-60">
                  {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} Simpan
                </button>
              </footer>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
