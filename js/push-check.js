// Ранняя проверка: работают ли уведомления и Web Push на этом iPhone (важно для ЕС).
// Сервер не нужен: проверяем разрешение, локальное уведомление и саму подписку на push.
// Ключ ниже — одноразовый публичный VAPID-ключ только для проверки подписки;
// приватная часть не сохранялась. Для настоящих push (этап 2) будет новая пара ключей.

import { t } from './i18n.js';

const TEST_KEY = 'BIAuRkm-UzSlzr1yag7SH82cL5HArQTVy_Uln7Wnoiw57gr9bdzEZCHf7MGTyIOupnmVYuwz_kubMK2cdkDLxNk';

function keyBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Возвращает список [название, ok, подробность]
export async function pushCheck() {
  const r = [];
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  r.push([t('push.standalone'), standalone]);
  r.push([t('push.notificationApi'), 'Notification' in window]);
  r.push([t('push.pushApi'), 'PushManager' in window]);
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return r;

  const perm = await Notification.requestPermission();
  r.push([t('push.permission'), perm === 'granted', perm]);
  if (perm !== 'granted') return r;

  const reg = await navigator.serviceWorker.ready;
  try {
    await reg.showNotification(t('push.testTitle'), { body: t('push.testBody'), icon: 'icons/icon-192.png', tag: 'check' });
    r.push([t('push.local'), true]);
  } catch (e) {
    r.push([t('push.local'), false, e.message]);
  }

  if ('PushManager' in window) {
    try {
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(TEST_KEY) });
      r.push([t('push.subscribe'), true, new URL(sub.endpoint).host]);
      await sub.unsubscribe();
    } catch (e) {
      r.push([t('push.subscribe'), false, e.message]);
    }
  }
  return r;
}
