// Работа без сети: при запуске отдаём файлы из кэша, а в фоне берём свежие.
// Новая версия после push подхватывается при следующем открытии приложения.
// Все запросы к серверу идут с cache: 'no-cache', иначе HTTP-кэш GitHub Pages (10 минут)
// подсовывает старые файлы даже новой версии service worker.
// CACHE меняй вместе с VERSION в js/version.js.

const CACHE = 'cycle-partner-0.1.3';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/cycle.js',
  'js/dates.js',
  'js/i18n.js',
  'js/store.js',
  'js/version.js',
  'js/push-check.js',
  'i18n/ru.json',
  'content/ru/phases.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = req.mode === 'navigate' ? 'index.html' : req;
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req.url, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(fresh);
        return cached;
      }
      return (await fresh) || new Response('Нет сети', { status: 503 });
    }),
  );
});

// Тап по уведомлению открывает приложение на экране «Сегодня».
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const url = new URL('./#today', self.registration.scope).href;
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
