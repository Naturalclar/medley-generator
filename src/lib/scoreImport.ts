import {MAX_SCORE_LENGTH, safeSourceUrl, scoreMetadata} from './scores';
export type Source = 'utaten' | 'chordwiki';
export function identifySource(raw: string): {url: string; source: Source} {
  const url = safeSourceUrl(raw);
  url.hash = '';
  if (url.search) throw new Error('クエリのない楽曲ページURLを入力してください。');
  if (url.hostname === 'utaten.com' && /^\/lyric\/[A-Za-z0-9_-]+\/$/.test(url.pathname)) return {url: url.href, source: 'utaten'};
  if (url.hostname === 'ja.chordwiki.org' && /^\/wiki\/[^/]+$/.test(url.pathname)) return {url: url.href, source: 'chordwiki'};
  throw new Error('UtaTenの歌詞ページ、またはChordWikiの楽曲ページURLを入力してください。');
}
export interface ImportedScore {title: string; artist: string; body: string; sourceUrl: string; importedAt: string; usage: string; key?:string;capo?:number}
/** DOMParser creates an inert document. Return text only; never mount provider HTML. */
export function extractScore(html: string, source: Source): Pick<ImportedScore, 'title' | 'artist' | 'body' | 'key' | 'capo'> {
  if (html.length > 2_000_000) throw new Error('取得したページが大きすぎます。');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove());
  const text = (element: Element | null) => {
    if (!element) return '';
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll('rt,rp,.ruby .rt,.ruby .rp,.hiragana,.newLyricTitle_afterTxt').forEach(n => n.remove());
    clone.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
    return (clone.textContent ?? '').replace(/\r\n?/g, '\n').trim();
  };
  const title = text(doc.querySelector(source === 'utaten' ? '.newLyricTitle__main' : 'h1')).trim() || doc.title;
  const artist = text(doc.querySelector(source === 'utaten' ? '.newLyricWork__name a' : '[itemprop="byArtist"]'));
  let body = '';
  if (source === 'utaten') body = text(doc.querySelector('.lyricBody .medium') ?? doc.querySelector('.lyricBody'));
  else {
    // Prefer original ChordPro over rendered markup so chord-to-lyric positions survive.
    const input = doc.querySelector('textarea[name="text"], textarea[name="body"], textarea[name="content"], textarea#text, textarea#chordpro, form textarea, pre.chordpro, pre#chordpro');
    body = input instanceof HTMLTextAreaElement ? input.value : text(input);
  }
  if (!body || body.length > MAX_SCORE_LENGTH) throw new Error('譜面を抽出できませんでした。ページ形式が未対応、または変更されています。元ページを確認してください。');
  return {title, artist, body, ...scoreMetadata(body)};
}
export async function importScore(raw: string, signal: AbortSignal): Promise<ImportedScore> {
  const {url, source} = identifySource(raw);
  const endpoint = new URL(`${import.meta.env.BASE_URL}api/score-import`, window.location.origin);
  endpoint.searchParams.set('url', url);
  const response = await fetch(endpoint, {signal, headers:{Accept:'application/json'}});
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('この配信環境ではURL取り込みサーバーが利用できません。');
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error('取り込みサーバーの応答が正しくありません。');
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '取得に失敗しました。');
  if (typeof data.html !== 'string' || data.sourceUrl !== url || typeof data.usage !== 'string' || !data.usage.trim()) throw new Error('取り込みサーバーの応答が正しくありません。');
  return {...extractScore(data.html, source), sourceUrl:url, importedAt:new Date().toISOString(), usage:data.usage};
}
