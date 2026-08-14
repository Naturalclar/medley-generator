import { Fragment, useEffect, useMemo, useState } from "react";
import songsData from "./data/songs.json";
import {
  buildYoutubePlaylistUrl,
  countPlayableOnYoutube,
  formatSetlistText,
  generateSetlist,
  isChallenge,
  maxSetlistSize,
  MUSIC_USE_REQUEST_URL,
  requestableSongs,
  unrequestableSongs,
  workCodeOf,
  workCodeStatusOf,
  workSocietyOf,
} from "./lib/generator";
import type { Mastery, Song, WorkCodeStatus } from "./lib/types";
import {
  MASTERY_LABEL,
  WORK_CODE_STATUS_LABEL,
  WORK_CODE_STATUSES,
} from "./lib/types";
import {
  isRequested,
  loadProgress,
  requestedCount,
  saveProgress,
  toDateKey,
  toggleRequested,
  type RequestProgress,
} from "./lib/requestProgress";
import {
  createPlaylist,
  isYoutubePlaylistEnabled,
  requestAccessToken,
} from "./lib/youtube";
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

/** 申請できない曲に添える一言。次に何をすべきかが分かる文言にする。 */
const UNREQUESTABLE_REASON: Record<
  Exclude<WorkCodeStatus, "requestable">,
  string
> = {
  unchecked: "まだ調べていない。調べれば申請できるかもしれない",
  "not-found": "JASRAC・NexTone のどちらにも登録なし。申請不要の可能性",
};

function App() {
  // 入力そのものは文字列で保持し、生成に使う値は [1, maxSelectable] にクランプする。
  // これで空欄・NaN・上限超過でも生成が壊れない。
  const [countInput, setCountInput] = useState("4");
  const [includeWishlist, setIncludeWishlist] = useState(true);
  const [setlist, setSetlist] = useState<Song[]>([]);
  // セトリを生成した日時。テキストの日付はこの値で固定し、コピーとプレビューで一致させる。
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  // コピー用テキストで挑戦枠に 🔰 を付けるか
  const [markChallenge, setMarkChallenge] = useState(true);

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
  // 作品コードの状態での絞り込み(申請可 / 未調査 / 登録なし)
  const [workCodeFilter, setWorkCodeFilter] = useState<
    Record<WorkCodeStatus, boolean>
  >({ requestable: true, unchecked: true, "not-found": true });

  const filteredPool = useMemo(() => {
    const q = poolSearch.trim().toLowerCase();
    const result = songs.filter((s) => {
      if (!masteryFilter[s.mastery]) return false;
      if (!workCodeFilter[workCodeStatusOf(s)]) return false;
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
  }, [poolSearch, masteryFilter, workCodeFilter, activeTags, sortKey, sortDir]);

  const toggleMastery = (m: Mastery) =>
    setMasteryFilter((prev) => ({ ...prev, [m]: !prev[m] }));

  const toggleWorkCode = (st: WorkCodeStatus) =>
    setWorkCodeFilter((prev) => ({ ...prev, [st]: !prev[st] }));

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
        ? formatSetlistText(setlist, generatedAt ?? new Date(), {
            markChallenge,
          })
        : "",
    [setlist, generatedAt, markChallenge],
  );

  // セトリ内の挑戦枠(練習中 / 覚えたい)の曲数
  const challengeCount = useMemo(
    () => setlist.filter(isChallenge).length,
    [setlist],
  );

  // YouTube 連続再生用のURL(youtubeId が設定済みの曲のみ)
  const youtubeUrl = useMemo(() => buildYoutubePlaylistUrl(setlist), [setlist]);
  const youtubeCount = useMemo(
    () => countPlayableOnYoutube(setlist),
    [setlist],
  );

  // プレイリスト作成(OAuth)。クライアントID未設定の環境では機能ごと出さない。
  const [playlistState, setPlaylistState] = useState<
    | { status: "idle" }
    | { status: "working"; added: number; total: number }
    | { status: "done"; url: string; added: number; failed: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const handleCreatePlaylist = async () => {
    const videoIds = setlist
      .map((s) => s.youtubeId)
      .filter((id): id is string => !!id);
    if (videoIds.length === 0) return;

    setPlaylistState({ status: "working", added: 0, total: videoIds.length });
    try {
      const token = await requestAccessToken();
      const result = await createPlaylist(
        token,
        formatSetlistText(setlist, generatedAt ?? new Date()).split("\n")[0],
        videoIds,
        (p) =>
          setPlaylistState({
            status: "working",
            added: p.added,
            total: p.total,
          }),
      );
      setPlaylistState({
        status: "done",
        url: result.url,
        added: result.added,
        failed: result.failed,
      });
    } catch (e) {
      setPlaylistState({
        status: "error",
        message: e instanceof Error ? e.message : "プレイリストを作成できませんでした",
      });
    }
  };

  // 楽曲申請は1曲ずつ・初期値の受け渡し不可なので、値をコピーさせる形にする。
  const requestable = useMemo(() => requestableSongs(setlist), [setlist]);
  // 申請に出せない曲。理由(未調査 / 登録なし)で次の動きが変わるので出し分ける。
  const unrequestable = useMemo(() => unrequestableSongs(setlist), [setlist]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // 申請の進捗(日付ごと)。1曲ずつ往復するので、中断しても再開できるよう残す。
  const [progress, setProgress] = useState<RequestProgress>({});
  // localStorage は初回描画後に読む(SSRしないので実害は無いが、初期値は空で揃える)
  useEffect(() => setProgress(loadProgress()), []);

  const requestDate = useMemo(
    () => toDateKey(generatedAt ?? new Date()),
    [generatedAt],
  );

  const doneCount = useMemo(
    () =>
      requestedCount(
        progress,
        requestDate,
        requestable.map((r) => r.song.id),
      ),
    [progress, requestDate, requestable],
  );

  const markRequested = (songId: string) => {
    setProgress((prev) => {
      const next = toggleRequested(prev, requestDate, songId);
      saveProgress(next);
      return next;
    });
  };

  // 申請ウィザード。1曲ずつ大きく出して、コピー忘れと進捗の取りこぼしを防ぐ。
  const [wizardIndex, setWizardIndex] = useState<number | null>(null);
  // 今のステップでコピー済みのフィールド。曲が変わったらリセットする。
  const [stepCopied, setStepCopied] = useState<Set<string>>(new Set());

  const wizardItem =
    wizardIndex !== null ? (requestable[wizardIndex] ?? null) : null;

  // 中断して戻ってきたとき、済んだ曲を頭からなぞり直さずに済むよう未申請から開く。
  const firstUndoneIndex = useMemo(() => {
    const i = requestable.findIndex(
      (r) => !isRequested(progress, requestDate, r.song.id),
    );
    return i === -1 ? 0 : i;
  }, [requestable, progress, requestDate]);

  const goToStep = (index: number) => {
    setWizardIndex(index);
    setStepCopied(new Set());
  };

  const copyInWizard = async (field: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setStepCopied((prev) => new Set(prev).add(field));
  };

  // ウィザードに出す項目。申請フォームに要る値を上から順に貼っていける並びにする。
  const wizardFields: {
    key: string;
    label: string;
    value: string | null;
    className?: string;
    society?: string;
  }[] = wizardItem
    ? [
        { key: "title", label: "曲名", value: wizardItem.song.title, className: "title" },
        { key: "artist", label: "アーティスト", value: wizardItem.song.artist },
        { key: "lyricist", label: "作詞者", value: wizardItem.song.lyricist },
        { key: "composer", label: "作曲者", value: wizardItem.song.composer },
        {
          key: "code",
          label: "作品コード",
          value: wizardItem.code,
          className: "code",
          society: wizardItem.society,
        },
      ]
    : [];

  // セトリを組み直したらウィザードは畳む(別のセトリの途中状態を残さない)
  useEffect(() => setWizardIndex(null), [setlist]);

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
            onChange={(e) => {
              setIncludeWishlist(e.target.checked);
              // 設定を変えると表示中のセトリは古くなる(例: OFFにしても直前の
              // wishlist入りセトリが残る)。混乱を避けてクリアし再生成を促す。
              setSetlist([]);
              setGeneratedAt(null);
              setCopied(false);
            }}
          />
          覚えたい曲も含める(挑戦枠)
        </label>
        <button className="generate" onClick={handleGenerate}>
          セトリ生成
        </button>
      </section>

      {setlist.length > 0 && (
        <section className="setlist">
          <h2>
            今日のセトリ
            {challengeCount > 0 && (
              <span className="challenge-count">
                🔰 挑戦枠 {challengeCount}曲
              </span>
            )}
          </h2>
          <ol>
            {setlist.map((song) => (
              <li key={song.id} className={isChallenge(song) ? "challenge" : ""}>
                {isChallenge(song) && (
                  <span className="challenge-mark" title="挑戦枠">
                    🔰
                  </span>
                )}
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
            {youtubeUrl && (
              <a
                className="button youtube"
                href={youtubeUrl}
                target="_blank"
                rel="noreferrer"
                title="YouTubeで連続再生(その場限りのプレイリスト)"
              >
                ▶ YouTubeで再生
                {youtubeCount < setlist.length && ` (${youtubeCount}曲)`}
              </a>
            )}
            {youtubeUrl && isYoutubePlaylistEnabled() && (
              <button
                className="secondary"
                onClick={handleCreatePlaylist}
                disabled={playlistState.status === "working"}
              >
                {playlistState.status === "working"
                  ? `作成中… (${playlistState.added}/${playlistState.total})`
                  : "プレイリストに保存"}
              </button>
            )}
            <label className="checkbox mark-toggle">
              <input
                type="checkbox"
                checked={markChallenge}
                onChange={(e) => setMarkChallenge(e.target.checked)}
              />
              挑戦曲に🔰(コピー用)
            </label>
          </div>
          {playlistState.status === "done" && (
            <p className="hint">
              プレイリストを作成しました({playlistState.added}曲
              {playlistState.failed > 0 && ` / ${playlistState.failed}曲は失敗`}
              )。{" "}
              <a href={playlistState.url} target="_blank" rel="noreferrer">
                YouTubeで開く
              </a>
            </p>
          )}
          {playlistState.status === "error" && (
            <p className="hint error">{playlistState.message}</p>
          )}
          {!youtubeUrl && (
            <p className="hint">
              このセトリの曲にはまだ YouTube の動画IDが登録されていないため、
              連続再生リンクを作れません。
            </p>
          )}
          <pre className="preview">{setlistText}</pre>
        </section>
      )}

      {setlist.length > 0 && (
        <section className="request">
          <h2>楽曲申請 (avvy)</h2>
          <p className="hint">
            申請は1曲ずつで、フォームに値を渡す手段が無いため、ここからコピーして
            貼り付ける。値をクリックするとコピーされる。
          </p>
          <div className="actions">
            <a
              className="button"
              href={MUSIC_USE_REQUEST_URL}
              target="_blank"
              rel="noreferrer"
            >
              申請フォームを開く
            </a>
            {requestable.length > 0 && wizardIndex === null && (
              <button onClick={() => goToStep(firstUndoneIndex)}>
                {doneCount > 0 ? "申請を再開" : "申請を始める"}
              </button>
            )}
            {requestable.length > 0 && (
              <span className="request-progress">
                申請済み {doneCount} / {requestable.length}
              </span>
            )}
          </div>
          {wizardItem && wizardIndex !== null && (
            <div className="wizard">
              <div className="wizard-head">
                <strong>
                  {wizardIndex + 1} / {requestable.length} 曲目
                </strong>
                <button
                  className="wizard-close"
                  onClick={() => setWizardIndex(null)}
                >
                  × 閉じる
                </button>
              </div>
              <dl className="wizard-fields">
                {wizardFields.map((f) => {
                  // クロージャの中でも null 除外が効くようローカルに取り出す
                  const value = f.value;
                  return (
                  <Fragment key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>
                      {value === null ? (
                        // 申請に要る値なので、欠けていることが分かるように行は残す
                        <span className="value-missing">未登録</span>
                      ) : (
                        <>
                          <button
                            className={`copy-value ${f.className ?? ""}`}
                            onClick={() => copyInWizard(f.key, value)}
                          >
                            {value}
                          </button>
                          {f.society && (
                            <span
                              className={`society ${f.society.toLowerCase()}`}
                            >
                              {f.society}
                            </span>
                          )}
                          {stepCopied.has(f.key) && (
                            <span className="copied-mark">コピー済み ✓</span>
                          )}
                        </>
                      )}
                    </dd>
                  </Fragment>
                  );
                })}
              </dl>
              <p className="hint">
                値をクリックするとコピーされる。フォームに貼ったら「申請済みにして次へ」。
              </p>
              <div className="wizard-actions">
                <button
                  className="secondary"
                  disabled={wizardIndex === 0}
                  onClick={() => goToStep(wizardIndex - 1)}
                >
                  ← 前へ
                </button>
                <button
                  className="secondary"
                  disabled={wizardIndex >= requestable.length - 1}
                  onClick={() => goToStep(wizardIndex + 1)}
                >
                  スキップ
                </button>
                <button
                  onClick={() => {
                    if (
                      !isRequested(progress, requestDate, wizardItem.song.id)
                    ) {
                      markRequested(wizardItem.song.id);
                    }
                    if (wizardIndex < requestable.length - 1) {
                      goToStep(wizardIndex + 1);
                    } else {
                      setWizardIndex(null);
                    }
                  }}
                >
                  {wizardIndex >= requestable.length - 1
                    ? "申請済みにして終了"
                    : "申請済みにして次へ →"}
                </button>
              </div>
            </div>
          )}
          {requestable.length === 0 ? (
            <p className="hint">
              このセトリの曲には作品コードが1つも入っていないため、申請に必要な値を
              出せません。
            </p>
          ) : (
            <>
              <p className="hint">
                {setlist.length}曲中 {requestable.length}曲を申請できます
              </p>
              <ol className="request-list">
                {requestable.map(({ song, code, society }) => (
                  <li
                    key={song.id}
                    className={
                      isRequested(progress, requestDate, song.id) ? "done" : ""
                    }
                  >
                    <label className="request-done">
                      <input
                        type="checkbox"
                        checked={isRequested(progress, requestDate, song.id)}
                        onChange={() => markRequested(song.id)}
                        aria-label={`${song.title} を申請済みにする`}
                      />
                    </label>
                    <button
                      className="copy-value title"
                      onClick={() => copyValue(`${song.id}:title`, song.title)}
                    >
                      {copiedField === `${song.id}:title` ? "コピー ✓" : song.title}
                    </button>
                    {song.artist && (
                      <button
                        className="copy-value"
                        onClick={() =>
                          copyValue(`${song.id}:artist`, song.artist as string)
                        }
                      >
                        {copiedField === `${song.id}:artist`
                          ? "コピー ✓"
                          : song.artist}
                      </button>
                    )}
                    {song.lyricist && (
                      <button
                        className="copy-value credit"
                        title="作詞者"
                        onClick={() =>
                          copyValue(`${song.id}:lyricist`, song.lyricist as string)
                        }
                      >
                        {copiedField === `${song.id}:lyricist`
                          ? "コピー ✓"
                          : `詞 ${song.lyricist}`}
                      </button>
                    )}
                    {song.composer && (
                      <button
                        className="copy-value credit"
                        title="作曲者"
                        onClick={() =>
                          copyValue(`${song.id}:composer`, song.composer as string)
                        }
                      >
                        {copiedField === `${song.id}:composer`
                          ? "コピー ✓"
                          : `曲 ${song.composer}`}
                      </button>
                    )}
                    <button
                      className="copy-value code"
                      onClick={() => copyValue(`${song.id}:code`, code)}
                    >
                      {copiedField === `${song.id}:code` ? "コピー ✓" : code}
                    </button>
                    <span className={`society ${society.toLowerCase()}`}>
                      {society}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {unrequestable.length > 0 && (
            <div className="unrequestable">
              <h3>申請できない曲 ({unrequestable.length})</h3>
              <ul className="unrequestable-list">
                {unrequestable.map(({ song, status }) => (
                  <li key={song.id}>
                    <span className="title">{song.title}</span>
                    {song.artist && <span className="artist">{song.artist}</span>}
                    <span className={`work-status ${status}`}>
                      {WORK_CODE_STATUS_LABEL[status]}
                    </span>
                    <span className="reason">{UNREQUESTABLE_REASON[status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
          <div className="work-code-chips">
            {WORK_CODE_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                className={`chip work-${st} ${workCodeFilter[st] ? "on" : "off"}`}
                aria-pressed={workCodeFilter[st]}
                onClick={() => toggleWorkCode(st)}
              >
                {WORK_CODE_STATUS_LABEL[st]}
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
        <div className="pool-table-wrap">
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
              <th>作品コード</th>
              <th className="col-mastery">
                <button
                  type="button"
                  className="sort-th"
                  onClick={() => handleSort("mastery")}
                >
                  習熟度{sortIndicator("mastery")}
                </button>
              </th>
              <th className="col-tags">タグ</th>
            </tr>
          </thead>
          <tbody>
            {filteredPool.map((song) => {
              const code = workCodeOf(song);
              const society = workSocietyOf(song);
              const status = workCodeStatusOf(song);
              const codeKey = `pool:${song.id}:code`;
              return (
                <tr key={song.id}>
                  <td>{song.title}</td>
                  <td>{song.artist ?? "-"}</td>
                  <td>
                    {code && society ? (
                      <>
                        <button
                          className="copy-value code"
                          onClick={() => copyValue(codeKey, code)}
                        >
                          {copiedField === codeKey ? "コピー ✓" : code}
                        </button>
                        <span className={`society ${society.toLowerCase()}`}>
                          {society}
                        </span>
                      </>
                    ) : (
                      <span className={`work-status ${status}`}>
                        {WORK_CODE_STATUS_LABEL[status]}
                      </span>
                    )}
                  </td>
                  <td className="col-mastery">
                    <span className={`badge ${song.mastery}`}>
                      {MASTERY_LABEL[song.mastery]}
                    </span>
                  </td>
                  <td className="col-tags">{song.tags.join(", ")}</td>
                </tr>
              );
            })}
            {filteredPool.length === 0 && (
              <tr>
                <td colSpan={5} className="pool-empty">
                  該当する曲がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <p className="hint">
          作品コードはクリックでコピーできる。セトリを組まなくても、ここから
          <a href={MUSIC_USE_REQUEST_URL} target="_blank" rel="noreferrer">
            楽曲申請 (avvy)
          </a>
          に貼って申請できる。
        </p>
        <p className="hint">
          曲の追加・編集は <code>src/data/songs.json</code> を直接編集
          (Gitが履歴になる)
        </p>
      </section>

      <section className="about">
        <h2>このアプリについて</h2>
        <p>
          配信で演奏するメドレーの曲目を、登録した曲プールから自動で組むツールです。
          練習中の曲が1曲だけ自然に混ざるように選び、BPMが緩→急→緩の山型になるよう
          並べます。サーバーもデータベースも無く、すべてブラウザの中だけで動きます。
        </p>

        <h3>YouTube との連携</h3>
        <p>
          セトリの曲に YouTube の動画IDが登録されていれば、「▶ YouTubeで再生」から
          その場限りのプレイリストとして連続再生できます(ログイン不要・保存もされません)。
        </p>
        <p>
          「プレイリストに保存」を使うと、Google アカウントで認証したうえで
          <strong>あなた自身の YouTube アカウントに限定公開のプレイリストを作成し</strong>、
          セトリの曲を追加します。<code>youtube</code> 権限はこの目的のためだけに要求し、
          既存のプレイリストや動画の読み取り・変更・削除は行いません。アクセストークンは
          ブラウザのメモリにのみ保持し、保存も外部送信もしません。詳しくは
          <a href="./privacy.html">プライバシーポリシー</a>を参照してください。
        </p>
      </section>

      <footer className="site-footer">
        <a
          href="https://app.avvy.live/music-use-request"
          target="_blank"
          rel="noreferrer"
        >
          楽曲申請 (avvy)
        </a>
        <span aria-hidden="true">·</span>
        <a href="./privacy.html">プライバシーポリシー</a>
      </footer>
    </div>
  );
}

export default App;
