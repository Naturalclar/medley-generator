export type Mastery = "ready" | "practicing" | "wishlist";

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  key: string | null;
  bpm: number | null;
  mastery: Mastery;
  lastPlayedAt: string | null;
  /** YouTube の動画ID(11文字)。不明なら null。YouTube Music とも共通。 */
  youtubeId: string | null;
  tags: string[];
  memo: string;
}

export const MASTERY_LABEL: Record<Mastery, string> = {
  ready: "弾ける",
  practicing: "練習中",
  wishlist: "覚えたい",
};
