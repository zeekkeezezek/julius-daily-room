import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);
const assets=walk('dist').map(p=>'./'+path.relative('dist',p).replaceAll('\\','/')).filter(p=>!p.endsWith('icon-original.png') && !p.endsWith('service-worker.js'));
const hash=createHash('sha256').update(assets.map(p=>fs.readFileSync(path.join('dist',p))).join('')).digest('hex').slice(0,12);
const source=`const CACHE='daily-room-${hash}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('daily-room-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('index.html',scope).href)));return;
  }
  const known=ASSETS.some(a=>new URL(a,scope).pathname===url.pathname);
  if(known)event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(event.request,{ignoreVary:true,ignoreSearch:true});
    if(url.pathname.endsWith('firebase-config.json'))return fetch(event.request).catch(()=>cached);
    return cached||fetch(event.request);
  }));
});
`;
fs.writeFileSync('dist/service-worker.js',source);
console.log(`Offline shell: ${assets.length} assets (${hash})`);
