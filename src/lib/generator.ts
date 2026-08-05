import type { Song } from "./types";

export interface GenerateOptions {
  count: number;
  includeWishlist: boolean;
  /**
   * 乱数生成器。既定は Math.random。
   * テストで決定的な結果を得たいときに差し替える([0,1) を返すこと)。
   */
  random?: () => number;
}

/** プールから重複なく count 曲を一様ランダムに選ぶ。 */
function sample(pool: Song[], count: number, random: () => number): Song[] {
  const remaining = [...pool];
  const picked: Song[] = [];
  while (picked.length < count && remaining.length > 0) {
    const idx = Math.floor(random() * remaining.length);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

/**
 * BPMの山を作る並び: 緩→急→緩。
 * BPM不明の曲は既知BPMの中央値として扱う。
 */
export function arrangeBpmArc(songs: Song[]): Song[] {
  const known = songs.filter((s) => s.bpm !== null).map((s) => s.bpm as number);
  const median =
    known.length > 0
      ? known.sort((a, b) => a - b)[Math.floor(known.length / 2)]
      : 120;
  const effectiveBpm = (s: Song) => s.bpm ?? median;

  const sorted = [...songs].sort((a, b) => effectiveBpm(a) - effectiveBpm(b));
  // 遅い順に前後交互に振り分けると、最速が中央に来る山型になる
  const front: Song[] = [];
  const back: Song[] = [];
  sorted.forEach((song, i) => {
    if (i % 2 === 0) front.push(song);
    else back.push(song);
  });
  return [...front, ...back.reverse()];
}

/**
 * セトリ生成:
 * - 弾ける曲を基本に選出(一様ランダム)
 * - 練習中の曲を1枠に1曲だけ混ぜる
 * - includeWishlist で「覚えたい」曲も選出対象に含める(挑戦枠)
 * - 並びはBPMの山(緩→急→緩)
 */
export function generateSetlist(
  allSongs: Song[],
  options: GenerateOptions,
): Song[] {
  const random = options.random ?? Math.random;
  const ready = allSongs.filter((s) => s.mastery === "ready");
  const practicing = allSongs.filter((s) => s.mastery === "practicing");
  const wishlist = options.includeWishlist
    ? allSongs.filter((s) => s.mastery === "wishlist")
    : [];

  const picked: Song[] = [];
  const mainPool = [...ready, ...wishlist];

  // 練習中は1枠に1曲だけ「おまけ」で混ぜる。
  // ただし1曲だけのセトリで ready/wishlist があるなら、その枠は本命曲に譲る
  // (1曲メドレーを練習中で埋めない)。ready/wishlist が尽きている場合は練習中で埋める。
  const usePracticingSlot =
    practicing.length > 0 && (options.count > 1 || mainPool.length === 0);
  if (usePracticingSlot) {
    picked.push(...sample(practicing, 1, random));
  }

  const rest = mainPool.filter((s) => !picked.some((p) => p.id === s.id));
  picked.push(...sample(rest, options.count - picked.length, random));

  return arrangeBpmArc(picked);
}

/**
 * 指定オプションで generateSetlist が実際に返せる最大曲数。
 * ready + wishlist(含める場合) + 練習中スロット(あれば1)。
 * UI の曲数上限をこの値に合わせることで「上限は許すのに生成できない」ズレを防ぐ。
 */
export function maxSetlistSize(
  allSongs: Song[],
  includeWishlist: boolean,
): number {
  const ready = allSongs.filter((s) => s.mastery === "ready").length;
  const wishlist = includeWishlist
    ? allSongs.filter((s) => s.mastery === "wishlist").length
    : 0;
  const hasPracticing = allSongs.some((s) => s.mastery === "practicing");
  return ready + wishlist + (hasPracticing ? 1 : 0);
}

/** ready 以外(練習中 / 覚えたい)は「挑戦枠」= メドレーに混ぜる挑戦曲。 */
export function isChallenge(song: Song): boolean {
  return song.mastery !== "ready";
}

/**
 * コメント欄/概要欄に貼れるプレーンテキスト。
 * markChallenge=true で挑戦枠の曲に 🔰 を付ける。
 */
export function formatSetlistText(
  setlist: Song[],
  date: Date,
  options?: { markChallenge?: boolean },
): string {
  const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  const lines = setlist.map((s, i) => {
    const artist = s.artist ? ` / ${s.artist}` : "";
    const mark = options?.markChallenge && isChallenge(s) ? "🔰 " : "";
    return `${i + 1}. ${mark}${s.title}${artist}`;
  });
  return [`🎹 ${dateStr} メドレーセトリ`, ...lines].join("\n");
}
