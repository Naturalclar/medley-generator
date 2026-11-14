import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {handleImport} from './score-import.mjs';
const root = resolve('dist');
const base = '/medley-generator/';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
let active = 0;
createServer(async (req,res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if(url.pathname === base+'api/score-import') {
      const origin = req.headers.origin;
      if ((origin && new URL(origin).host !== req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') {res.writeHead(403);res.end();return;}
      if(active >= 2) {res.writeHead(429,{'content-type':'application/json'});res.end(JSON.stringify({error:'取り込みが混み合っています。少し待って再試行してください。'}));return;}
      active++;
      try {
        const response = await handleImport(new Request(url,{method:req.method}),process.env);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
      } finally {active--;}
      return;
    }
    if(req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405);res.end();return;}
    if(!url.pathname.startsWith(base)) {res.writeHead(302,{location:base});res.end();return;}
    const relative = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
    const file = resolve(root,relative);
    if(!file.startsWith(root+sep)) {res.writeHead(403);res.end();return;}
    if(!(await stat(file)).isFile())throw new Error('not file');
    const content = await readFile(file);
    res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','x-content-type-options':'nosniff','cache-control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:content);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT ?? 4174),process.env.HOST ?? '127.0.0.1',()=>console.log(`Score viewer: http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 4174}${base}`));
