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
  membaca status hasilnya, dan mengirim event gift uji langsung ke widget SSE
  tanpa menunggu debounce gift live. Event uji memakai ID unik dan tidak
  dibuang oleh content dedup.
- `/api/events` mengirim SSE dan menghapus `actions`, `adbCommandId`, serta
  `adbStartToken` dari payload publik. Dengan demikian widget tidak menerima
  command ID atau konfirmasi selesai dari agent.

### Batas sinkronisasi widget dan ADB saat ini

Queue notifikasi di `app/widget/page.tsx` bersifat serial. Implementasi saat ini
menghitung perkiraan waktu aksi ADB dari durasi swipe dan `delayAfter`, lalu
menahan giliran widget setidaknya selama perkiraan itu. Ini bukan konfirmasi
bahwa ADB benar-benar mulai/selesai: widget dan command ADB masih dua queue
terpisah, tidak diikat ke `commandId`, dan SSE tidak mengirim acknowledgment.
Jika ADB lambat/gagal/offline, notifikasi dapat selesai lebih dahulu atau item
berikutnya tampil saat command sebelumnya belum selesai.

Notifikasi kini dibuat terlihat sebelum widget menunggu hasil prefetch TTS.
Agent lokal memeriksa queue setiap 250 ms untuk mengurangi jeda sejak command
masuk. Karena ADB masih dieksekusi melalui polling HTTP/database dari laptop
ke Render, latensi jaringan dan siklus polling tetap membuat waktu mulai tidak
dapat dijamin identik hingga milidetik.

Jangan anggap sinkronisasi selesai hanya karena build sukses. Untuk jaminan
"notifikasi dan aksi mulai bersama; item berikutnya menunggu hasil command
ADB", perubahan berikutnya perlu menghubungkan setiap event dengan ID command,
mengirim status hasil secara aman ke widget (misalnya endpoint/SSE status
khusus), dan membuat queue menunggu hasil terminal `completed`/`failed` serta
durasi minimum overlay. Tetapkan juga perilaku jika agent offline atau hasil
tidak pernah diterima.

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
- `lib/db.ts` masih memuat helper serta tipe giveaway/WhatsApp. Pastikan route
  atau UI pemakainya masih ada sebelum memperluas fitur tersebut; jangan
  menyimpulkan bahwa semua tabel legacy adalah bagian dari alur utama ADB.

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
- `README.md` masih menyebut queue widget independen dari hasil ADB. Itu
  menggambarkan batas implementasi, tetapi tidak memenuhi kebutuhan sinkronisasi
  yang diinginkan. Perbarui README setelah acknowledgment ADB benar-benar
  diterapkan.
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
  Worktree pernah memiliki perubahan lokal pada file konfigurasi serta
  penghapusan fitur giveaway; jangan ikut commit/revert tanpa instruksi.