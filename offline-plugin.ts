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
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('medley-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!URLS.includes(url.pathname)&&url.pathname!==${JSON.stringify(base)})return;
 const key=url.pathname===${JSON.stringify(base)}?${JSON.stringify(base+'index.html')}:url.pathname;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const cached=await cache.match(key);
  return cached||fetch(event.request);
 }));
});
`);
    }},
  };
}
