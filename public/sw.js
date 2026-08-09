const CACHE = "civicguardian-shell-v6";
const SHELL = ["/", "/manifest.webmanifest", "/logo.svg"];

async function updateCache(request, cacheKey = request) {
  const response = await fetch(request);
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE);
    await cache.put(cacheKey, response.clone());
  }
  return response;
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cachedShell = await caches.match("/");
      const network = updateCache(request, "/").catch(() => undefined);
      if (cachedShell) {
        event.waitUntil(network);
        return cachedShell;
      }
      return (await network) || Response.error();
    })());
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const network = updateCache(request).catch(() => undefined);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return (await network) || Response.error();
    })());
  }
});
