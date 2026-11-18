/** Restricted provider gateway. No arbitrary URL proxy, credentials, redirects or persistence. */
export function sourceUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new Error('未対応のURLです。');
  if (url.hostname === 'utaten.com' && /^\/lyric\/[A-Za-z0-9_-]+\/$/.test(url.pathname)) return {url, source:'utaten'};
  if (url.hostname === 'ja.chordwiki.org' && /^\/wiki\/[^/]+$/.test(url.pathname)) return {url, source:'chordwiki'};
  throw new Error('未対応の取り込み元です。');
}
export async function handleImport(request, env = {}, fetcher = fetch) {
  const json = (status, data) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  if (request.method !== 'GET') return json(405, {error:'GETのみ利用できます。'});
  let target;
  try {target = sourceUrl(new URL(request.url).searchParams.get('url') ?? '');} catch {return json(400,{error:'対応する楽曲ページのHTTPS URLを入力してください。'});}
  const permission = env[target.source === 'utaten' ? 'UTATEN_IMPORT_PERMISSION' : 'CHORDWIKI_IMPORT_PERMISSION'];
  if (typeof permission !== 'string' || !permission.trim()) return json(403,{error:'この取り込み元は利用許諾が未設定です。取得・保存・オフライン閲覧の許諾を確認後、管理者が有効にしてください。'});
  try {
    const fetchUrl = target.source === 'chordwiki'
      ? new URL('/wiki.cgi?' + new URLSearchParams({c:'edit',t:decodeURIComponent(target.url.pathname.slice('/wiki/'.length))}), target.url)
      : target.url;
    const upstream = await fetcher(fetchUrl, {redirect:'error', signal:AbortSignal.timeout(10_000), headers:{Accept:'text/html','User-Agent':'MedleyGenerator-ScoreImport/1.0'}});
    if (!upstream.ok || !upstream.headers.get('content-type')?.includes('text/html')) return json(502,{error:'取り込み元のページを取得できませんでした。'});
    if (Number(upstream.headers.get('content-length')) > 2_000_000) return json(413,{error:'ページが大きすぎます。'});
    const reader = upstream.body?.getReader();
    if (!reader) return json(502,{error:'ページの本文がありません。'});
    const chunks = []; let length = 0;
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2_000_000) {await reader.cancel(); return json(413,{error:'ページが大きすぎます。'});}
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
    return json(200,{html:new TextDecoder().decode(bytes),sourceUrl:target.url.href,usage:permission});
  } catch {return json(502,{error:'取得に失敗しました。通信・URL・取り込み元の状態を確認してください。'});}
}
