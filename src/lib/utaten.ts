/** 登録済みの HTTPS UtaTen 歌詞ページだけをリンクにする。 */
export function utatenLyricsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value || !value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "utaten.com" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/lyric\/[A-Za-z0-9]+\/$/.test(url.pathname) ||
      url.search ||
      url.hash ||
      value !== url.href
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
