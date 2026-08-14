export type Mastery = "ready" | "practicing" | "wishlist";

export interface Song {
  id: string;
  title: string;
  /** 実演者(歌手・バンド・キャラ名義)。著作者とは別物なので混同しないこと。 */
  artist: string | null;
  /**
   * 作詞者。楽曲申請に必要。不明なら null。
   * 複数人いる場合は "A / B" のように1つの文字列にまとめる(申請フォームに
   * 貼るだけの用途なので、配列にして扱いを増やす意味が無い)。
   */
  lyricist: string | null;
  /** 作曲者。楽曲申請に必要。不明なら null。複数人の扱いは lyricist と同じ。 */
  composer: string | null;
  key: string | null;
  bpm: number | null;
  mastery: Mastery;
  lastPlayedAt: string | null;
  /** YouTube の動画ID(11文字)。不明なら null。YouTube Music とも共通。 */
  youtubeId: string | null;
  /**
   * JASRAC 作品コード。管理外・不明なら null。
   * 内国作品は `123-4567-8`、外国作品は2桁目のみ英字で `0A1-2345-6`。
   */
  jasracCode: string | null;
  /** NexTone 作品コード。`N` + 半角数字8桁。管理外・不明なら null。 */
  nextoneCode: string | null;
  /**
   * JASRAC・NexTone の両方を調べたが、どちらにも登録が無かった曲の印。
   *
   * 作品コードが両方 null なだけでは「まだ調べていない」のか「調べたが無かった」のか
   * 区別がつかない。true の曲は調査済みなので、再検索しなくてよい。
   * true のとき jasracCode / nextoneCode は必ず null。
   */
  workCodeNotFound: boolean;
  tags: string[];
  memo: string;
}

/** JASRAC 作品コード(内国 `123-4567-8` / 外国 `0A1-2345-6`)。 */
export const JASRAC_CODE_PATTERN = /^\d[0-9A-Z]\d-\d{4}-\d$/;
/** NexTone 作品コード(`N` + 数字8桁)。 */
export const NEXTONE_CODE_PATTERN = /^N\d{8}$/;

export const MASTERY_LABEL: Record<Mastery, string> = {
  ready: "弾ける",
  practicing: "練習中",
  wishlist: "覚えたい",
};

/** 作品コードの管理団体。1曲につきどちらか一方。 */
export type WorkSociety = "JASRAC" | "NexTone";

/**
 * 作品コードから見た曲の状態。
 *
 * `unchecked` と `not-found` はどちらも「コードが無い」だが、次にやることが
 * 正反対(調べる価値がある / 調べても無駄)なので分けている。
 */
export type WorkCodeStatus = "requestable" | "unchecked" | "not-found";

export const WORK_CODE_STATUSES: WorkCodeStatus[] = [
  "requestable",
  "unchecked",
  "not-found",
];

export const WORK_CODE_STATUS_LABEL: Record<WorkCodeStatus, string> = {
  requestable: "申請可",
  unchecked: "未調査",
  "not-found": "登録なし",
};
