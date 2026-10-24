import { describe, expect, it } from "vitest";
import { utatenLyricsUrl } from "./utaten";

const URL = "https://utaten.com/lyric/ab123456/";

describe("UtaTen 歌詞リンク", () => {
  it("登録された歌詞 URL をそのまま返す", () => {
    expect(utatenLyricsUrl(URL)).toBe(URL);
  });

  it.each([
    undefined, null, "", " ", 42, {}, "not a URL",
    "javascript:alert(1)", "data:text/html,test",
    "http://utaten.com/lyric/ab123456/",
    "https://utaten.com.evil.example/lyric/ab123456/",
    "https://evil.example/lyric/ab123456/",
    "https://utaten.com@evil.example/lyric/ab123456/",
    "https://user:password@utaten.com/lyric/ab123456/",
    "https://utaten.com:8443/lyric/ab123456/",
    "//utaten.com/lyric/ab123456/",
    "https://utaten.com/", "https://utaten.com/lyric/",
    `${URL}?redirect=https://evil.example`, `${URL}#fragment`,
    ` ${URL}`, `${URL}\n`, "https://utaten.com/lyric/../other/",
  ])("未登録・不正 URL は非表示: %s", (value) => {
    expect(utatenLyricsUrl(value)).toBeNull();
  });

});
