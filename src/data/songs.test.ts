import { describe, expect, it } from "vitest";
import songsData from "./songs.json";
import {
  JASRAC_CODE_PATTERN,
  MASTERY_LABEL,
  NEXTONE_CODE_PATTERN,
} from "../lib/types";

// songs.json は `as Song[]` で型アサーションされて使われるため、TypeScript では
// 中身が検証されない(壊れた値が入っても build は通る)。手編集や別経路で不正な
// データが混入していないかをここで守る。
//
// エラー時にどの曲かすぐ分かるよう、問題のあった曲を id 付きで列挙する形にしている。

const songs = songsData as unknown[];
const MASTERIES = Object.keys(MASTERY_LABEL);
const ID_RE = /^[a-z0-9-]+$/;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** 全曲を検査し、条件を満たさない曲を "id: 実際の値" の形で返す。 */
function findViolations(
  predicate: (song: Record<string, unknown>) => boolean,
  field: string,
): string[] {
  return songs
    .map((s) => s as Record<string, unknown>)
    .filter((s) => !predicate(s))
    .map((s) => `${String(s.id)}: ${JSON.stringify(s[field])}`);
}

describe("songs.json のスキーマ", () => {
  it("空でない配列である", () => {
    expect(Array.isArray(songs)).toBe(true);
    expect(songs.length).toBeGreaterThan(0);
  });

  // 定義済みフィールドの一覧。songs.mjs の FIELD_ORDER と対で維持する。
  const FIELDS = [
      "id",
      "title",
      "artist",
      "lyricist",
      "composer",
      "bpm",
      "mastery",
      "youtubeId",
      "jasracCode",
      "nextoneCode",
      "workCodeNotFound",
      "tags",
      "memo",
  ];

  it("全曲が必須フィールドを持つ", () => {
    const missing = songs
      .map((s) => s as Record<string, unknown>)
      .flatMap((s) =>
        FIELDS.filter((k) => !(k in s)).map((k) => `${String(s.id)}: ${k} が無い`),
      );
    expect(missing).toEqual([]);
  });

  // 余剰フィールドも弾く。必須の有無だけ見ていると、廃止したフィールド
  // (#143 の key / lastPlayedAt)が復活しても気付けず、フィールド名の打ち間違いも
  // 「別のフィールドが増えた」だけになって素通りしてしまう。
  it("定義済みフィールド以外を持たない", () => {
    const extra = songs
      .map((s) => s as Record<string, unknown>)
      .flatMap((s) =>
        Object.keys(s)
          .filter((k) => !FIELDS.includes(k))
          .map((k) => `${String(s.id)}: ${k} は定義に無い`),
      );
    expect(extra).toEqual([]);
  });

  it("id は英小文字・数字・ハイフンのみ", () => {
    const bad = findViolations(
      (s) => typeof s.id === "string" && ID_RE.test(s.id),
      "id",
    );
    expect(bad).toEqual([]);
  });

  it("id は全曲でユニーク", () => {
    const ids = songs.map((s) => (s as Record<string, unknown>).id);
    const seen = new Set<unknown>();
    const dupes = ids.filter((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    expect(dupes).toEqual([]);
  });

  it("title は空でない文字列", () => {
    const bad = findViolations(
      (s) => typeof s.title === "string" && s.title.trim() !== "",
      "title",
    );
    expect(bad).toEqual([]);
  });

  it("artist / lyricist / composer は文字列 or null", () => {
    for (const field of ["artist", "lyricist", "composer"]) {
      const bad = findViolations(
        (s) => s[field] === null || typeof s[field] === "string",
        field,
      );
      expect(bad, `${field} が不正`).toEqual([]);
    }
  });

  it("bpm は正の整数 or null", () => {
    const bad = findViolations(
      (s) =>
        s.bpm === null ||
        (typeof s.bpm === "number" && Number.isInteger(s.bpm) && s.bpm > 0),
      "bpm",
    );
    expect(bad).toEqual([]);
  });

  it("mastery は ready / practicing / wishlist のいずれか", () => {
    const bad = findViolations(
      (s) => typeof s.mastery === "string" && MASTERIES.includes(s.mastery),
      "mastery",
    );
    expect(bad).toEqual([]);
  });

  it("youtubeId は11文字の動画ID or null", () => {
    const bad = findViolations(
      (s) =>
        s.youtubeId === null ||
        (typeof s.youtubeId === "string" && YOUTUBE_ID_RE.test(s.youtubeId)),
      "youtubeId",
    );
    expect(bad).toEqual([]);
  });

  it("jasracCode は 123-4567-8 形式 or null", () => {
    const bad = findViolations(
      (s) =>
        s.jasracCode === null ||
        (typeof s.jasracCode === "string" &&
          JASRAC_CODE_PATTERN.test(s.jasracCode)),
      "jasracCode",
    );
    expect(bad).toEqual([]);
  });

  it("nextoneCode は N + 数字8桁 or null", () => {
    const bad = findViolations(
      (s) =>
        s.nextoneCode === null ||
        (typeof s.nextoneCode === "string" &&
          NEXTONE_CODE_PATTERN.test(s.nextoneCode)),
      "nextoneCode",
    );
    expect(bad).toEqual([]);
  });

  // 同じ作品が JASRAC と NexTone の両方に載っていること自体はよくある(支分権ごとに
  // 管理団体が分かれるため)。この曲プールでは「配信を管理している方」の作品コードを
  // 1つだけ持つ運用なので、両方入っていたら選び損ねか取り違えとして気付けるようにする。
  it("jasracCode と nextoneCode が同時に埋まっていない", () => {
    const bad = songs
      .map((s) => s as Record<string, unknown>)
      .filter((s) => s.jasracCode !== null && s.nextoneCode !== null)
      .map((s) => `${String(s.id)}: ${String(s.jasracCode)} / ${String(s.nextoneCode)}`);
    expect(bad).toEqual([]);
  });

  it("workCodeNotFound は真偽値", () => {
    const bad = findViolations(
      (s) => typeof s.workCodeNotFound === "boolean",
      "workCodeNotFound",
    );
    expect(bad).toEqual([]);
  });

  // workCodeNotFound は「両DBを調べたが無かった」の印。コードが取れているのに
  // 立っていたら意味が矛盾するので弾く。
  it("workCodeNotFound が true の曲は作品コードを持たない", () => {
    const bad = songs
      .map((s) => s as Record<string, unknown>)
      .filter(
        (s) =>
          s.workCodeNotFound === true &&
          (s.jasracCode !== null || s.nextoneCode !== null),
      )
      .map(
        (s) =>
          `${String(s.id)}: ${String(s.jasracCode)} / ${String(s.nextoneCode)}`,
      );
    expect(bad).toEqual([]);
  });

  it("tags は文字列の配列", () => {
    const bad = findViolations(
      (s) =>
        Array.isArray(s.tags) && s.tags.every((t) => typeof t === "string"),
      "tags",
    );
    expect(bad).toEqual([]);
  });

  it("memo は文字列", () => {
    const bad = findViolations((s) => typeof s.memo === "string", "memo");
    expect(bad).toEqual([]);
  });
});
