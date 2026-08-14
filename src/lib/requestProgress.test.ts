import { describe, expect, it } from "vitest";
import {
  isRequested,
  pruneProgress,
  requestedCount,
  toDateKey,
  toggleRequested,
  type RequestProgress,
} from "./requestProgress";

describe("toDateKey", () => {
  it("ローカル時刻の YYYY-MM-DD にする", () => {
    expect(toDateKey(new Date(2026, 7, 14))).toBe("2026-08-14");
  });

  it("月日を0埋めする", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("isRequested / toggleRequested", () => {
  it("未申請の曲を申請済みにできる", () => {
    const next = toggleRequested({}, "2026-08-14", "a");
    expect(isRequested(next, "2026-08-14", "a")).toBe(true);
  });

  it("もう一度呼ぶと未申請に戻る", () => {
    const on = toggleRequested({}, "2026-08-14", "a");
    const off = toggleRequested(on, "2026-08-14", "a");
    expect(isRequested(off, "2026-08-14", "a")).toBe(false);
  });

  it("元のオブジェクトを書き換えない", () => {
    const before: RequestProgress = { "2026-08-14": ["a"] };
    toggleRequested(before, "2026-08-14", "b");
    expect(before).toEqual({ "2026-08-14": ["a"] });
  });

  // 申請は配信ごとなので、日付が違えば別勘定になる。
  it("日付が違えば別々に記録される", () => {
    let p = toggleRequested({}, "2026-08-14", "a");
    p = toggleRequested(p, "2026-08-15", "a");
    expect(isRequested(p, "2026-08-14", "a")).toBe(true);
    expect(isRequested(p, "2026-08-15", "a")).toBe(true);

    p = toggleRequested(p, "2026-08-14", "a");
    expect(isRequested(p, "2026-08-14", "a")).toBe(false);
    expect(isRequested(p, "2026-08-15", "a")).toBe(true);
  });

  it("全部外した日付は残さない", () => {
    const on = toggleRequested({}, "2026-08-14", "a");
    const off = toggleRequested(on, "2026-08-14", "a");
    expect(Object.keys(off)).toEqual([]);
  });
});

describe("requestedCount", () => {
  it("渡した曲のうち申請済みの数を返す", () => {
    const p: RequestProgress = { "2026-08-14": ["a", "c"] };
    expect(requestedCount(p, "2026-08-14", ["a", "b", "c"])).toBe(2);
  });

  it("記録が無い日付は0", () => {
    expect(requestedCount({}, "2026-08-14", ["a"])).toBe(0);
  });

  // セトリから外れた曲の記録が残っていても、今のセトリの曲数は超えない。
  it("セトリに無い曲は数えない", () => {
    const p: RequestProgress = { "2026-08-14": ["a", "x", "y"] };
    expect(requestedCount(p, "2026-08-14", ["a", "b"])).toBe(1);
  });
});

describe("pruneProgress", () => {
  it("新しい日付から keep 件だけ残す", () => {
    const p: RequestProgress = {
      "2026-08-12": ["a"],
      "2026-08-14": ["b"],
      "2026-08-13": ["c"],
    };
    expect(pruneProgress(p, 2)).toEqual({
      "2026-08-14": ["b"],
      "2026-08-13": ["c"],
    });
  });

  it("件数が上限以下ならそのまま", () => {
    const p: RequestProgress = { "2026-08-14": ["a"] };
    expect(pruneProgress(p, 30)).toEqual(p);
  });
});
