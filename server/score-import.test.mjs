import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleImport,sourceUrl} from './score-import.mjs';
const request = (url='https://utaten.com/lyric/original/')=>new Request('https://app.example/medley-generator/api/score-import?'+new URLSearchParams({url}));
const env={UTATEN_IMPORT_PERMISSION:'テスト用オリジナルの利用許諾',CHORDWIKI_IMPORT_PERMISSION:'テスト用'};
test('rejects arbitrary hosts and redirects before fetching',async()=>{
  for(const url of ['http://utaten.com/lyric/a/','https://localhost/','https://utaten.com.evil.org/lyric/a/','https://user@utaten.com/lyric/a/','https://utaten.com:99/lyric/a/','https://utaten.com/lyric/a/?x=1']) assert.throws(()=>sourceUrl(url));
  assert.equal((await handleImport(request('https://localhost/'),env,()=>{throw Error('must not fetch');})).status,400);
});
test('permission is required before network access',async()=>{
  const r=await handleImport(request(),{},()=>{throw Error('must not fetch');});assert.equal(r.status,403);
});
test('returns text and provenance without caching or following redirects',async()=>{
  const r=await handleImport(request(),env,async(url,options)=>{
    assert.equal(url.href,'https://utaten.com/lyric/original/');assert.equal(options.redirect,'error');
    return new Response('<div class="lyricBody">original</div>',{headers:{'content-type':'text/html'}});
  });
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).usage,env.UTATEN_IMPORT_PERMISSION);
});
test('ChordWiki fetches fixed edit URL and retains canonical source',async()=>{
  const r=await handleImport(request('https://ja.chordwiki.org/wiki/Original'),env,async(url)=>{
    assert.equal(url.pathname,'/wiki.cgi');assert.equal(url.searchParams.get('c'),'edit');assert.equal(url.searchParams.get('t'),'Original');
    return new Response('<form><textarea name="text">[C]original</textarea></form>',{headers:{'content-type':'text/html'}});
  });assert.equal((await r.json()).sourceUrl,'https://ja.chordwiki.org/wiki/Original');
});
test('upstream failure and oversized responses are actionable',async()=>{
  assert.equal((await handleImport(request(),env,async()=>new Response('',{status:403}))).status,502);
  assert.equal((await handleImport(request(),env,async()=>new Response('x'.repeat(2_000_001),{headers:{'content-type':'text/html'}}))).status,413);
  assert.equal((await handleImport(request(),env,async()=>{throw Error('network');})).status,502);
});
