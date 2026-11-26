// Plattformslager: samma anrop i webbläsaren och i den inbyggda appen (Capacitor).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/* ---------- Lagring ----------
   I appen används Preferences (UserDefaults), eftersom iOS kan rensa localStorage i en WebView.
   På webben används localStorage, med minnet som reserv om det är blockerat. */
let memory = null;
export async function loadRaw(key) {
  try {
    if (isNative()) { const { value } = await Preferences.get({ key }); return value; }
    return localStorage.getItem(key);
  } catch { return memory; }
}
export async function saveRaw(key, value) {
  memory = value;
  try {
    if (isNative()) await Preferences.set({ key, value });
    else localStorage.setItem(key, value);
  } catch { /* minnet räcker under sessionen */ }
}

/* ---------- Haptik ---------- */
let hapticsOn = true;
export const setHaptics = (on) => { hapticsOn = on; };
let switchLabel = null;
function webTick() {
  try {
    if (navigator.vibrate) { navigator.vibrate(5); return; }
    // iOS Safari 18–26.4: en klickad switch-checkbox ger en kort knäpp. Ofarligt där det inte fungerar.
    if (!switchLabel) {
      switchLabel = document.createElement('label');
      switchLabel.setAttribute('aria-hidden', 'true');
      switchLabel.style.cssText = 'position:fixed;left:-200px;top:0;opacity:0;pointer-events:none';
      switchLabel.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.appendChild(switchLabel);
    }
    switchLabel.click();
  } catch { /* ingen haptik */ }
}
export const haptic = {
  tick() { if (!hapticsOn) return; if (isNative()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); else webTick(); },
  start() { if (!hapticsOn) return; if (isNative()) Haptics.selectionStart().catch(() => {}); },
  end() { if (!hapticsOn) return; if (isNative()) Haptics.selectionEnd().catch(() => {}); },
  snap() {
    if (!hapticsOn) return;
    if (isNative()) Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    else if (navigator.vibrate) navigator.vibrate([16, 20, 36]); else webTick();
  },
  success() { if (!hapticsOn) return; if (isNative()) Haptics.notification({ type: NotificationType.Success }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate([20, 60, 20, 60, 40]); },
  nope() { if (!hapticsOn) return; if (isNative()) Haptics.notification({ type: NotificationType.Warning }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate(12); else webTick(); }
};

/* ---------- Dela en bild ----------
   Returnerar 'shared' | 'cancelled' | 'fallback' (då visar anroparen bilden själv). */
export async function shareImage(blob, title) {
  try {
    if (isNative()) {
      const data = await blobToBase64(blob);
      const path = `rivblock-${Date.now()}.png`;
      const res = await Filesystem.writeFile({ path, data, directory: Directory.Cache });
      await Share.share({ title, files: [res.uri] });
      return 'shared';
    }
    const file = new File([blob], 'rivblock.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (e && (e.name === 'AbortError' || /cancel/i.test(String(e.message)))) return 'cancelled';
  }
  return 'fallback';
}
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/** Dela en länk med text. 'shared' | 'copied' | 'failed' */
export async function shareLink(text, url) {
  try {
    if (isNative()) { await Share.share({ text, url }); return 'shared'; }
    if (navigator.share) { await navigator.share({ text, url }); return 'shared'; }
  } catch (e) { if (e && (e.name === 'AbortError' || /cancel/i.test(String(e.message)))) return 'cancelled'; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); return 'copied'; } catch { return 'failed'; }
}

/* ---------- Spara en textfil (säkerhetskopia) ---------- */
export async function saveTextFile(name, text) {
  try {
    if (isNative()) {
      const res = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: 'utf8' });
      await Share.share({ title: name, files: [res.uri] });
      return 'shared';
    }
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return 'shared'; }
    // Inbäddad (t.ex. förhandsvisning) blockerar nedladdningar tyst – låt anroparen visa texten i stället
    let framed = true; try { framed = window.self !== window.top; } catch { framed = true; }
    if (framed) return 'failed';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'downloaded';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}

/* ---------- Påminnelser (bara i appen) ---------- */
export const remindersSupported = () => isNative();
const BASE_ID = 5000, MAX = 21;
/** Ersätter alla schemalagda påminnelser med en per angivet datum. ask=true får be om tillstånd. */
export async function scheduleReminders(items, ask = false) {
  if (!isNative()) return false;
  try {
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
    const ours = pending.notifications.filter((n) => n.id >= BASE_ID && n.id < BASE_ID + 100).map((n) => ({ id: n.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });
    if (!items.length) return true;
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted' && ask) perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: items.slice(0, MAX).map((it, i) => ({ id: BASE_ID + i, title: it.title, body: it.body, schedule: { at: it.at, allowWhileIdle: true } }))
    });
    return true;
  } catch { return false; }
}

/* ---------- Statusrad (appen) ---------- */
/** Statusradens text: ljus på mörk bakgrund och tvärtom */
export async function setStatusBar(dark) {
  if (!isNative()) return;
  try { const { StatusBar, Style } = await import('@capacitor/status-bar'); await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }); } catch { /* valfritt */ }
}

export async function setupNativeChrome() {
  if (!isNative()) return;
  try {
    await setStatusBar(document.documentElement.dataset.dark === '1');
  } catch { /* valfritt */ }
  try { const { SplashScreen } = await import('@capacitor/splash-screen'); await SplashScreen.hide(); } catch { /* valfritt */ }
}

/* ---------- Köp (förberett; kopplas till StoreKit i appen) ----------
   Webben säljer inget. I appen ska en StoreKit-plugin (t.ex. RevenueCat eller cordova-plugin-purchase)
   anropas här. Tills dess returnerar funktionerna 'unavailable'. */
export const PRICE_LABEL = '49 kr';
export async function buyPro() { return 'unavailable'; }
export async function restorePro() { return 'unavailable'; }

/* ---------- Widget (bara i iPhone-appen) ----------
   ios/App/App/WidgetBridge.swift lägger JSON i App Group-lådan som widgeten läser. */
const WidgetBridge = registerPlugin('WidgetBridge');
export function updateWidget(json) {
  if (platform() !== 'ios') return;
  WidgetBridge.set({ json }).catch(() => {});
}
