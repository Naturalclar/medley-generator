import { useEffect, useMemo, useState } from "react";
import songsData from "./data/songs.json";
import {
  formatSetlistText,
  generateSetlist,
  maxSetlistSize,
} from "./lib/generator";
import type { Song } from "./lib/types";
import { MASTERY_LABEL } from "./lib/types";
import "./App.css";

const songs = songsData as Song[];

function App() {
  // 入力そのものは文字列で保持し、生成に使う値は [1, maxSelectable] にクランプする。
  // これで空欄・NaN・上限超過でも生成が壊れない。
  const [countInput, setCountInput] = useState("4");
  const [includeWishlist, setIncludeWishlist] = useState(true);
  const [setlist, setSetlist] = useState<Song[]>([]);
  const [copied, setCopied] = useState(false);

  // 実際に generateSetlist が返せる最大曲数(UIの上限もこれに合わせる)
  const maxSelectable = useMemo(
    () => maxSetlistSize(songs, includeWishlist),
    [includeWishlist],
  );

  const count = useMemo(() => {
    const n = Math.floor(Number(countInput));
    if (!Number.isFinite(n)) return 1;
    return Math.min(Math.max(n, 1), maxSelectable);
  }, [countInput, maxSelectable]);

  // wishlist トグル等で上限が変わったら、入力欄の表示もクランプ後の値に追従させる。
  // (入力中の値を上書きしないよう、依存は maxSelectable のみ)
  useEffect(() => {
    setCountInput((prev) => {
      const n = Math.floor(Number(prev));
      const clamped = Number.isFinite(n)
        ? Math.min(Math.max(n, 1), maxSelectable)
        : 1;
      return String(clamped);
    });
  }, [maxSelectable]);

  const handleGenerate = () => {
    setCountInput(String(count));
    setSetlist(generateSetlist(songs, { count, includeWishlist }));
    setCopied(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatSetlistText(setlist, new Date()));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="app">
      <header>
        <h1>🎹 メドレーセトリ生成</h1>
        <p className="subtitle">配信で演奏するメドレーの曲目を自動で組む</p>
      </header>

      <section className="controls">
        <label>
          曲数
          <input
            type="number"
            min={1}
            max={maxSelectable}
            value={countInput}
            onChange={(e) => setCountInput(e.target.value)}
            onBlur={() => setCountInput(String(count))}
          />
          <span className="max-hint">/ 最大 {maxSelectable}</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeWishlist}
            onChange={(e) => setIncludeWishlist(e.target.checked)}
          />
          覚えたい曲も含める(挑戦枠)
        </label>
        <button className="generate" onClick={handleGenerate}>
          セトリ生成
        </button>
      </section>

      {setlist.length > 0 && (
        <section className="setlist">
          <h2>今日のセトリ</h2>
          <ol>
            {setlist.map((song) => (
              <li key={song.id}>
                <span className="title">{song.title}</span>
                {song.artist && <span className="artist">{song.artist}</span>}
                <span className={`badge ${song.mastery}`}>
                  {MASTERY_LABEL[song.mastery]}
                </span>
                {song.bpm && <span className="bpm">♩={song.bpm}</span>}
              </li>
            ))}
          </ol>
          <div className="actions">
            <button onClick={handleCopy}>
              {copied ? "コピーしました ✓" : "テキストをコピー"}
            </button>
            <button className="secondary" onClick={handleGenerate}>
              再生成
            </button>
          </div>
          <pre className="preview">{formatSetlistText(setlist, new Date())}</pre>
        </section>
      )}

      <section className="pool">
        <h2>曲プール ({songs.length}曲)</h2>
        <table>
          <thead>
            <tr>
              <th>曲</th>
              <th>アーティスト</th>
              <th>習熟度</th>
              <th>タグ</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song) => (
              <tr key={song.id}>
                <td>{song.title}</td>
                <td>{song.artist ?? "-"}</td>
                <td>
                  <span className={`badge ${song.mastery}`}>
                    {MASTERY_LABEL[song.mastery]}
                  </span>
                </td>
                <td>{song.tags.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          曲の追加・編集は <code>src/data/songs.json</code> を直接編集
          (Gitが履歴になる)
        </p>
      </section>
    </div>
  );
}

export default App;
