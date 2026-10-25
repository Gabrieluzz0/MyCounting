const CACHE = 'mycounting-v34.0.0';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./engine.mjs','./progression.mjs','./backup.mjs','./blackjack.mjs','./insights.mjs','./lessons.mjs','./assets/logo-transparent.webp','./assets/mark-transparent.webp','./favicon.png','./icon-192.png','./icon-512.png','./icon-maskable.png','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mycounting-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==self.location.origin || !event.request.url.startsWith(self.registration.scope))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(event.request,{ignoreSearch:true});
    if(cached)return cached;
    try {const response=await fetch(event.request);if(response.ok && response.type==='basic')await cache.put(event.request,response.clone());return response;}
    catch {if(event.request.mode==='navigate')return cache.match('./index.html');return Response.error();}
  }));
});
