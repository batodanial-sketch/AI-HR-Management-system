export type DesktopNotification = { title: string; body: string }
type ElectronAPI = { isDesktop: boolean; window: { minimize: () => Promise<void>; maximize: () => Promise<boolean>; close: () => Promise<void> }; notifications: { show: (payload: DesktopNotification) => Promise<boolean> }; files: { selectTextFile: () => Promise<{ filePath: string; name: string } | null>; readSelectedTextFile: (path: string) => Promise<string> } }
declare global { interface Window { electron?: ElectronAPI } }
export const electronBridge = {
  isDesktop: () => Boolean(typeof window !== 'undefined' && window.electron?.isDesktop),
  minimize: () => window.electron?.window.minimize(),
  maximize: () => window.electron?.window.maximize(),
  close: () => window.electron?.window.close(),
  notify: (payload: DesktopNotification) => window.electron?.notifications.show(payload) || Promise.resolve(false),
  selectTextFile: () => window.electron?.files.selectTextFile() || Promise.resolve(null),
  readSelectedTextFile: (filePath: string) => window.electron?.files.readSelectedTextFile(filePath) || Promise.reject(new Error('Electron desktop bridge is unavailable.'))
}
