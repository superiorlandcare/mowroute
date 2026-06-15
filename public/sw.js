// MowRoute service worker (spec §15.8 PWA polish).
// Scope: installability + a graceful offline state. We deliberately do NOT cache
// authenticated pages or Supabase API/realtime traffic — so auth, role gating,
// realtime, and "$ stripped for crew" all keep working exactly as online, and
// no stale private data is ever served. Offline = a clean fallback, not a broken
// page (the crew works in low-signal areas).

const CACHE = "mowroute-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch server actions / writes

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let Supabase et al. pass

  // Navigations: network-first, fall back to the offline page (never cache the
  // authed/dynamic HTML, so login redirects + fresh data always work online).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { ignoreSearch: true }),
      ),
    );
    return;
  }

  // Immutable static assets (hashed Next chunks, icons): cache-first, then warm
  // the cache in the background.
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
  }
});
