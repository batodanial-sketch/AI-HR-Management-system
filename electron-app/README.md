# Fluxentiq Desktop

Frameless, sandboxed Electron shell for the Fluxentiq web app. Written in
strictly typed TypeScript (`src/*.ts`) and compiled to `dist/` before launch.

## Prerequisites

- Node.js 20+
- Fluxentiq web application running locally or deployed over HTTPS

## Development

From the repo root, start Next.js:

```bash
npm run dev
```

Then in a second terminal:

```bash
cd electron-app
npm install
npm start          # runs `tsc` then launches Electron against localhost:3000
```

To point Electron at a deployed workspace:

```bash
FLUXENTIQ_DESKTOP_URL=https://your-domain.com npm start
```

## Structure

```
electron-app/
  src/
    main.ts         # window + tray + session hardening
    preload.ts      # contextBridge → typed DesktopApi (the ONLY renderer surface)
    ipcHandlers.ts  # channel handlers with input validation
    updater.ts      # electron-updater (production-only, generic feed)
    contract.ts     # shared IPC channel names + DesktopApi types
  dist/             # compiled output (main entry = dist/main.js)
```

## Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`
- All permission requests denied by default
- Renderer only sees `window.electron` (typed functions) — never `ipcRenderer`/`remote`
- Navigation locked to the workspace URL + Supabase origin; external links open in the system browser
- Desktop file reads restricted to files selected via the native dialog (extension allow-list)

## Auto-updates

Production builds poll `FLUXENTIQ_UPDATE_URL` (generic electron-updater feed).
Auto-updating is a no-op in development (`app.isPackaged === false`).

## Packaging

```bash
npm run make
```

Produces Squirrel (Windows), ZIP (macOS/Linux), DMG (macOS) and DEB (Linux).
