// The iPhone app wrapper (Capacitor). Everything here is a no-op on the web.
// Plugins are reached through window.Capacitor.Plugins, so the web bundle carries no native code.
const cap = () => window.Capacitor;
const plug = name => { const c = cap(); return c && c.Plugins ? c.Plugins[name] : null; };
export const isNative = () => { const c = cap(); return !!(c && c.isNativePlatform && c.isNativePlatform()); };

// A ?join=CODE from an invite link opened in the app (universal link or shiphead:// link).
export function joinCodeFrom(url) {
  try { return (new URL(url).searchParams.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); } catch (e) { return ''; }
}

// Start-up: status bar over the felt, hide the splash once the table is drawn, and route invite links into the lobby.
export function initNative({ onJoin }) {
  if (!isNative()) return;
  document.documentElement.classList.add('native');
  const SB = plug('StatusBar');
  try { if (SB) { SB.setStyle({ style: 'DARK' }); SB.setOverlaysWebView({ overlay: true }); } } catch (e) { /* older shells */ }
  const SS = plug('SplashScreen');
  if (SS) setTimeout(() => { try { SS.hide({ fadeOutDuration: 250 }); } catch (e) { /* already hidden */ } }, 350);
  const App = plug('App');
  if (App) {
    App.addListener('appUrlOpen', ev => { const c = joinCodeFrom(ev && ev.url); if (c) onJoin(c); });
    // a cold start from a link: the launch URL carries the code
    if (App.getLaunchUrl) App.getLaunchUrl().then(r => { const c = joinCodeFrom(r && r.url); if (c) onJoin(c); }).catch(() => {});
  }
}

// Ask for notifications at a moment of value (after a first online game), once. The token goes to the server through `send`.
// Returns a promise of true when a token was registered.
let asked = false;
export function askForPush(send) {
  const P = plug('PushNotifications');
  if (!isNative() || !P || asked) return Promise.resolve(false);
  asked = true;
  return new Promise(resolve => {
    P.addListener('registration', t => { send(t.value).then(() => resolve(true), () => resolve(false)); });
    P.addListener('registrationError', () => resolve(false));
    P.requestPermissions().then(r => { if (r.receive === 'granted') P.register(); else resolve(false); }).catch(() => resolve(false));
  });
}

// Tapping a notification opens its table.
export function onPushOpen(onJoin) {
  const P = plug('PushNotifications');
  if (!P) return;
  P.addListener('pushNotificationActionPerformed', a => {
    const code = a && a.notification && a.notification.data && a.notification.data.code;
    if (code) onJoin(String(code));
  });
}
