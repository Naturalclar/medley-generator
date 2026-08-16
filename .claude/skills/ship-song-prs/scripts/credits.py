#!/usr/bin/env python3
"""
J-WID から作詞者・作曲者を取る。

作品コードは songs.json に入っているので、タイトル検索ではなく
作品コード(完全一致)で直接引く。同名異曲を取り違える余地が無い。

作品詳細の「著作者/出版者情報」テーブルは
  <td>No.</td><td>名前</td><td class="center">識別</td>...
という並びで、識別が 作詞 / 作曲 / 出版者 / 訳詞 … になっている。
"""
import json
import pathlib
import re
import sys
import time
import urllib.parse

import jwid

# songs.json はスクリプト位置から解決する(リポジトリのどこから実行しても動くように)。
SONGS_PATH = str(
    pathlib.Path(__file__).resolve().parents[4] / "src" / "data" / "songs.json"
)

DETAIL_LINK = re.compile(r'href="(main\?trxID=F20101&amp;WORKS_CD=([0-9A-Z]+)[^"]*)"')
ROW = re.compile(r"<tr>\s*<td class=\"center\">\d+</td>\s*<td>(.*?)</td>\s*<td class=\"center\">(.*?)</td>", re.S)


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).replace("\xa0", " ").strip()


def search_by_code(code):
    """作品コード完全一致で検索し、詳細ページのHTMLを返す。"""
    fields = {
        "IN_WORKS_CD": code.replace("-", ""),
        "IN_ISWC": "",
        "IN_WORKS_TITLE_NAME1": "",
        "IN_WORKS_TITLE_TYPE1": "0",
        "IN_WORKS_TITLE_OPTION1": "0",
        "IN_WORKS_TITLE_CONDITION": "0",
        "IN_WORKS_TITLE_NAME2": "",
        "IN_WORKS_TITLE_TYPE2": "0",
        "IN_WORKS_TITLE_OPTION2": "0",
        "IN_KEN_NAME1": "",
        "IN_KEN_NAME_OPTION1": "2",
        "IN_KEN_NAME_JOB1": "0",
        "IN_KEN_NAME2": "",
        "IN_KEN_NAME_OPTION2": "2",
        "IN_KEN_NAME_JOB2": "1",
        "IN_KEN_NAME_CONDITION": "0",
        "IN_ARTIST_NAME1": "",
        "IN_ARTIST_NAME_OPTION1": "2",
        "IN_ARTIST_NAME2": "",
        "IN_ARTIST_NAME_OPTION2": "0",
        "IN_ARTIST_NAME_CONDITION": "0",
        "IN_DEFAULT_SEARCH_WORKS_NAIGAI": "0",
        "IN_DEFAULT_WORKS_KOUHO_MAX": "20",
        "IN_DEFAULT_WORKS_KOUHO_SEQ": "1",
        "RESULT_CURRENT_PAGE": "1",
    }
    parts = [
        urllib.parse.quote(k) + "=" + urllib.parse.quote(v.encode("shift_jis", "replace"))
        for k, v in fields.items()
    ]
    r = jwid.opener.open(
        jwid.BASE + "main?trxID=A00401-3", data="&".join(parts).encode("ascii"), timeout=30
    )
    html = r.read().decode("shift_jis", errors="replace")

    flat = code.replace("-", "")
    for href, wcd in DETAIL_LINK.findall(html):
        if wcd == flat:
            url = jwid.BASE + href.replace("&amp;", "&")
            for attempt in range(3):
                try:
                    return jwid.opener.open(url, timeout=30).read().decode(
                        "shift_jis", errors="replace"
                    )
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(3.0 * (attempt + 1))
    return None


def credits_from_detail(html):
    """{識別: [名前...]} と作品タイトルを返す。

    詳細ページは利用分野のタブごとに同じ著作者テーブルを繰り返し持っているので、
    順序を保ったまま重複を落とす。
    """
    out = {}
    for name, role in ROW.findall(html):
        names = out.setdefault(strip(role), [])
        n = strip(name)
        if n not in names:
            names.append(n)
    m = re.search(r'<div class="baseinfo--name">(.*?)</div>', html, re.S)
    return out, (strip(m.group(1)) if m else None)


def split_roles(roles):
    """識別ごとの名前から (作詞者, 作曲者) を組み立てる。

    外国作品は「作曲作詞」のように1つの識別にまとまっていることがあるので、
    その場合は両方に同じ人を入れる。
    """
    lyr = list(roles.get("作詞", []))
    com = list(roles.get("作曲", []))
    for role, names in roles.items():
        if "作詞" in role and "作曲" in role:  # 作曲作詞 / 作詞作曲
            for n in names:
                if n not in lyr:
                    lyr.append(n)
                if n not in com:
                    com.append(n)
    return " / ".join(lyr), " / ".join(com)


def main():
    out_path = None
    ids = []
    for a in sys.argv[1:]:
        if a.startswith("--out="):
            out_path = a[len("--out=") :]
        else:
            ids.append(a)

    songs = {s["id"]: s for s in json.load(open(SONGS_PATH))}
    jwid.start()
    result = {}
    for sid in ids:
        s = songs.get(sid)
        if not s:
            print(f"{sid}\tNOT_IN_JSON", flush=True)
            continue
        code = s.get("jasracCode")
        if not code:
            print(f"{sid}\tNO_JASRAC_CODE\t{s['title']}", flush=True)
            continue
        try:
            html = search_by_code(code)
        except Exception as e:
            print(f"{sid}\tERROR\t{type(e).__name__}: {e}", flush=True)
            time.sleep(3)
            continue
        if not html:
            print(f"{sid}\tDETAIL_NOT_FOUND\t{code}", flush=True)
            time.sleep(1.5)
            continue
        roles, title = credits_from_detail(html)
        lyr, com = split_roles(roles)
        others = {k: v for k, v in roles.items() if "作詞" not in k and "作曲" not in k}
        print(
            f"{sid}\t{s['title']}\t[{title}]\t詞={lyr or '-'}\t曲={com or '-'}"
            + (f"\t他={sorted(others)}" if others else ""),
            flush=True,
        )
        if lyr or com:
            result[sid] = {"lyricist": lyr or None, "composer": com or None}
            if out_path:
                json.dump(result, open(out_path, "w"), ensure_ascii=False, indent=1)
        time.sleep(1.5)


if __name__ == "__main__":
    main()
