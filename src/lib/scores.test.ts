import {describe, expect, it} from 'vitest';
import {parseChordPro, readScoreBackup, safeSourceUrl, saveScores, scoreMetadata, transposeChord, validateScore} from './scores';
const score = {songId:'one', title:'曲', artist:'作者', body:'[C]オリジナル', sourceUrl:'', importedAt:null, updatedAt:'2026-11-11T00:00:00Z', usage:'自作'};
describe('transpose', () => {
  it.each(['','m','7','M7','maj7','m7','sus2','sus4','add9','dim','aug','6','9','m7b5','7♭5','7#9'].flatMap(suffix => [
    [`C${suffix}`, 2, `D${suffix}`], [`Bb${suffix}`, -2, `G#${suffix}`],
  ] as const))('%s by %i', (input, delta, output) => expect(transposeChord(input, delta)).toBe(output));
  it('moves bass, handles wraps and flats', () => {
    expect(transposeChord('C/E',2)).toBe('D/F#');
    expect(transposeChord('F#m/C#',-1)).toBe('Fm/C');
    expect(transposeChord('C',-13)).toBe('B');
    expect(transposeChord('C',12)).toBe('C');
    expect(transposeChord('D/F#',1,true)).toBe('Eb/G');
    expect(transposeChord('N.C.',1)).toBe('N.C.');
  });
});
it('preserves chord positions, sections and unknown text', () => {
  const lines = parseChordPro('{c: サビ}\r\nあの[C]日[G]見た\n{unknown: keep}\n<script>alert(1)</script>');
  expect(lines[0].text).toBe('サビ');
  expect(lines[1].parts).toEqual([{chord:'',text:'あの'},{chord:'C',text:'日'},{chord:'G',text:'見た'}]);
  expect(lines[2].parts[0].text).toBe('{unknown: keep}');
  expect(lines[3].text).toContain('<script>');
});
it('round trips score backup without touching public fields', () => {
  let raw = '';
  saveScores({setItem: (_key, value) => {raw = value;}}, [score]);
  expect(readScoreBackup(raw).scores).toEqual([score]);
});
it('rejects corrupt, duplicate and unsupported backups', () => {
  for (const data of [{version:2,scores:[]}, {version:1,exportedAt:'x',scores:[score,score]}, {version:1,exportedAt:'x',scores:[{...score,body:42}]}]) expect(() => readScoreBackup(JSON.stringify(data))).toThrow();
  expect(() => validateScore({...score,sourceUrl:'javascript:alert(1)'})).toThrow();
});
it('reports failed storage writes', () => {
  expect(() => saveScores({setItem: () => {throw new Error('quota');}}, [score])).toThrow('quota');
});
it.each(['http://example.com','https://user:pass@example.com','https://example.com:123/a','javascript:alert(1)'])('rejects unsafe source %s', url => expect(() => safeSourceUrl(url)).toThrow());

it('reads optional ChordPro metadata without guessing invalid capo values', () => {
  expect(scoreMetadata('{title: 自作}\n{artist: 作者}\n{key: F#m}\n{capo: 2}')).toEqual({title:'自作',artist:'作者',key:'F#m',capo:2});
  expect(scoreMetadata('{key: nope}\n{capo: 99}')).toEqual({});
  expect(transposeChord('Comment',2)).toBe('Comment');
  expect(() => validateScore({...score,capo:13})).toThrow();
});
