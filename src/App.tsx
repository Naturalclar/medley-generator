import { useEffect, useMemo, useState } from "react";
import songsData from "./data/songs.json";
import {
  formatSetlistText,
  generateSetlist,
  maxSetlistSize,
} from "./lib/generator";
import type { Mastery, Song } from "./lib/types";
import { MASTERY_LABEL } from "./lib/types";
import "./App.css";

const songs = songsData as Song[];
const MASTERIES: Mastery[] = ["ready", "practicing", "wishlist"];
const MASTERY_ORDER: Record<Mastery, number> = {
  ready: 0,
  practicing: 1,
  wishlist: 2,
};

// プール内の全タグを出現数の多い順に。タグフィルタのチップに使う。
const ALL_TAGS = (() => {
  const counts = new Map<string, number>();
  for (const s of songs) {
    for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([tag]) => tag);
})();

type SortKey = "title" | "artist" | "mastery";

function App() {
  // 入力そのものは文字列で保持し、生成に使う値は [1, maxSelectable] にクランプする。
  // これで空欄・NaN・上限超過でも生成が壊れない。
  const [countInput, setCountInput] = useState("4");
  const [includeWishlist, setIncludeWishlist] = useState(true);
  const [setlist, setSetlist] = useState<Song[]>([]);
  // セトリを生成した日時。テキストの日付はこの値で固定し、コピーとプレビューで一致させる。
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);

  // 曲プールの絞り込み(検索 + 習熟度 + タグ)と並べ替え
  const [poolSearch, setPoolSearch] = useState("");
  const [masteryFilter, setMasteryFilter] = useState<Record<Mastery, boolean>>({
    ready: true,
    practicing: true,
    wishlist: true,
  });
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredPool = useMemo(() => {
    const q = poolSearch.trim().toLowerCase();
    const result = songs.filter((s) => {
      if (!masteryFilter[s.mastery]) return false;
      // タグは OR: 選択タグのいずれかを持つ曲を表示(未選択なら全通過)
      if (activeTags.size > 0 && !s.tags.some((t) => activeTags.has(t))) {
        return false;
      }
      if (q === "") return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.artist?.toLowerCase().includes(q) ?? false)
      );
    });

    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      result.sort((a, b) => {
        let cmp: number;
        if (sortKey === "mastery") {
          cmp = MASTERY_ORDER[a.mastery] - MASTERY_ORDER[b.mastery];
        } else {
          const av = sortKey === "title" ? a.title : (a.artist ?? "");
          const bv = sortKey === "title" ? b.title : (b.artist ?? "");
          cmp = av.localeCompare(bv, "ja");
        }
        return cmp * dir;
      });
    }
    return result;
  }, [poolSearch, masteryFilter, activeTags, sortKey, sortDir]);

  const toggleMastery = (m: Mastery) =>
    setMasteryFilter((prev) => ({ ...prev, [m]: !prev[m] }));

  const toggleTag = (t: string) =>
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

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
    setGeneratedAt(new Date());
    setCopied(false);
  };

  // コピー用テキストは1回だけ計算し、プレビューとコピーで共有する(日付も一致)。
  const setlistText = useMemo(
    () =>
      setlist.length > 0
        ? formatSetlistText(setlist, generatedAt ?? new Date())
        : "",
    [setlist, generatedAt],
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(setlistText);
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
          <pre className="preview">{setlistText}</pre>
        </section>
      )}

      <section className="pool">
        <h2>曲プール</h2>
        <div className="pool-filters">
          <input
            type="search"
            className="pool-search"
            placeholder="曲名・アーティストで検索"
            value={poolSearch}
            onChange={(e) => setPoolSearch(e.target.value)}
          />
          <div className="mastery-chips">
            {MASTERIES.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${m} ${masteryFilter[m] ? "on" : "off"}`}
                aria-pressed={masteryFilter[m]}
                onClick={() => toggleMastery(m)}
              >
                {MASTERY_LABEL[m]}
              </button>
            ))}
          </div>
          <span className="pool-count">
            {songs.length}曲中 {filteredPool.length}曲
          </span>
        </div>
        {ALL_TAGS.length > 0 && (
          <div className="tag-filters">
            {ALL_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={`tag-chip ${activeTags.has(t) ? "on" : ""}`}
                aria-pressed={activeTags.has(t)}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
            {activeTags.size > 0 && (
              <button
                type="button"
                className="tag-clear"
                onClick={() => setActiveTags(new Set())}
              >
                クリア
              </button>
            )}
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="sort-th"
                  onClick={() => handleSort("title")}
                >
                  曲{sortIndicator("title")}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="sort-th"
                  onClick={() => handleSort("artist")}
                >
                  アーティスト{sortIndicator("artist")}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="sort-th"
                  onClick={() => handleSort("mastery")}
                >
                  習熟度{sortIndicator("mastery")}
                </button>
              </th>
              <th>タグ</th>
            </tr>
          </thead>
          <tbody>
            {filteredPool.map((song) => (
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
            {filteredPool.length === 0 && (
              <tr>
                <td colSpan={4} className="pool-empty">
                  該当する曲がありません
                </td>
              </tr>
            )}
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
