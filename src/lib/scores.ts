/** Private scores live only in browser storage; never merge into public songs.json. */
export interface Score {
  songId: string;
  title: string;
  artist: string;
  body: string;
  sourceUrl: string;
  importedAt: string | null;
  updatedAt: string;
  usage: string;
  key?: string;
  capo?: number;
}
export interface ScoreBackup {
  version: 1;
  exportedAt: string;
  scores: Score[];
  setlistIds?: string[];
  setlistDate?: string;
}
export const SCORE_STORAGE_KEY = 'medley-generator:scores:v1';
export const MAX_SCORE_LENGTH = 500_000;
export function validateScore(value: unknown): Score {
  if (!value || typeof value !== 'object') throw new Error('譜面データの形式が正しくありません。');
  const s = value as Record<string, unknown>;
  for (const k of ['songId', 'title', 'artist', 'body', 'sourceUrl', 'updatedAt', 'usage']) {
    if (typeof s[k] !== 'string') throw new Error(`譜面の${k}が正しくありません。`);
  }
  if (!(s.songId as string).trim() || (s.body as string).length > MAX_SCORE_LENGTH || !Number.isFinite(Date.parse(s.updatedAt as string))) throw new Error('譜面のID・日時・本文サイズが正しくありません。');
  if (s.importedAt !== null && (typeof s.importedAt !== 'string' || !Number.isFinite(Date.parse(s.importedAt)))) throw new Error('取り込み日時が正しくありません。');
  if (s.key !== undefined && (typeof s.key !== 'string' || !/^(?:[A-G][#b♯♭]?m?)?$/.test(s.key))) throw new Error('譜面キーが正しくありません。');
  if (s.capo !== undefined && (!Number.isInteger(s.capo) || Number(s.capo) < 0 || Number(s.capo) > 12)) throw new Error('カポは0〜12で指定してください。');
  if (s.sourceUrl) safeSourceUrl(s.sourceUrl as string);
  return { songId: s.songId as string, title: s.title as string, artist: s.artist as string, body: s.body as string, sourceUrl: s.sourceUrl as string, importedAt: s.importedAt as string | null, updatedAt: s.updatedAt as string, usage: s.usage as string, ...(s.key !== undefined ? {key:s.key as string} : {}), ...(s.capo !== undefined ? {capo:s.capo as number} : {}) };
}
export function safeSourceUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('正しいHTTPS URLを入力してください。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('認証情報・独自ポートを含まないHTTPS URLを入力してください。');
  return url;
}
export function readScoreBackup(raw: string): ScoreBackup {
  if (raw.length > 20_000_000) throw new Error('バックアップは20MB以下にしてください。');
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('バックアップ形式が正しくありません。');
  const d = data as Record<string, unknown>;
  if (d.version !== 1 || !Array.isArray(d.scores) || d.scores.length > 5000 || (typeof d.exportedAt !== 'string' || !Number.isFinite(Date.parse(d.exportedAt)))) throw new Error('未対応のバックアップ形式です。');
  const scores = d.scores.map(validateScore);
  if (new Set(scores.map(s => s.songId)).size !== scores.length) throw new Error('曲IDが重複しています。');
  if (d.setlistIds !== undefined && (!Array.isArray(d.setlistIds) || d.setlistIds.length > 1000 || !d.setlistIds.every(id => typeof id === 'string'))) throw new Error('セトリの形式が正しくありません。');
  if (d.setlistDate !== undefined && (typeof d.setlistDate !== 'string' || !Number.isFinite(Date.parse(d.setlistDate)))) throw new Error('セトリ日時が正しくありません。');
  return {version: 1, exportedAt: d.exportedAt, scores, ...(d.setlistDate ? {setlistDate:d.setlistDate as string} : {}), ...(d.setlistIds ? {setlistIds:d.setlistIds as string[]} : {})};
}
export function loadScores(storage: Pick<Storage, 'getItem'>): Score[] {
  const raw = storage.getItem(SCORE_STORAGE_KEY);
  return raw ? readScoreBackup(raw).scores : [];
}
export function saveScores(storage: Pick<Storage, 'setItem'>, scores: Score[]): void {
  const validated = scores.map(validateScore);
  storage.setItem(SCORE_STORAGE_KEY, JSON.stringify({version: 1, exportedAt: new Date().toISOString(), scores: validated}));
}
export interface ScoreLine { kind: 'section' | 'text'; text: string; parts: {chord: string; text: string}[] }
/** Unknown directives remain visible. Never interpret imported content as HTML. */
export function parseChordPro(body: string): ScoreLine[] {
  return body.replace(/\r\n?/g, '\n').split('\n').map(text => {
    if (/^\{(?:title|t|artist|subtitle|st|key|capo):.*\}$/i.test(text)) return {kind:'text',text:'',parts:[]};
    const section = text.match(/^\{(?:c|comment|comment_italic|start_of_chorus|soc):?\s*(.*?)\}$/i);
    if (section) return {kind: 'section', text: section[1] || 'サビ', parts: []};
    const parts: {chord: string; text: string}[] = [];
    const pattern = /\[([^\]\n]+)\]/g;
    let current = {chord: '', text: ''};
    let pos = 0;
    for (const match of text.matchAll(pattern)) {
      current.text += text.slice(pos, match.index);
      if (current.text || current.chord) parts.push(current);
      current = {chord: match[1], text: ''};
      pos = match.index + match[0].length;
    }
    current.text += text.slice(pos);
    parts.push(current);
    return {kind: 'text', text, parts};
  });
}
const SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
export function transposeChord(chord: string, semitones: number, flats = false): string {
  if (!Number.isInteger(semitones)) return chord;
  // Keep modifiers, including altered fifths, untouched. Only roots and slash bass move.
  const m = chord.match(/^([A-G])([#b♯♭]?)([^/]*)(?:\/([A-G])([#b♯♭]?))?$/);
  if (!m || !/^(?:(?:maj|min|dim|aug|sus|add|omit|no|m|M)|[0-9#b♯♭()+°øΔ-])*$/.test(m[3])) return chord;
  const note = (root: string, accidental: string) => {
    const delta = accidental === '#' || accidental === '♯' ? 1 : accidental === 'b' || accidental === '♭' ? -1 : 0;
    const n = (SHARP.indexOf(root) + delta + semitones) % 12;
    return (flats ? FLAT : SHARP)[(n + 12) % 12];
  };
  return note(m[1], m[2]) + m[3] + (m[4] ? '/' + note(m[4], m[5]) : '');
}

export function scoreMetadata(body: string): {title?:string;artist?:string;key?:string;capo?:number} {
  const value=(names:string)=>body.match(new RegExp('^\\{(?:'+names+'):\\s*(.*?)\\}\\s*$', 'im'))?.[1];
  const title=value('title|t'); const artist=value('artist|subtitle|st');
  const key=value('key');const rawCapo=value('capo');
  const capo=rawCapo !== undefined && /^\d{1,2}$/.test(rawCapo) ? Number(rawCapo) : undefined;
  return {...(title?{title}:{}),...(artist?{artist}:{}),...(key&&/^[A-G][#b♯♭]?m?$/.test(key)?{key}:{}),...(capo!==undefined&&capo<=12?{capo}:{})};
}
