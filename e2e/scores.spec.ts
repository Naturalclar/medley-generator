import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {expect,test} from '@playwright/test';
import songs from '../src/data/songs.json' with {type:'json'};
const url='https://utaten.com/lyric/original/';
const original = '<h2 class="newLyricTitle__main">テスト曲<span class="newLyricTitle_afterTxt">歌詞</span></h2><dt class="newLyricWork__name"><a>作者</a></dt><div class="lyricBody"><div class="medium"><ruby>星<rt>ほし</rt></ruby>のうた<br>[C]自作の歌[G]だよ<script>window.importExecuted=true</script></div></div>';
async function openEditor(page:import('@playwright/test').Page) {
  await page.route('**/songs.json',route=>route.fulfill({json:[songs[0],songs[1]]}));
  await page.goto('/medley-generator/');
  await page.locator('.score-song-list button').first().click();
}
test.describe('取り込みと編集',()=>{
  test.use({serviceWorkers:'block'});
test('URL import previews inert text, saves, transposes, exports and survives reload',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await openEditor(page);
  await page.route('**/api/score-import?*',route=>route.fulfill({json:{html:original,sourceUrl:url,usage:'オリジナルのテストデータ'}}));
  await page.getByLabel('取り込み元URL').fill(url);
  page.on('dialog',d=>d.accept());
  await page.getByRole('button',{name:'URLから取り込む',exact:true}).click();
  await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('星のうた\n[C]自作の歌[G]だよ');
  expect(await page.evaluate(()=>Object.hasOwn(window,'importExecuted'))).toBe(false);
  expect(await page.evaluate(()=>localStorage.getItem('medley-generator:scores:v1'))).toBeNull();
  await page.getByRole('button',{name:'譜面を保存',exact:true}).click();
  await page.getByRole('button',{name:'保存した譜面で演奏する'}).click();
  const viewer=page.getByRole('dialog',{name:'演奏ビュー'});
  await expect(viewer.locator('.score-chord').filter({hasText:/^C$/})).toBeVisible();
  await viewer.getByRole('button',{name:'半音上げる'}).click();
  await expect(viewer.locator('.score-chord').filter({hasText:/^C#$/})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('performance.png')});
  await page.keyboard.press('Escape');await expect(viewer).toHaveCount(0);
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'譜面JSONを書き出す'}).click();
  expect((await downloaded).suggestedFilename()).toMatch(/medley-scores-/);
  await page.reload();await page.locator('.score-song-list button').first().click();
  await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('星のうた\n[C]自作の歌[G]だよ');
  expect(errors).toEqual([]);
});
test('failed reimport preserves saved and edited body; invalid JSON is non destructive',async({page})=>{
  await openEditor(page);page.on('dialog',d=>d.accept());
  await page.getByLabel('歌詞・コード（ChordPro）').fill('[C/E]自作');
  await page.getByRole('button',{name:'譜面を保存',exact:true}).click();
  await page.getByLabel('取り込み元URL').fill(url);
  await page.route('**/api/score-import?*',route=>route.fulfill({status:403,json:{error:'利用許諾が未設定です'}}));
  await page.getByRole('button',{name:'URLから取り込む',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('利用許諾');
  await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('[C/E]自作');
  await page.getByLabel('譜面JSONを読み込む').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":2}')});
  await expect(page.getByRole('alert')).toContainText('未対応');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('medley-generator:scores:v1')!).scores[0].body)).toBe('[C/E]自作');
});
test('JSON conflicts require selection and can be undone on tablet',async({page})=>{
  await page.setViewportSize({width:820,height:1180});
  await openEditor(page);
  await page.getByLabel('歌詞・コード（ChordPro）').fill('[C]元の本文');
  await page.getByRole('button',{name:'譜面を保存',exact:true}).click();
  const backup=await page.evaluate(()=>JSON.parse(localStorage.getItem('medley-generator:scores:v1')!));
  backup.scores[0].body='[D]取り込む本文';
  const file={name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))};
  await page.getByLabel('譜面JSONを読み込む').setInputFiles(file);
  await page.getByRole('button',{name:'確認して取り込む'}).click();
  await page.locator('.score-song-list button').first().click();
  await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('[C]元の本文');
  await page.getByLabel('譜面JSONを読み込む').setInputFiles(file);
  await page.locator('.score-import-review input[type=checkbox]').check();
  await page.getByRole('button',{name:'確認して取り込む'}).click();
  await page.locator('.score-song-list button').first().click();
  await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('[D]取り込む本文');
  await page.getByRole('button',{name:'取り込み前に戻す'}).click();
  await page.locator('.score-song-list button').first().click();
  await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('[C]元の本文');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('JSON restores scores, setlist order and original session date on another device',async({page})=>{
  await openEditor(page);
  await page.getByLabel('歌詞・コード（ChordPro）').fill('[C]端末移行の自作');
  await page.getByRole('button',{name:'譜面を保存',exact:true}).click();
  const date='2026-11-01T09:00:00.000Z';
  await page.evaluate(({ids,date})=>localStorage.setItem('medley-generator:setlist:v1',JSON.stringify({ids,date})),{ids:[songs[1].id,songs[0].id],date});
  await page.reload();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'譜面JSONを書き出す'}).click();
  const download=await downloadPromise;const path=await download.path();if(!path)throw Error('no backup');
  const raw=await readFile(path,'utf8');const backup=JSON.parse(raw);
  expect(backup.setlistIds).toEqual([songs[1].id,songs[0].id]);expect(backup.setlistDate).toBe(date);
  await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.getByLabel('譜面JSONを読み込む').setInputFiles({name:'transfer.json',mimeType:'application/json',buffer:Buffer.from(raw)});
  await page.getByRole('button',{name:'確認して取り込む'}).click();
  await expect(page.locator('.setlist-songs li')).toHaveCount(2);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('medley-generator:setlist:v1')!))).toEqual({ids:backup.setlistIds,date});
  await page.locator('.score-song-list button').first().click();
  await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('[C]端末移行の自作');
});
test('prototype-named song IDs do not silently authorize a conflict overwrite',async({page})=>{
  await openEditor(page);
  const make=(body:string)=>({version:1,exportedAt:new Date().toISOString(),scores:[{songId:'constructor',title:'自作',artist:'',body,sourceUrl:'',usage:'自作',updatedAt:new Date().toISOString(),importedAt:null}]});
  for(const body of ['元の本文','上書き本文']){
    await page.getByLabel('譜面JSONを読み込む').setInputFiles({name:'original.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(make(body)))});
    await page.getByRole('button',{name:'確認して取り込む'}).click();
  }
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('medley-generator:scores:v1')!).scores[0].body)).toBe('元の本文');
});
test('ChordWiki source keeps chord positions without executing markup',async({page})=>{
  await openEditor(page);page.on('dialog',d=>d.accept());
  const sourceUrl='https://ja.chordwiki.org/wiki/Original';
  await page.route('**/api/score-import?*',route=>route.fulfill({json:{sourceUrl,usage:'自作',html:'<h1>自作</h1><form><textarea name="text">{c: サビ}\n[C/E]あの[G]星</textarea></form>'}}));
  await page.getByLabel('取り込み元URL').fill(sourceUrl);await page.getByRole('button',{name:'URLから取り込む',exact:true}).click();
  await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('{c: サビ}\n[C/E]あの[G]星');
});
});
test('app shell and saved score reopen offline',async({page,context,browserName})=>{
  let target='/medley-generator/';
  let stop: (()=>Promise<void>)|undefined;
  if(browserName==='webkit') {
    // Playwright's WebKit offline emulation can reject even literal SW responses
    // (microsoft/playwright#42775). Stop a dedicated real origin instead.
    const root=resolve('dist');
    const server=createServer(async(req,res)=>{
      try {
        const path=new URL(req.url??'/', 'http://localhost').pathname;
        const file=path.replace(/^\/medley-generator\//,'')||'index.html';
        const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
        const data=await readFile(resolve(root,file));
        res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(data);
      }catch{res.writeHead(404);res.end();}
    });
    await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
    const address=server.address();if(!address||typeof address==='string')throw Error('no address');
    target=`http://127.0.0.1:${address.port}/medley-generator/`;
    stop=()=>new Promise<void>((resolve,reject)=>{if(!server.listening)return resolve();server.close(e=>e?reject(e):resolve());server.closeAllConnections();});
  }
  try {
    await page.goto(target);
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.locator('.score-song-list button').first().click();
    await page.getByLabel('歌詞・コード（ChordPro）').fill('[C]オフラインの自作');
    await page.getByRole('button',{name:'譜面を保存',exact:true}).click();
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    if(stop)await stop();else await context.setOffline(true);
    expect(await page.evaluate(()=>fetch('/medley-generator/not-cached').then(()=>false,()=>true))).toBe(true);
    const response=await page.reload();expect(response?.fromServiceWorker()).toBe(true);
    await page.locator('.score-song-list button').first().click();
    await expect(page.getByLabel('歌詞・コード（ChordPro）')).toHaveValue('[C]オフラインの自作');
  }finally{if(stop)await stop();else await context.setOffline(false);}
});
