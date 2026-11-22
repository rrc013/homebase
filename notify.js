// Phone notifications: turn on for this phone, send a test
import { S, me, household, toast, run, actions, hooks } from './core.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

let thisEndpoint = null;
async function refreshState() {
  if (!supported() || S.api?.demo) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const was = thisEndpoint;
    thisEndpoint = sub?.endpoint || null;
    if (was !== thisEndpoint) hooks.render();
  } catch { /* ignore */ }
}

export function notificationsHtml() {
  setTimeout(refreshState, 0);
  if (!supported() && !S.api?.demo) return '<small class="muted">🔕 This browser can\'t show notifications. On Android, open Homebase in Chrome and add it to your home screen.</small>';
  if (me()?.kind !== 'parent') return '';
  const on = S.api?.demo ? S.demoNotify : (thisEndpoint && Notification.permission === 'granted'
    && S.data.push_subscriptions.some((p) => p.endpoint === thisEndpoint));
  if (!S.api?.demo && Notification.permission === 'denied') return '<small class="muted">🔕 Notifications are blocked for Homebase. Turn them on in Chrome → ⋮ → Settings → Site settings → Notifications.</small>';
  return on
    ? `<div class="row between wrap"><span>🔔 <b>Notifications are on</b> for this phone</span>
        <div class="row"><button class="btn small-btn" data-act="notify-test">Send test</button><button class="btn small-btn ghost" data-act="notify-off">Turn off</button></div></div>
       <small class="muted">You'll get: tasks someone gives you, reminders when they're due, and the kids' photo proofs & prize requests.</small>`
    : `<button class="btn primary" data-act="notify-on">🔔 Turn on notifications for this phone</button>
       <small class="muted">Get a ping when someone gives you a task, when reminders are due, and when the kids need an OK.</small>`;
}

Object.assign(actions, {
  'notify-on': async () => {
    if (S.api.demo) { S.demoNotify = true; toast('Demo: notifications would be on'); hooks.render(); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications were not allowed'); hooks.render(); return; }
    await run(async () => {
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await S.api.fn('notify', { action: 'vapid' });
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const j = sub.toJSON();
      await S.api.removeWhere('push_subscriptions', 'endpoint', j.endpoint).catch(() => {});
      await S.api.insert('push_subscriptions', { household_id: household().id, member_id: me().id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
      thisEndpoint = j.endpoint;
    }, 'Notifications are on 🔔');
    await hooks.loadAll(); hooks.render();
  },
  'notify-test': async () => {
    if (S.api.demo) { toast('Demo: a test notification would arrive now'); return; }
    const r = await run(() => S.api.fn('notify', { action: 'test' }));
    if (r) toast(r.sent ? 'Test sent — check your notifications' : 'No phone found — try turning notifications off and on');
  },
  'notify-off': async () => {
    if (S.api.demo) { S.demoNotify = false; hooks.render(); return; }
    await run(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await S.api.removeWhere('push_subscriptions', 'endpoint', sub.endpoint); await sub.unsubscribe(); }
      thisEndpoint = null;
    }, 'Notifications off for this phone');
    await hooks.loadAll(); hooks.render();
  },
});
