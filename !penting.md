# Catatan Penting Project

Catatan orientasi teknis untuk membantu pengembangan berikutnya. Dokumen ini
menggambarkan perilaku yang terlihat pada source code saat ini; jika berbeda
dengan README atau rencana fitur, verifikasi implementasi dan deployment aktif
sebelum mengambil keputusan.

## Tujuan dan arsitektur

Project ini adalah aplikasi Next.js untuk mengelola TikTok Live, menampilkan
overlay stream, dan mengirim aksi reward ke perangkat Android:

1. Listener TikTok berjalan di service Node/Render dan mengirim event ke API.
   Listener Python `main.py` juga tersedia; endpoint `/api/listener` dapat
   menjalankannya bila Python tersedia, lalu mencoba listener Node sebagai
   fallback.
2. API mencocokkan event dengan konfigurasi/reward, menyimpan command ADB ke
   PostgreSQL melalui Prisma, lalu meneruskan event tampilan ke SSE.
3. GUI Windows di `scripts/adb_agent_gui.py` menjalankan `scripts/adb_agent.py`.
   Agent lokal mengirim heartbeat, mengambil command dari Render, menjalankan
   `adb` pada HP yang tersambung ke laptop, lalu melaporkan hasilnya. Laptop
   dan agent harus tetap aktif selama aksi dibutuhkan.
4. `/widget` adalah overlay OBS yang dapat dibuka tanpa login. Admin yang login
   dapat memakai editor/configurasi dari halaman tersebut; `/comment` juga
   dibebaskan dari pemeriksaan login middleware.
   Prompt untuk mengaktifkan audio harus tetap non-blocking agar tidak
   menutupi tampilan notifikasi di OBS.

Jangan menjalankan ADB pada Render untuk HP yang terhubung via USB ke laptop.
Render hanya menyimpan/mengantrekan aksi; GUI/agent lokal adalah jembatan ke HP.
Untuk error Android `INJECT_EVENTS`, cek dukungan dan izin input pada firmware
HP. Perubahan koordinat atau server tidak dapat memberikan izin Android itu.

## Alur event dan antrean

- Gift masuk melalui `/api/gift-event`. Event gift digabung per username dan
  nama gift selama jendela debounce 5 detik sebelum reward dicari, command ADB
  dibuat, lalu event widget dikirim.
- Like/milestone diproses di `/api/like-event`; ambang dan mode milestone
  membaca `widgetConfig`/setting dan reward `Like Milestone`.
- Comment, join, follow, fan, dan share mempunyai endpoint event masing-masing.
  Listener juga dapat mengirim event secara langsung melalui emitter internal.
- Event ID dideduplikasi di memory proses; gift aggregation memakai `Map` dan
  timer in-memory. Keduanya tidak tahan restart dan tidak berbagi state antar
  instance Render.
- Command ADB disimpan di tabel `adb_commands`, diklaim secara atomik lewat
  fungsi PostgreSQL `claim_adb_command`, dan diproses berurutan oleh agent
  polling lokal (interval 250 ms). Command `processing` yang lebih tua dari
  15 menit dapat diklaim ulang. Status command: `queued`, `processing`,
  `completed`, `failed`.
- Aksi yang masuk ke `enqueueAdbActions` dinormalisasi dan divalidasi di
  `lib/adb-queue.ts` (maksimal 20 aksi; jenis click, keyevent, swipe, text).
  Uji reward dari UI menggunakan `/api/trigger`, membuat command ADB langsung,
  lalu status hasilnya dibaca oleh UI. Payload notifikasi uji disimpan sebagai
  metadata server-side dan baru dikirim ke widget setelah agent melaporkan
  aksi ADB berhasil.
- `/api/events` mengirim SSE dan menghapus `actions`, `adbCommandId`, serta
  metadata internal sebelum payload dikirim ke publik. Agent tidak menerima
  payload notifikasi di response claim.

### Sinkronisasi widget dan hasil aksi ADB

Untuk gift/like yang memiliki aksi aktif dan test reward, payload notifikasi
disimpan pada metadata command dan tidak dikirim saat command diklaim. Setelah
agent menyelesaikan seluruh aksi ADB dan melaporkan hasil berhasil, server
mengubah status command menjadi `completed`, lalu mengirim notifikasi lewat
SSE. Jika aksi gagal, server menyimpan status `failed` dan notifikasi reward
terkait tidak dikirim. Event tanpa aksi ADB tetap langsung dikirim.

Karena notifikasi menunggu laporan selesai dari agent, aksi ADB dimulai dan
diselesaikan terlebih dahulu. Setelah itu masih ada latensi HTTP, SSE, render
browser, dan antrean notifikasi sebelum overlay terlihat. Jika agent offline,
notifikasi reward menunggu sampai aksi berhasil dilaporkan. Status `completed`
berarti seluruh perintah ADB berhasil dijalankan oleh agent; bukan verifikasi
visual bahwa aplikasi Android merespons aksi sesuai harapan.

Command reward ADB membawa flag acknowledgment di metadata. Fungsi DB
`claim_adb_command` menahan command selanjutnya selama ada notifikasi reward
yang selesai aksi ADB-nya tetapi belum diakui widget. Widget mengirim
acknowledgment setelah notifikasi selesai ditampilkan (termasuk transisi keluar);
baru setelah server menyimpan acknowledgment agent dapat mengambil command
berikutnya. Jika widget offline/reload saat notifikasi tertunda, `/api/events`
memutar ulang notifikasi yang belum di-ack. Gagal mengirim acknowledgment akan
dicoba ulang oleh widget dan menahan antrean ADB sampai berhasil.

Widget menggambar notifikasi custom melalui elemen canvas yang dikonfigurasi.
Jika tidak ada elemen yang cocok dengan tipe event, gunakan fallback notifikasi
bawaan agar event tetap terlihat. Prompt audio tidak boleh menjadi lapisan
fullscreen yang menghalangi overlay publik.

## Penyimpanan dan database

- Supabase/PostgreSQL menyimpan settings, rewards, presets, detected gifts,
  user likes, dan tabel legacy lain. Skema dasar tabel aplikasi ada di
  `scripts/supabase_schema.sql`.
- `lib/db.ts` adalah lapisan data lama yang mencampur cache memory, akses
  Supabase, dan fallback SQLite lokal (`data/app.db`). Operasi Supabase
  sebagian berjalan asynchronous dan error-nya sering hanya dicatat; jangan
  mengasumsikan fungsi `setSetting`/`setReward` memastikan data sudah durable
  sebelum return.
- Prisma saat ini dipakai terutama untuk `adb_commands` dan `adb_agents`, bukan
  sebagai ORM seluruh database aplikasi. Modelnya di `prisma/schema.prisma`;
  migration queue ada di `prisma/migrations/20261010000000_adb_agent_queue/`.
- Migrasi dijalankan dengan `npm run db:migrate:deploy`, yang menggunakan
  `DIRECT_URL` untuk akses langsung dan dapat melakukan baseline khusus bila
  database telah berisi tabel.
- Migrasi untuk mengubah schema harus dibuat dan diuji dengan hati-hati pada
  database development. Jangan menjalankan reset pada database production.
- Halaman giveaway dan integrasi WhatsApp yang hanya dipakai halaman tersebut
  telah dihapus. Migrasi `20261011010000_remove_giveaway_feature` menghapus
  tabel peserta giveaway, tabel anggota WA, dan setting `giveaway_*` dari
  Supabase; inisialisasi SQLite lokal juga membuang tabel/setting yang sama.
- `/sociabuzz` adalah overlay alert SociaBuzz. Callback `POST
  /sociabuzz/callback` menerima JSON, memvalidasi shared token dari header
  `Authorization: Bearer`, `x-webhook-token`, atau `x-sociabuzz-token`, lalu
  mengirim event melalui SSE `/api/events`. Test alert admin dikirim melalui
  `POST /api/sociabuzz/test` ke seluruh klien SSE yang terhubung. Audio memakai
  URL HTTPS dari payload webhook bila tersedia (termasuk URL suara bersarang
  dan file media audio/video), atau bunyi default; indikator speaker tampil
  selama audio diputar. Browser yang memblokir autoplay meminta aktivasi suara
  dari halaman overlay. Token disimpan sebagai SHA-256 hash
  pada setting `sociabuzzWebhookTokenHash`; admin mengatur token dan template
  dari ikon pengaturan di halaman. Custom alert menerima HTML/CSS tanpa
  JavaScript dan dirender pada iframe sandbox; placeholder yang didukung:
  `{{supporter}}`, `{{amount}}`, `{{message}}`, `{{mediaUrl}}`, dan
  `{{mediaMarkup}}` untuk menampilkan media default.
  Callback juga merespons `GET /sociabuzz/callback` untuk HTTP test/health
  check; metode GET hanya mengonfirmasi endpoint aktif dan tidak membuat alert.

## Peta folder dan entry point

- `app/page.tsx`: dashboard/admin, kontrol listener, konfigurasi dan reward.
- `app/widget/page.tsx`: overlay OBS, antrean notifikasi, TTS dan editor admin.
- `app/comment/page.tsx`: overlay komentar.
- `app/textberjalan/page.tsx`: halaman teks berjalan.
- `app/api/**/route.ts`: API autentikasi, config, event, listener, upload, TTS,
  ADB agent/status, dan pengelolaan reward.
- `components/ui/`: komponen seperti konfigurator aksi, QR scanner, dan modal
  screenshot.
- `lib/`: akses data, Prisma/Supabase, auth, listener TikTok, SSE emitter,
  deduplikasi, dan queue ADB.
- `scripts/adb_agent_gui.py`, `scripts/adb_agent.py`: GUI dan worker ADB lokal.
- `main.py`: listener TikTok Python yang mem-post event ke service Next.js.
- `prisma/` dan `scripts/supabase_schema.sql`: schema/migrasi database.

## Konfigurasi dan perintah pengembangan

Variabel yang perlu disiapkan melalui environment lokal/Render sesuai layanan:

- `DATABASE_URL` dan `DIRECT_URL` untuk PostgreSQL/Supabase; pada pooler
  Supabase lazimnya URL aplikasi memakai pooler, sedangkan migrasi memakai
  koneksi langsung/session.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan
  `SUPABASE_SERVICE_ROLE_KEY`. Service-role key hanya untuk server; jangan
  gunakan prefix `NEXT_PUBLIC_` untuk secret.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`.
- `TIKTOK_LISTENER_TOKEN` untuk membatasi kemampuan listener memicu reward ADB.
- `ADB_AGENT_TOKEN` untuk autentikasi agent laptop ke endpoint ADB.
- `RENDER_APP_URL` dan opsional `ADB_PATH` pada lingkungan GUI/agent lokal.

`/.env.example` belum memuat seluruh variabel runtime tersebut. Jangan menyalin
nilai rahasia dari `.env.local` ke dokumentasi, source control, log, atau chat.

Perintah utama:

```powershell
npm install
npm run dev             # Next.js lokal di port 3005
npm run build           # Prisma generate + Next.js build/type-check
npm run start            # Next.js production server
npm run lint             # ESLint
npm run gui              # GUI agent ADB Windows
npm run db:migrate:deploy
```

Render perlu memasang dependency Python dan Node sebelum build (lihat langkah
deploy di `README.md`). Gunakan service yang tetap hidup selama live stream;
proses in-memory dan listener bukan worker serverless yang tahan suspend.

## Keamanan dan operasional: cek sebelum mengubah

- Middleware melewatkan seluruh prefix `/api`; karena itu setiap route API
  harus menerapkan autentikasinya sendiri. Saat ini `/api/config` menerima
  `GET` dan `POST` tanpa verifikasi admin, sehingga konfigurasi/reward berisiko
  dibaca atau diubah tanpa login. Audit route lain secara terpisah sebelum
  menganggap API privat.
- `lib/auth.ts` memiliki fallback kredensial admin dan JWT secret bila env
  belum diatur. `scripts/supabase_schema.sql` juga berisi seed akun admin
  dengan password plaintext. Wajib ganti/nonaktifkan default itu untuk
  deployment, dan jangan gunakan skema seed tersebut apa adanya di production.
- `/api/adb/agent/*` menggunakan bearer `ADB_AGENT_TOKEN`; endpoint event
  membedakan request admin/listener untuk izin membuat aksi. Jangan log token,
  mengekspos token ke browser, atau membuka ADB/port USB ke internet.
- `lib/events.ts`, listener status, gift aggregator, serta dedup menggunakan
  state memory lokal. SSE hanya menjangkau emitter proses yang sama dan tidak
  punya replay event. Satu instance/restart dapat kehilangan event atau
  memutus sinkronisasi; multi-instance memerlukan pub/sub terdistribusi dan
  state tahan lama.
- README dan catatan ini menjelaskan notifikasi reward dikirim setelah hasil
  aksi ADB berhasil diterima server, kemudian command berikutnya ditahan sampai
  widget mengonfirmasi notifikasi selesai. Event SSE live tetap bergantung pada
  emitter proses Render yang sama; replay pending menjembatani widget reconnect.
- Untuk event/ADB, uji minimal: event biasa, duplicate event ID, event gift
  beruntun, aksi lebih dari satu, agent offline, aksi gagal, serta dua event
  berurutan. Tes Android nyata tetap diperlukan untuk memastikan izin dan aksi
  pada perangkat.

## Validasi saat ini dan kehati-hatian

- `package.json` tidak mendefinisikan script test otomatis. Jalankan build dan
  lint yang relevan; jika menambah logika queue, tambahkan pengujian terarah
  untuk aturan urutan, kondisi sukses/gagal, dan timeout.
- Build terakhir yang dijalankan pada sesi pengembangan berhasil. Build
  menampilkan warning pola file luas di `app/api/tts/route.ts` dan peringatan
  convention `middleware`; keduanya bukan error build.
- Sebelum commit, periksa `git status` dan stage file yang memang terkait tugas.
  Worktree pernah memiliki perubahan lokal pada file konfigurasi; jangan ikut
  commit/revert tanpa instruksi.