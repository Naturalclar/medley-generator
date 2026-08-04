export type Mastery = "ready" | "practicing" | "wishlist";

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  key: string | null;
  bpm: number | null;
  mastery: Mastery;
  lastPlayedAt: string | null;
  tags: string[];
  memo: string;
}

export const MASTERY_LABEL: Record<Mastery, string> = {
  ready: "弾ける",
  practicing: "練習中",
  wishlist: "覚えたい",
};
