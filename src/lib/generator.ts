import type {
  Song,
  WorkCodeStatus,
  WorkSociety,
  YoutubeStatus,
} from "./types";

export interface GenerateOptions {
  count: number;
  includeWishlist: boolean;
  /**
   * 覚えたい曲だけでセトリを組む。新しい曲を集中的にさらいたいとき用。
   *
   * includeWishlist が「弾ける曲に足す」フラグなのに対し、こちらは「絞る」指定。
   * 立っている間は includeWishlist を見ない(足す対象が無いため)。
   */
  wishlistOnly?: boolean;
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
 * セトリ生成:
 * - 弾ける曲を基本に選出(一様ランダム)
 * - 練習中の曲を1枠に1曲だけ混ぜる
 * - includeWishlist で「覚えたい」曲も選出対象に含める(挑戦枠)
 * - wishlistOnly なら覚えたい曲だけで組む(練習中の枠も作らない)
 *
 * 並び順は選出順のまま。以前はBPMの山(緩→急→緩)に並べ替えていたが、
 * bpm を持つ曲がほとんど無く実質機能していなかったため外した(#142)。
 */
export function generateSetlist(
  allSongs: Song[],
  options: GenerateOptions,
): Song[] {
  const random = options.random ?? Math.random;

  // 「覚えたい曲だけ」は絞り込みなので、練習中を1枠混ぜるルールより優先する。
  // (覚えたい曲をさらう目的で選んでいるのに練習中が混ざると意図がずれる)
  if (options.wishlistOnly) {
    const wishlistOnlyPool = allSongs.filter((s) => s.mastery === "wishlist");
    return sample(wishlistOnlyPool, options.count, random);
  }

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

  return picked;
}

/**
 * 指定オプションで generateSetlist が実際に返せる最大曲数。
 * ready + wishlist(含める場合) + 練習中スロット(あれば1)。
 * wishlistOnly なら覚えたい曲数そのもの。
 * UI の曲数上限をこの値に合わせることで「上限は許すのに生成できない」ズレを防ぐ。
 */
export function maxSetlistSize(
  allSongs: Song[],
  includeWishlist: boolean,
  wishlistOnly = false,
): number {
  const wishlistCount = allSongs.filter(
    (s) => s.mastery === "wishlist",
  ).length;
  if (wishlistOnly) return wishlistCount;

  const ready = allSongs.filter((s) => s.mastery === "ready").length;
  const wishlist = includeWishlist ? wishlistCount : 0;
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

/** watch_videos が一度に受け付ける動画数の上限。 */
const WATCH_VIDEOS_LIMIT = 50;

/**
 * セトリから YouTube の一時プレイリストURLを作る。
 *
 * `youtube.com/watch_videos?video_ids=...` は、指定した動画を並び順どおりに
 * 連続再生してくれる。OAuth もアカウントも要らない代わりに、アカウントには
 * 保存されない(その場限りのプレイリスト)。
 *
 * youtubeId が未設定の曲は含められないので飛ばす。1曲も無ければ null。
 */
export function buildYoutubePlaylistUrl(setlist: Song[]): string | null {
  const ids = setlist
    .map((s) => s.youtubeId)
    .filter((id): id is string => !!id)
    .slice(0, WATCH_VIDEOS_LIMIT);
  if (ids.length === 0) return null;
  return `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`;
}

/** セトリのうち youtubeId が設定済みの曲数(UIで「N曲中M曲」を出すため)。 */
export function countPlayableOnYoutube(setlist: Song[]): number {
  return setlist.filter((s) => s.youtubeId).length;
}

/**
 * セトリのうち連続再生に含められない曲を、セトリの並び順で返す。
 *
 * ボタンには再生できる曲数しか出ないので、8曲のセトリで「(6曲)」と出ても
 * どの2曲が落ちたか画面から分からない。落ちた曲そのものを出すために使う(#145)。
 *
 * 落ちる条件は youtubeId が無いことだけ。上限50曲(WATCH_VIDEOS_LIMIT)で
 * 切られたぶんは「登録はあるのに入らなかった」曲なので、ここには含めない。
 */
export function unplayableOnYoutube(setlist: Song[]): Song[] {
  return setlist.filter((s) => !s.youtubeId);
}

/** avvy の楽曲申請フォーム。1曲ずつ申請する形式で、初期値の受け渡しには非対応。 */
export const MUSIC_USE_REQUEST_URL = "https://app.avvy.live/music-use-request";

/**
 * 申請フォームに入れる作品コード。1曲はJASRAC/NexToneのどちらか一方の管理なので、
 * 入っている方を返す。両方 null(管理外・未調査)なら null。
 */
export function workCodeOf(song: Song): string | null {
  return song.jasracCode ?? song.nextoneCode ?? null;
}

/**
 * 作品コードを管理している団体。コードが無ければ null。
 * 申請フォームでの取り違えを防ぐため、コードと一緒に画面へ出す。
 */
export function workSocietyOf(song: Song): WorkSociety | null {
  if (song.jasracCode) return "JASRAC";
  if (song.nextoneCode) return "NexTone";
  return null;
}

/**
 * 作品コードから見た曲の状態。
 * コードが無い場合、workCodeNotFound(調査済みで両DBに登録なし)かどうかで
 * 「調べても無駄」と「調べれば申請できるかも」を分ける。
 */
export function workCodeStatusOf(song: Song): WorkCodeStatus {
  if (workCodeOf(song)) return "requestable";
  return song.workCodeNotFound ? "not-found" : "unchecked";
}

/** youtubeId の有無。一覧の絞り込みに使う(#145)。 */
export function youtubeStatusOf(song: Song): YoutubeStatus {
  return song.youtubeId ? "has-video" : "no-video";
}

export interface MusicUseRequestItem {
  song: Song;
  code: string;
  society: WorkSociety;
}

/**
 * セトリのうち申請に出せる曲(作品コードが分かっている曲)を、セトリの並び順で返す。
 *
 * 申請は1曲ずつ・初期値の受け渡し不可なので、UI側はこの一覧を出して
 * 値をコピーさせる。コード未登録の曲は出しても手入力できないため除く。
 */
export function requestableSongs(setlist: Song[]): MusicUseRequestItem[] {
  return setlist.flatMap((song) => {
    const code = workCodeOf(song);
    const society = workSocietyOf(song);
    return code && society ? [{ song, code, society }] : [];
  });
}

export interface UnrequestableItem {
  song: Song;
  status: Exclude<WorkCodeStatus, "requestable">;
}

/**
 * セトリのうち申請に出せない曲を、理由付きでセトリの並び順で返す。
 *
 * 単に除外して曲数だけ出すと「なぜ出せないのか」「調べる価値があるのか」が
 * 分からないので、状態を添えて UI に見せる。
 */
export function unrequestableSongs(setlist: Song[]): UnrequestableItem[] {
  return setlist.flatMap((song) => {
    const status = workCodeStatusOf(song);
    return status === "requestable" ? [] : [{ song, status }];
  });
}
