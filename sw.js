// Simple service worker: always try the network first, fall back to the
// last saved copy so the app still opens when you have no signal.
const CACHE = "sports-hub-v38";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "assets/logos/cfp.png",
  "assets/logos/ncaa.png",
  "assets/logos/nfl.png",
  "assets/logos/nba.png",
  "assets/logos/mlb.png",
  "assets/logos/pga.png",
  "assets/logos/premier-league.png",
  "assets/logos/f1.png",
  "assets/logos/nhl.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Only handle this site's own files. Requests to other sites (like ESPN's
  // box scores) go straight through the browser untouched.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  // Data requests use a timestamp to avoid stale scores. Do not save every
  // timestamped URL as a separate cache entry.
  if (new URL(event.request.url).searchParams.has("t")) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
