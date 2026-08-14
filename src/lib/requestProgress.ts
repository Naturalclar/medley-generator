/**
 * 楽曲申請の進捗。
 *
 * avvy の申請は1曲ずつ・初期値の受け渡し不可で、一括入力にも対応していない。
 * 10曲のセトリなら10回フォームを往復することになり、途中で中断すると
 * 「どこまで出したか」が分からなくなる。それを記録しておくための仕組み。
 *
 * 申請は配信ごとに出すものなので、進捗は日付(YYYY-MM-DD)でスコープを切る。
 *
 * 保存先は localStorage。songs.json には**置かない** — songs.json は公開
 * エンドポイントとして配信されており、「いつ何を配信で弾いたか」は配信者
 * 個人の運用情報だから。
 */

const STORAGE_KEY = "medley-generator:request-progress";

/** 保持する日付の数。古い配信の進捗は消えてよいので、増え続けないよう間引く。 */
export const KEEP_DAYS = 30;

/** 日付(YYYY-MM-DD) -> その日に申請済みの曲id。 */
export type RequestProgress = Record<string, string[]>;

/** ローカル時刻での YYYY-MM-DD。セトリのテキストと同じ日付の切り方に合わせる。 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isRequested(
  progress: RequestProgress,
  date: string,
  songId: string,
): boolean {
  return progress[date]?.includes(songId) ?? false;
}

/** 申請済み⇄未申請を切り替えた新しい進捗を返す(元のオブジェクトは変えない)。 */
export function toggleRequested(
  progress: RequestProgress,
  date: string,
  songId: string,
): RequestProgress {
  const current = progress[date] ?? [];
  const next = current.includes(songId)
    ? current.filter((id) => id !== songId)
    : [...current, songId];
  const updated = { ...progress, [date]: next };
  // 空になった日付は残さない(間引きの対象を減らし、保存内容も素直になる)
  if (next.length === 0) delete updated[date];
  return updated;
}

/** 指定した曲のうち、その日に申請済みの数。 */
export function requestedCount(
  progress: RequestProgress,
  date: string,
  songIds: string[],
): number {
  const done = progress[date];
  if (!done) return 0;
  return songIds.filter((id) => done.includes(id)).length;
}

/** 新しい日付から keep 件だけ残す。 */
export function pruneProgress(
  progress: RequestProgress,
  keep = KEEP_DAYS,
): RequestProgress {
  const dates = Object.keys(progress).sort().reverse().slice(0, keep);
  return Object.fromEntries(dates.map((d) => [d, progress[d]]));
}

/**
 * localStorage から読む。
 * プライベートブラウジングなどで使えない/壊れている場合は空として扱う
 * (進捗が消えるだけで、申請そのものは続けられる)。
 */
export function loadProgress(): RequestProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    // 想定外の形が混ざっていても落ちないよう、文字列配列だけ拾う
    const out: RequestProgress = {};
    for (const [date, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ids)) {
        out[date] = ids.filter((id): id is string => typeof id === "string");
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveProgress(progress: RequestProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruneProgress(progress)));
  } catch {
    // 保存できなくても操作は続けられるようにする(容量超過・無効化など)
  }
}
