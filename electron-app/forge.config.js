module.exports = {
  packagerConfig: {
    asar: true,
    icon: '../public/brand/fluxentiq-transparent-mark',
    // Ignore TS source; only the compiled dist/ ships in the package.
    ignore: [/^\/src/, /tsconfig\.json$/]
  },
  makers: [
    { name: '@electron-forge/maker-squirrel', config: {} },
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'linux'] },
    { name: '@electron-forge/maker-dmg', config: {} },
    { name: '@electron-forge/maker-deb', config: {} }
  ]
}
