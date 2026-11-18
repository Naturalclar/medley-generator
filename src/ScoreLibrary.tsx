import {useEffect, useRef, useState} from 'react';
import type {Song} from './lib/types';
import {loadScores, MAX_SCORE_LENGTH, parseChordPro, readScoreBackup, safeSourceUrl, saveScores, transposeChord, type Score, type ScoreBackup} from './lib/scores';
import {importScore} from './lib/scoreImport';
import './scores.css';

function ScoreBody({body, transpose = 0, flats = false}: {body:string; transpose?:number; flats?:boolean}) {
  return <div className="score-body">{parseChordPro(body).map((line,i) => line.kind === 'section'
    ? <h3 key={i}>{line.text}</h3>
    : <div className="score-line" key={i}>{line.parts.map((part,j) => <span className="score-part" key={j}><span className="score-chord">{part.chord ? transposeChord(part.chord,transpose,flats) : '\u00a0'}</span><span>{part.text || '\u00a0'}</span></span>)}</div>)}</div>;
}
const emptyScore = (song:Song): Score => ({songId:song.id,title:song.title,artist:song.artist ?? '',body:'',sourceUrl:song.utatenUrl ?? '',importedAt:null,updatedAt:new Date().toISOString(),usage:''});
export default function ScoreLibrary({songs, setlist, setlistDate, onRestoreSetlist}:{songs:Song[];setlist:Song[];setlistDate:Date|null;onRestoreSetlist:(ids:string[],date?:string)=>void}) {
  const [scores,setScores] = useState<Score[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [draft,setDraft] = useState<Score|null>(null);
  const [dirty,setDirty] = useState(false);
  const [busy,setBusy] = useState(false);
  const [query,setQuery] = useState('');
  const [pending,setPending] = useState<ScoreBackup|null>(null);
  const [choices,setChoices] = useState<Record<string,boolean>>({});
  const [undo,setUndo] = useState<{scores:Score[];setlistIds:string[];setlistDate?:string}|null>(null);
  const [offline,setOffline] = useState('オフライン準備中');
  const dialog = useRef<HTMLDivElement>(null);
  const [performing,setPerforming] = useState(false);
  const [playQueue,setPlayQueue] = useState<{id:string;title:string}[]>([]);
  const [index,setIndex] = useState(0);
  const [fontSize,setFontSize] = useState(28);
  const [transpose,setTranspose] = useState(0);
  const [flats,setFlats] = useState(false);
  const [scrolling,setScrolling] = useState(false);
  const [speed,setSpeed] = useState(30);
  const viewer = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController|null>(null);
  const queue = playQueue;
  const current = queue[index];
  const currentScore = scores.find(s=>s.songId===current?.id);
  useEffect(()=> {
    try {setScores(loadScores(localStorage)); setLoaded(true);} catch {setError('保存データを読み込めません。元データを保護するため保存を停止しています。バックアップを確認してください。');}
    return ()=>controller.current?.abort();
  },[]);
  useEffect(()=> {
    if (!dirty) return;
    const handler = (e:BeforeUnloadEvent)=>{e.preventDefault();};
    window.addEventListener('beforeunload',handler);
    return ()=>window.removeEventListener('beforeunload',handler);
  },[dirty]);
  useEffect(()=> {
    if (!scrolling || !performing) return;
    let frame = 0; let previous = 0; let position = viewer.current?.scrollTop ?? 0;
    const tick = (time:number)=>{
      const el=viewer.current;
      if (!el) return;
      if(previous) position += (time-previous)*speed/1000;
      previous=time; el.scrollTop=position;
      if(el.scrollTop + el.clientHeight >= el.scrollHeight-1) {setScrolling(false);return;}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[scrolling,performing,speed]);
  useEffect(()=> {
    let cancelled=false;
    const unavailable=()=>setOffline('オフライン準備ができません。この環境ではオンラインで利用してください。');
    window.addEventListener('score-offline-unavailable',unavailable);
    if(!('serviceWorker' in navigator))unavailable();
    else void navigator.serviceWorker.ready.then(()=>{if(!cancelled)setOffline('オフライン準備済み（保存した譜面を閲覧できます）');});
    return ()=>{cancelled=true;window.removeEventListener('score-offline-unavailable',unavailable);};
  },[]);
  useEffect(()=> {
    if(!performing)return;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return ()=>{document.body.style.overflow=previous;};
  },[performing]);
  function persist(next:Score[]) {
    if (!loaded) {setError('保存データを読み込めていないため保存できません。');return false;}
    try {saveScores(localStorage,next);setScores(next);setError('');return true;} catch {setError('保存できませんでした。空き容量とブラウザの保存設定を確認し、編集中の本文を退避してください。');return false;}
  }
  function leaveDraft() {return !dirty || window.confirm('未保存の変更を破棄しますか？');}
  function select(song:Song) {
    if(!leaveDraft()) return;
    controller.current?.abort();setBusy(false);
    setDraft(scores.find(s=>s.songId===song.id) ?? emptyScore(song));setDirty(false);setError('');setNotice('');
  }
  function edit(patch:Partial<Score>) {setDraft(d=>d?{...d,...patch}:d);setDirty(true);setNotice('');}
  async function retrieve() {
    if(!draft || (dirty && !window.confirm('取得結果で編集中の内容を置き換えますか？保存済みの譜面は変更されません。'))) return;
    controller.current?.abort();const ctrl=new AbortController();controller.current=ctrl;setBusy(true);setError('');
    const songId=draft.songId;
    try {
      const imported=await importScore(draft.sourceUrl,ctrl.signal);
      if(ctrl.signal.aborted) return;
      setDraft(d=>d?.songId===songId?{...d,...imported,artist:imported.artist||d.artist}:d);setDirty(true);setNotice('取得結果を確認して「譜面を保存」を押してください。歌詞とコードの別ページ同士は自動結合しません。');
    } catch(e) {if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'取得に失敗しました。');}
    finally {if(!ctrl.signal.aborted)setBusy(false);}
  }
  function save() {
    if(!draft) return;
    const next={...draft,updatedAt:new Date().toISOString()};
    if(persist([...scores.filter(s=>s.songId!==next.songId),next])) {setDraft(next);setDirty(false);setNotice('この端末に保存しました。別端末へはJSONで移行できます。');}
  }
  function download() {
    const blob = new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),scores,setlistIds:setlist.map(s=>s.id),setlistDate:setlistDate?.toISOString()},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`medley-scores-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function readFile(file:File|undefined) {
    if(!file || !leaveDraft()) return;
    try {if(file.size>20_000_000)throw new Error('バックアップは20MB以下にしてください。');setPending(readScoreBackup(await file.text()));setChoices({});setError('');} catch(e) {setError(e instanceof Error?e.message:'読み込めませんでした。');}
  }
  function applyImport() {
    if(!pending || !leaveDraft())return;
    const next=[...scores];
    for(const score of pending.scores) {
      const position=next.findIndex(s=>s.songId===score.songId);
      if(position<0)next.push(score);else if(choices[score.songId] === true)next[position]=score;
    }
    const previous={scores,setlistIds:setlist.map(s=>s.id),setlistDate:setlistDate?.toISOString()};
    if(persist(next)){setUndo(previous);if(pending.setlistIds)onRestoreSetlist(pending.setlistIds,pending.setlistDate);setPending(null);setDraft(null);setDirty(false);setNotice('取り込みました。取り込み前に戻すこともできます。');}
  }
  function move(delta:number) {setIndex(i=>Math.max(0,Math.min(queue.length-1,i+delta)));setScrolling(false);setTranspose(0);viewer.current?.scrollTo(0,0);}
  useEffect(()=> {
    if(!performing)return;
    const handler=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setPerforming(false);setScrolling(false);return;}
      if(event.key==='Tab'){
        const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href],select,textarea');
        if(nodes?.length){const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
        return;
      }
      if((event.target as HTMLElement).closest('input,textarea,select,button,a'))return;
      if(event.code==='Space'){event.preventDefault();setScrolling(s=>!s);}
      if(event.key==='ArrowRight'){event.preventDefault();move(1);}
      if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
      if(event.key==='PageDown'||event.key==='PageUp'){event.preventDefault();setScrolling(false);viewer.current?.scrollBy({top:(event.key==='PageDown'?1:-1)*(viewer.current.clientHeight*0.8),behavior:'smooth'});}
      if(event.key==='Escape'){setPerforming(false);setScrolling(false);}
    };
    window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);
  });
  let sourceHref='';
  try {if(draft?.sourceUrl)sourceHref=safeSourceUrl(draft.sourceUrl).href;}catch{/* Invalid draft URLs are never clickable. */}
  return <section className="score-library">
    <h2>歌詞・コード</h2>
    <p>譜面はこの端末に保存します。Mac・iPad間はJSONで手動移行できます。</p>
    <p role="status">{offline}</p>
    {error && <p role="alert" className="score-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="score-toolbar">
      <button type="button" onClick={download} disabled={!loaded}>譜面JSONを書き出す</button>
      <label>譜面JSONを読み込む<input type="file" accept=".json,application/json" onChange={e=>{void readFile(e.target.files?.[0]);e.target.value='';}}/></label>
      {undo && <button type="button" onClick={()=>{if(leaveDraft() && persist(undo.scores)){onRestoreSetlist(undo.setlistIds,undo.setlistDate);setUndo(null);setDraft(null);setDirty(false);setNotice('取り込み前に戻しました。');}}}>取り込み前に戻す</button>}
    </div>
    {pending && <div className="score-import-review"><h3>JSON取り込みの確認</h3><p>{pending.setlistIds ? `セトリ${pending.setlistIds.length}曲も取り込みます。` : 'セトリは変更しません。'}</p>
      <p>追加 {pending.scores.filter(s=>!scores.some(old=>old.songId===s.songId)).length}件／同じID {pending.scores.filter(s=>scores.some(old=>old.songId===s.songId)).length}件。同じIDは選択した譜面だけ置き換えます。端末の表示設定は変更しません。</p>
      {pending.scores.filter(s=>scores.some(old=>old.songId===s.songId)).map(s=><label key={s.songId}><input type="checkbox" checked={choices[s.songId] === true} onChange={e=>setChoices(c=>({...c,[s.songId]:e.target.checked}))}/>{s.title}を取り込む（本文を置き換え）</label>)}
      <button type="button" onClick={applyImport}>確認して取り込む</button><button type="button" onClick={()=>setPending(null)}>キャンセル</button></div>}
    <label>譜面を編集する曲を検索<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="曲名・アーティスト"/></label>
    <div className="score-song-list">{songs.filter(s=>(s.title+' '+(s.artist??'')).toLowerCase().includes(query.toLowerCase())).map(song=><button type="button" key={song.id} aria-pressed={draft?.songId===song.id} onClick={()=>select(song)}>{song.title} <small>{scores.some(s=>s.songId===song.id)?'登録済み':'未登録'}</small></button>)}</div>
    {scores.filter(score=>!songs.some(song=>song.id===score.songId)).map(score=><button type="button" key={score.songId} onClick={()=>{if(leaveDraft()){controller.current?.abort();setBusy(false);setDraft(score);setDirty(false);}}}>{score.title}（曲プール外の譜面）</button>)}
    {draft && <div className="score-editor">
      <h3>{draft.title} — 譜面編集{dirty?'（未保存）':''}</h3>
      <label>取り込み元URL<input type="url" value={draft.sourceUrl} disabled={busy} onChange={e=>edit({sourceUrl:e.target.value})} placeholder="UtaTen・ChordWikiの楽曲ページURL"/></label>
      {draft.importedAt && <p>取得日時：{new Date(draft.importedAt).toLocaleString('ja-JP')}</p>}
      <div className="score-toolbar"><button type="button" onClick={()=>void retrieve()} disabled={busy}>{busy?'取得中…':'URLから取り込む'}</button>{busy&&<button type="button" onClick={()=>{controller.current?.abort();setBusy(false);}}>取得を中止</button>}{sourceHref&&<a href={sourceHref} target="_blank" rel="noopener noreferrer">元ページを開く</a>}</div>
      <p className="hint">取り込み元の取得・保存に対応した環境で利用できます。自分で入力する場合も、利用できる歌詞・譜面を登録してください。</p>
      <label>譜面タイトル<input value={draft.title} onChange={e=>edit({title:e.target.value})}/></label>
      <label>譜面アーティスト<input value={draft.artist} onChange={e=>edit({artist:e.target.value})}/></label>
      <div className="score-toolbar"><label>譜面記載キー<select value={draft.key??''} onChange={e=>edit({key:e.target.value})}><option value="">未指定</option>{['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'].flatMap(key=>[key,key+'m']).map(key=><option key={key}>{key}</option>)}</select></label><label>譜面記載カポ<input type="number" min="0" max="12" value={draft.capo??0} onChange={e=>edit({capo:Number(e.target.value)})}/></label></div>
      <label>出典・利用条件<input value={draft.usage} onChange={e=>edit({usage:e.target.value})}/></label>
      <div className="score-editor-columns"><label>歌詞・コード（ChordPro）<textarea rows={16} maxLength={MAX_SCORE_LENGTH} value={draft.body} onChange={e=>edit({body:e.target.value})} placeholder={'{c: サビ}\n[C]自作の歌詞[G]を入力'}/></label><div><h4>プレビュー</h4><ScoreBody body={draft.body}/></div></div>
      <div className="score-toolbar"><button type="button" onClick={save} disabled={!loaded||busy}>譜面を保存</button><button type="button" disabled={!scores.some(s=>s.songId===draft.songId)} onClick={()=>{if(window.confirm('この端末の譜面を削除しますか？曲データは残ります。') && persist(scores.filter(s=>s.songId!==draft.songId))){setDraft(null);setDirty(false);}}}>譜面を削除</button>
      <button type="button" disabled={!loaded} onClick={()=>{if(!leaveDraft())return;const nextQueue=setlist.some(s=>s.id===draft.songId)?setlist:[{id:draft.songId,title:draft.title}];setPlayQueue(nextQueue);setIndex(Math.max(0,nextQueue.findIndex(s=>s.id===draft.songId)));setTranspose(0);setScrolling(false);setPerforming(true);}}>保存した譜面で演奏する</button></div>
    </div>}
    {performing && <div className="score-performance" ref={dialog} role="dialog" aria-modal="true" aria-label="演奏ビュー">
      <header><h2>{current?.title ?? '曲がありません'}</h2><p>{index+1} / {queue.length}曲　次：{queue[index+1]?.title??'最後の曲'}　キー {currentScore?.key ? transposeChord(currentScore.key,transpose,flats) : '未指定'}　カポ {currentScore?.capo ?? 0}　移調 {transpose>0?'+':''}{transpose}</p>
      <div className="score-toolbar"><button autoFocus type="button" onClick={()=>{setPerforming(false);setScrolling(false);}}>演奏ビューを閉じる</button><button type="button" onClick={()=>move(-1)} disabled={index===0}>前の曲</button><button type="button" onClick={()=>move(1)} disabled={index>=queue.length-1}>次の曲</button>
      <button type="button" onClick={()=>setTranspose(t=>t-1)}>半音下げる</button><button type="button" onClick={()=>setTranspose(t=>t+1)}>半音上げる</button><label><input type="checkbox" checked={flats} onChange={e=>setFlats(e.target.checked)}/>♭表記</label>
      <button type="button" onClick={()=>setFontSize(s=>Math.max(16,s-2))}>文字を小さく</button><button type="button" onClick={()=>setFontSize(s=>Math.min(64,s+2))}>文字を大きく</button>
      <button type="button" onClick={()=>setScrolling(s=>!s)}>{scrolling?'スクロール停止':'自動スクロール'}</button><label>速度<input type="range" min="5" max="100" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/></label>
      <button type="button" onClick={()=>{setScrolling(false);viewer.current?.scrollBy({top:(viewer.current.clientHeight*0.8),behavior:'smooth'});}}>ページを送る</button></div></header>
      <div ref={viewer} className="score-scroll" style={{fontSize}} onWheel={()=>setScrolling(false)} onTouchStart={()=>setScrolling(false)}>{currentScore?<ScoreBody body={currentScore.body} transpose={transpose} flats={flats}/>:<p>この曲の譜面は未登録です。演奏ビューを閉じて登録してください。</p>}</div>
    </div>}
  </section>;
}
