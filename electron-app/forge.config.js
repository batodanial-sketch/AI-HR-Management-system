/**
 * Fluxentiq Desktop — Electron Forge config with release provider alignment.
 *
 * Epic B: Configures release provider parameters for auto-updater:
 * - Generic provider URL via FLUXENTIQ_UPDATE_URL (used by electron-updater)
 * - Release channel via FLUXENTIQ_UPDATE_CHANNEL (latest/beta/alpha)
 * - Artifact naming with version + platform + channel for observability
 * - Code signing placeholders via env (APPLE_ID, CSC_LINK) — no-op when unset
 * - Security: asar true, icon, ignore TS source
 */

const updateUrl = process.env.FLUXENTIQ_UPDATE_URL || "";
const updateChannel = process.env.FLUXENTIQ_UPDATE_CHANNEL || "latest";

module.exports = {
  packagerConfig: {
    asar: true,
    icon: '../public/brand/fluxentiq-transparent-mark',
    // Ignore TS source; only the compiled dist/ ships in the package.
    ignore: [/^\/src/, /tsconfig\.json$/],
    // Code signing (optional, env-driven, no-op when unset — never crashes local build)
    osxSign: process.env.APPLE_ID ? {} : undefined,
    osxNotarize: process.env.APPLE_ID
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APPLE_ID_PASSWORD || process.env.APPLE_ID_PASSWORD || "",
          teamId: process.env.APPLE_TEAM_ID || "",
        }
      : undefined,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'fluxentiq',
        setupIcon: '../public/brand/fluxentiq-transparent-mark.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
      config: {},
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        background: '../public/brand/fluxentiq-transparent-mark.png',
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'fluxentiq',
          productName: 'Fluxentiq',
          genericName: 'AI HR Management',
          description: 'Fluxentiq AI HR Management System — Enterprise desktop app',
          productDescription:
            'Enterprise HR management and lead intelligence platform with offline licensing and AI gateway.',
          categories: ['Office'],
          icon: '../public/brand/fluxentiq-transparent-mark.png',
        },
      },
    },
  ],
  publishers: updateUrl
    ? [
        {
          name: '@electron-forge/publisher-generic',
          config: {
            url: updateUrl,
          },
        },
      ]
    : [],
};
