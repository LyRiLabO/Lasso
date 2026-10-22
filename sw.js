/* 日日貼的 service worker：讓 App 沒網路也能打開。
   - 網頁本身（index.html）：先上網拿最新版，拿不到（沒網路）才用上次存下來的版本。
     所以有網路時永遠是最新版，不會卡在舊版本。
   - 圖示、字型、supabase 程式庫這些不常變的檔案：先用存下來的，同時在背景更新。
   - Supabase 的資料、登入（supabase.co）一律不經過這裡，直接連網路，避免看到過期的資料。
   改這個檔案時把 CACHE 的版本號 +1，舊的快取會在新版啟用時清掉。 */
const CACHE = 'rirtie-v1';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(CORE); }).catch(function(){}));
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(/supabase\.co$/.test(url.hostname)) return; // 資料與登入：不快取

  // 打開網頁（包含從主畫面圖示打開）：網路優先，沒網路才用存下來的
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){ const copy = res.clone(); caches.open(CACHE).then(function(c){ c.put('./index.html', copy); }); }
        return res;
      }).catch(function(){
        return caches.match('./index.html').then(function(r){ return r || caches.match('./'); });
      })
    );
    return;
  }

  // 其他檔案（同網站的圖示、Google 字型、jsdelivr 上的 supabase 程式庫）：先用存下來的，背景更新
  const cacheable = url.origin === self.location.origin ||
    /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === 'cdn.jsdelivr.net';
  if(!cacheable) return;
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(req).then(function(hit){
      const net = fetch(req).then(function(res){
        if(res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    });
  }));
});
