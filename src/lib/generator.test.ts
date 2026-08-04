import { describe, expect, it } from "vitest";
import {
  arrangeBpmArc,
  formatSetlistText,
  generateSetlist,
  selectionWeight,
} from "./generator";
import type { Mastery, Song } from "./types";

/** テスト用の Song を最小指定で作るヘルパー。未指定は素直な既定値。 */
function song(partial: Partial<Song> & { id: string }): Song {
  return {
    title: partial.id,
    artist: null,
    key: null,
    bpm: null,
    mastery: "ready",
    lastPlayedAt: null,
    tags: [],
    memo: "",
    ...partial,
  };
}

/** 常に 0 を返す乱数。weightedSample は「先頭の候補から順に」選ぶので選出が決定的になる。 */
const pickInOrder = () => 0;

function countByMastery(setlist: Song[], mastery: Mastery): number {
  return setlist.filter((s) => s.mastery === mastery).length;
}

describe("selectionWeight", () => {
  const now = new Date("2026-08-10T00:00:00Z");

  it("未演奏(lastPlayedAt=null)は重み1", () => {
    expect(selectionWeight(song({ id: "a", lastPlayedAt: null }), now)).toBe(1);
  });

  it("クールダウン(7日)以上前なら重み1", () => {
    // ちょうど7日前
    expect(
      selectionWeight(song({ id: "a", lastPlayedAt: "2026-08-03" }), now),
    ).toBe(1);
    // 10日前
    expect(
      selectionWeight(song({ id: "a", lastPlayedAt: "2026-07-31" }), now),
    ).toBe(1);
  });

  it("直近ほど重みが下がり、当日は下限0.05", () => {
    // 当日 → days=0 → max(0.05, 0)
    expect(
      selectionWeight(song({ id: "a", lastPlayedAt: "2026-08-10" }), now),
    ).toBe(0.05);
    // 3日前 → 3/7
    expect(
      selectionWeight(song({ id: "a", lastPlayedAt: "2026-08-07" }), now),
    ).toBeCloseTo(3 / 7, 10);
    // 1日前 → 1/7
    expect(
      selectionWeight(song({ id: "a", lastPlayedAt: "2026-08-09" }), now),
    ).toBeCloseTo(1 / 7, 10);
  });

  it("不正な日付文字列は重み1(未演奏扱い)", () => {
    expect(
      selectionWeight(song({ id: "a", lastPlayedAt: "not-a-date" }), now),
    ).toBe(1);
  });
});

describe("arrangeBpmArc", () => {
  it("緩→急→緩の山型に並べる(ピークが中央付近)", () => {
    const input = [130, 100, 140, 110, 120].map((bpm) =>
      song({ id: `s${bpm}`, bpm }),
    );
    const bpms = arrangeBpmArc(input).map((s) => s.bpm);
    // sorted昇順を前後交互に振り分け、最速を中央側へ
    expect(bpms).toEqual([100, 120, 140, 130, 110]);
  });

  it("BPM不明(null)は既知の中央値として扱い、曲は落とさない", () => {
    const input = [
      song({ id: "known-100", bpm: 100 }),
      song({ id: "unknown", bpm: null }),
      song({ id: "known-140", bpm: 140 }),
    ];
    const out = arrangeBpmArc(input);
    // 入力と同じ集合が返る(欠落・重複なし)
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.id).sort()).toEqual([
      "known-100",
      "known-140",
      "unknown",
    ]);
  });

  it("元の配列を破壊しない", () => {
    const input = [song({ id: "a", bpm: 120 }), song({ id: "b", bpm: 100 })];
    const before = input.map((s) => s.id);
    arrangeBpmArc(input);
    expect(input.map((s) => s.id)).toEqual(before);
  });
});

describe("generateSetlist", () => {
  const now = new Date("2026-08-10T00:00:00Z");

  it("練習中(practicing)は最大1曲だけ混ざる", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "r2", mastery: "ready", bpm: 110 }),
      song({ id: "r3", mastery: "ready", bpm: 120 }),
      song({ id: "p1", mastery: "practicing", bpm: 130 }),
      song({ id: "p2", mastery: "practicing", bpm: 140 }),
      song({ id: "p3", mastery: "practicing", bpm: 150 }),
    ];
    const result = generateSetlist(pool, {
      count: 4,
      includeWishlist: false,
      now,
      random: pickInOrder,
    });
    expect(result).toHaveLength(4);
    expect(countByMastery(result, "practicing")).toBe(1);
  });

  it("includeWishlist=false なら wishlist は選ばれない", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "w1", mastery: "wishlist", bpm: 110 }),
      song({ id: "w2", mastery: "wishlist", bpm: 120 }),
    ];
    const result = generateSetlist(pool, {
      count: 3,
      includeWishlist: false,
      now,
      random: pickInOrder,
    });
    expect(countByMastery(result, "wishlist")).toBe(0);
  });

  it("includeWishlist=true なら wishlist を挑戦枠として含めうる", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "w1", mastery: "wishlist", bpm: 110 }),
      song({ id: "w2", mastery: "wishlist", bpm: 120 }),
      song({ id: "w3", mastery: "wishlist", bpm: 130 }),
    ];
    const result = generateSetlist(pool, {
      count: 3,
      includeWishlist: true,
      now,
      random: pickInOrder,
    });
    expect(result).toHaveLength(3);
    expect(countByMastery(result, "wishlist")).toBeGreaterThan(0);
  });

  it("同じ曲を重複して選ばない", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "r2", mastery: "ready", bpm: 110 }),
      song({ id: "p1", mastery: "practicing", bpm: 120 }),
    ];
    const result = generateSetlist(pool, {
      count: 3,
      includeWishlist: false,
      now,
      random: pickInOrder,
    });
    const ids = result.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("要求数がプール数を超えたら、あるだけ返す", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "r2", mastery: "ready", bpm: 110 }),
    ];
    const result = generateSetlist(pool, {
      count: 5,
      includeWishlist: false,
      now,
      random: pickInOrder,
    });
    expect(result).toHaveLength(2);
  });

  it("空プールなら空配列", () => {
    expect(
      generateSetlist([], { count: 4, includeWishlist: false, now }),
    ).toEqual([]);
  });

  it("同じ乱数・時刻なら結果は決定的", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "r2", mastery: "ready", bpm: 110 }),
      song({ id: "r3", mastery: "ready", bpm: 120 }),
      song({ id: "p1", mastery: "practicing", bpm: 130 }),
    ];
    const opts = {
      count: 3,
      includeWishlist: false,
      now,
      random: pickInOrder,
    };
    const a = generateSetlist(pool, opts).map((s) => s.id);
    const b = generateSetlist(pool, opts).map((s) => s.id);
    expect(a).toEqual(b);
  });

  it("結果は BPM の山型に並ぶ", () => {
    const pool = [130, 100, 140, 110, 120].map((bpm) =>
      song({ id: `s${bpm}`, mastery: "ready", bpm }),
    );
    const result = generateSetlist(pool, {
      count: 5,
      includeWishlist: false,
      now,
      random: pickInOrder,
    });
    expect(result.map((s) => s.bpm)).toEqual([100, 120, 140, 130, 110]);
  });
});

describe("formatSetlistText", () => {
  it("日付ヘッダと連番・アーティスト付き行を生成する", () => {
    const setlist = [
      song({ id: "a", title: "ステラ", artist: "じん" }),
      song({ id: "b", title: "TOXY", artist: null }),
    ];
    const text = formatSetlistText(setlist, new Date(2026, 7, 4));
    expect(text).toBe(
      ["🎹 2026/08/04 メドレーセトリ", "1. ステラ / じん", "2. TOXY"].join("\n"),
    );
  });

  it("月日はゼロ埋めされる", () => {
    const text = formatSetlistText([], new Date(2026, 0, 9));
    expect(text).toBe("🎹 2026/01/09 メドレーセトリ");
  });
});
