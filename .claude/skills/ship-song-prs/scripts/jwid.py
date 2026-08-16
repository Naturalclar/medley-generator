#!/usr/bin/env python3
"""J-WID (JASRAC) 作品検索。タイトルで引いて 作品コード/タイトル/著作者/アーティスト を表示する。"""
import re
import sys
import time
import urllib.parse
import urllib.request
import http.cookiejar

BASE = "https://www2.jasrac.or.jp/eJwid/"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", UA)]


def start():
    opener.open(BASE, timeout=30).read()
    opener.open(BASE + "main?trxID=F00100", data=b"", timeout=30).read()


# 一致条件: 0=前方 1=後方 2=中間 3=完全
FORWARD, BACKWARD, PARTIAL, EXACT = "0", "1", "2", "3"


def search(title, match=FORWARD, artist=None, author=None, limit="50"):
    fields = {
        "IN_WORKS_CD": "",
        "IN_ISWC": "",
        "IN_WORKS_TITLE_NAME1": title,
        "IN_WORKS_TITLE_TYPE1": "0",
        "IN_WORKS_TITLE_OPTION1": match,
        "IN_WORKS_TITLE_CONDITION": "0",
        "IN_WORKS_TITLE_NAME2": "",
        "IN_WORKS_TITLE_TYPE2": "0",
        "IN_WORKS_TITLE_OPTION2": "0",
        "IN_KEN_NAME1": author or "",
        "IN_KEN_NAME_OPTION1": PARTIAL,
        "IN_KEN_NAME_JOB1": "0",
        "IN_KEN_NAME2": "",
        "IN_KEN_NAME_OPTION2": PARTIAL,
        "IN_KEN_NAME_JOB2": "1",
        "IN_KEN_NAME_CONDITION": "0",
        "IN_ARTIST_NAME1": artist or "",
        "IN_ARTIST_NAME_OPTION1": PARTIAL,
        "IN_ARTIST_NAME2": "",
        "IN_ARTIST_NAME_OPTION2": "0",
        "IN_ARTIST_NAME_CONDITION": "0",
        "IN_DEFAULT_SEARCH_WORKS_NAIGAI": "0",
        "IN_DEFAULT_WORKS_KOUHO_MAX": limit,
        "IN_DEFAULT_WORKS_KOUHO_SEQ": "1",
        "RESULT_CURRENT_PAGE": "1",
    }
    parts = []
    for k, v in fields.items():
        parts.append(
            urllib.parse.quote(k)
            + "="
            + urllib.parse.quote(v.encode("shift_jis", errors="replace"))
        )
    body = "&".join(parts).encode("ascii")
    r = opener.open(BASE + "main?trxID=A00401-3", data=body, timeout=30)
    return r.read().decode("shift_jis", errors="replace")


ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
CELL = re.compile(r'<td data-role="result-(\w+)"[^>]*>(.*?)</td>', re.S)


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def rows(html):
    out = []
    for m in ROW.finditer(html):
        cells = {k: strip(v) for k, v in CELL.findall(m.group(1))}
        if "code" not in cells:
            continue
        out.append(
            (
                cells.get("naigai", ""),
                cells.get("code", ""),
                cells.get("title", ""),
                cells.get("author", ""),
                cells.get("artist", ""),
            )
        )
    return out


def main():
    start()
    for q in sys.argv[1:]:
        if "|" in q:
            title, artist = q.split("|", 1)
        else:
            title, artist = q, None
        html = search(title, artist=artist)
        n = re.search(r"検索結果:(\d+)件", html)
        print(f"=== {q}  (hits={n.group(1) if n else '?'})")
        rs = rows(html)
        if not rs:
            print("  -- no rows --")
        for r in rs[:25]:
            print("  ", " | ".join(r))
        time.sleep(2)


if __name__ == "__main__":
    main()
