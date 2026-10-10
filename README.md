This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Render TikTok Listener with Local USB ADB

The TikTok listener and event processing can run on Render while a small agent on
the laptop forwards approved tap, swipe, key, and text actions to an Android
device connected over USB. The laptop must remain on and the agent must keep
running; it does not run the TikTok listener.

### One-time setup

1. Set `DATABASE_URL` and `DIRECT_URL` in Render to your Supabase PostgreSQL
   connection strings. `DATABASE_URL` should use the transaction pooler
   (port 6543); `DIRECT_URL` should use a direct or session connection (port
   5432). Keep both values private and never expose them to the browser.
2. Add two different long random secrets to the Render service environment:
   `ADB_AGENT_TOKEN` and `TIKTOK_LISTENER_TOKEN`. The listener token prevents
   public event requests from triggering configured phone actions. Never commit
   either token. You can generate each value in PowerShell with:

   ```powershell
   [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
   ```

   Run it twice and save the two values temporarily so you can enter them in
   Render and use the ADB token on the laptop.
   In Render, set the build command to
   `python3 -m pip install -r requirements.txt && npm ci && npm run build`
   so both the Python TikTok listener dependencies and Node dependencies are
   installed. Keep the start command as `npm start`.
3. Apply pending database migrations from the project root:

   ```powershell
   npm run db:migrate:deploy
   ```

   The command loads `DATABASE_URL` and `DIRECT_URL` from the local Next.js
   environment files and applies the Prisma migrations. Render also needs the
   database URLs to access the ADB queue and agent status through Prisma.
4. Install Android Platform Tools on the laptop, enable USB debugging on the
   phone, connect it by USB, and accept the USB debugging prompt.
5. On Windows, open a terminal in the project folder and run:

   ```powershell
   npm run gui
   ```

   This opens the GUI in a separate window. You can also double-click
   `scripts\start_adb_agent_gui.bat`. Enter the Render URL and
   `ADB_AGENT_TOKEN`, select `adb.exe` if it is not detected, then use
   **Cek HP USB** and **Sambungkan agent**. Use **Cek status Render** to confirm
   the remote agent heartbeat. The GUI can remember the token encrypted for
   your Windows user with DPAPI.

   Or start the agent manually from PowerShell:

   ```powershell
   $env:RENDER_APP_URL = "https://your-service.onrender.com"
   $env:ADB_AGENT_TOKEN = Read-Host "Paste the Render ADB_AGENT_TOKEN"
   python scripts\adb_agent.py
   ```

   If `adb` is not on `PATH`, also set `$env:ADB_PATH` to the full path of
   `adb.exe`.
6. Confirm the dashboard reports the ADB device as connected. Keep the agent
   process running while streaming. The agent polls the server for queued
   actions and reports completion or errors. Device screenshots are also
   captured by this local agent, not by running ADB on Render. ADB child
   processes are launched without opening a console window. The reward
   configurator's **Test** button sends its current action sequence directly
   to the ADB queue and waits for the agent's execution result; it does not
   simulate a TikTok gift event.

If ADB reports `SecurityException` mentioning `INJECT_EVENTS` for tap, swipe,
or key events, Android has denied input injection even though USB debugging is
connected. On devices that provide it, enable **USB debugging (Security
settings)** in Developer options, reconnect USB, and accept the debugging
authorization prompt again. If the device firmware does not expose or honor
that setting, standard `adb shell input` cannot inject touch events without
device-level privileges; changing the configured coordinates will not fix
this permission error.

The laptop agent uses an outbound HTTPS connection and a bearer token; do not
expose the ADB server or its USB connection to the public internet. The listener
service on Render must also be configured to stay running during a live stream.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
