import type { Song } from "./types";

export interface GenerateOptions {
  count: number;
  includeWishlist: boolean;
  now?: Date;
}

const COOLDOWN_DAYS = 7;

function daysSince(dateStr: string | null, now: Date): number | null {
  if (!dateStr) return null;
  const played = new Date(dateStr).getTime();
  if (Number.isNaN(played)) return null;
  return (now.getTime() - played) / (1000 * 60 * 60 * 24);
}

/**
 * 選出重み: 最近演奏した曲はクールダウンとして確率を下げる。
 * 未演奏 or COOLDOWN_DAYS 以上前なら重み1、直近ほど0に近づく。
 */
function selectionWeight(song: Song, now: Date): number {
  const days = daysSince(song.lastPlayedAt, now);
  if (days === null || days >= COOLDOWN_DAYS) return 1;
  return Math.max(0.05, days / COOLDOWN_DAYS);
}

function weightedSample(pool: Song[], count: number, now: Date): Song[] {
  const remaining = [...pool];
  const picked: Song[] = [];
  while (picked.length < count && remaining.length > 0) {
    const weights = remaining.map((s) => selectionWeight(s, now));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

/**
 * BPMの山を作る並び: 緩→急→緩。
 * BPM不明の曲は既知BPMの中央値として扱う。
 */
function arrangeBpmArc(songs: Song[]): Song[] {
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
 * - 弾ける曲を基本に選出(クールダウン重み付き)
 * - 練習中の曲を1枠に1曲だけ混ぜる
 * - includeWishlist で「覚えたい」曲も選出対象に含める(挑戦枠)
 * - 並びはBPMの山(緩→急→緩)
 */
export function generateSetlist(
  allSongs: Song[],
  options: GenerateOptions,
): Song[] {
  const now = options.now ?? new Date();
  const ready = allSongs.filter((s) => s.mastery === "ready");
  const practicing = allSongs.filter((s) => s.mastery === "practicing");
  const wishlist = options.includeWishlist
    ? allSongs.filter((s) => s.mastery === "wishlist")
    : [];

  const picked: Song[] = [];

  // 練習中は1枠に1曲だけ
  if (practicing.length > 0 && options.count > 1) {
    picked.push(...weightedSample(practicing, 1, now));
  }

  const mainPool = [...ready, ...wishlist].filter(
    (s) => !picked.some((p) => p.id === s.id),
  );
  picked.push(...weightedSample(mainPool, options.count - picked.length, now));

  return arrangeBpmArc(picked);
}

/** コメント欄/概要欄に貼れるプレーンテキスト */
export function formatSetlistText(setlist: Song[], date: Date): string {
  const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  const lines = setlist.map((s, i) => {
    const artist = s.artist ? ` / ${s.artist}` : "";
    return `${i + 1}. ${s.title}${artist}`;
  });
  return [`🎹 ${dateStr} メドレーセトリ`, ...lines].join("\n");
}
