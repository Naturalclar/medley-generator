import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Plugin} from 'vite';
/** Cache only the public app shell. API responses and private scores are never cached here. */
export function offlineShell(): Plugin {
  let directory = ''; let base = '';
  return {
    name:'offline-shell',
    configResolved(config) {directory=resolve(config.root,config.build.outDir);base=config.base;},
    closeBundle: {order:'post', handler() {
      const files = ['index.html','songs.json',...readdirSync(resolve(directory,'assets')).map(f=>'assets/'+f)];
      const digest=createHash('sha256');
      for(const file of files)digest.update(readFileSync(resolve(directory,file)));
      const cache='medley-shell-'+digest.digest('hex').slice(0,16);
      const urls=files.map(file=>base+file);
      writeFileSync(resolve(directory,'sw.js'),`
const CACHE=${JSON.stringify(cache)};
const URLS=${JSON.stringify(urls)};
// 新しい Worker は待たせずに入れ替える。古い songs.json を出し続けないため。
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS)));});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('medley-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
// index.html と songs.json は曲の追加ですぐ変わるので、ネットワーク優先にしてキャッシュはオフライン時の予備にする(#144)。
// ハッシュ付きの assets は中身が変わると名前も変わるので、キャッシュ優先でよい。
const FRESH=[${JSON.stringify(base+'index.html')},${JSON.stringify(base+'songs.json')}];
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!URLS.includes(url.pathname)&&url.pathname!==${JSON.stringify(base)})return;
 const key=url.pathname===${JSON.stringify(base)}?${JSON.stringify(base+'index.html')}:url.pathname;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  if(FRESH.includes(key)){
   try{
    const response=await fetch(event.request,{cache:'no-store'});
    if(response.ok)await cache.put(key,response.clone());
    return response;
   }catch(error){
    const cached=await cache.match(key);
    if(cached)return cached;
    throw error;
   }
  }
  const cached=await cache.match(key);
  return cached||fetch(event.request);
 }));
});
`);
    }},
  };
}
