#!/usr/bin/env python3
"""
NexTone から作詞者・作曲者を取る。

songs.json に作品コードが入っているので、作品名ではなく作品コード(完全一致)で
引く。詳細画面の「著作者情報」に役割(作詞/作曲)が出る。
"""
import json
import pathlib
import re
import sys
import time
import urllib.parse

import nextone

# songs.json はスクリプト位置から解決する(リポジトリのどこから実行しても動くように)。
SONGS_PATH = str(
    pathlib.Path(__file__).resolve().parents[4] / "src" / "data" / "songs.json"
)

AUTHOR_ROW = re.compile(
    r'<td class="copyright-info-result-author-name">.*?<a[^>]*>\s*<span>(.*?)</span>.*?'
    r'<td class="copyright-info-result">\s*<div class="copyright-info-result-value">(.*?)</div>',
    re.S,
)


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).replace("\xa0", " ").strip()


def search_by_code(code):
    """作品コード完全一致で検索して、詳細ページのHTMLを返す。"""
    p = "detail-condition-container:"
    fields = [
        ("id3_hf_0", ""),
        ("freeWord", ""),
        (p + "conditionPieceCd", code),
        (p + "conditionTitle1", ""),
        (p + "excludeSubtitle1", "include"),
        (p + "titleMatchCondition1", "partial"),
        (p + "titleBooleanSearchOperator", "and"),
        (p + "conditionTitle2", ""),
        (p + "excludeSubtitle2", "include"),
        (p + "titleMatchCondition2", "partial"),
        (p + "conditionAuthorName1", ""),
        (p + "authorNameMatchCondition1", "partial"),
        (p + "authorNameBooleanSearchOperator", "and"),
        (p + "conditionAuthorName2", ""),
        (p + "authorNameMatchCondition2", "partial"),
        (p + "conditionRightHolderName1", ""),
        (p + "rightHolderNameMatchCondition1", "partial"),
        (p + "rightHolderNameBooleanSearchOperator", "and"),
        (p + "conditionRightHolderName2", ""),
        (p + "rightHolderNameMatchCondition2", "partial"),
        (p + "conditionArtistName1", ""),
        (p + "artistNameMatchCondition1", "partial"),
        (p + "artistNameBooleanSearchOperator", "and"),
        (p + "conditionArtistName2", ""),
        (p + "artistNameMatchCondition2", "partial"),
        ("displayResultCountPerPage", "0"),
        ("sortKey", "piece_cd"),
        ("sortOrder", "asc"),
        ("search", "1"),
    ]
    body = urllib.parse.urlencode(fields).encode("utf-8")
    r = nextone.opener.open(nextone.state["form_action"], data=body, timeout=30)
    html = r.read().decode("utf-8", errors="replace")

    links = re.findall(r'href="(\./list\?[^"]*detailLink[^"]*)"', html)
    if not links:
        return None
    url = urllib.parse.urljoin(r.geturl(), links[0].replace("&amp;", "&"))
    for attempt in range(3):
        try:
            return nextone.opener.open(url, timeout=30).read().decode("utf-8", "replace")
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3.0 * (attempt + 1))


def credits_from_detail(html):
    roles = {}
    for name, role in AUTHOR_ROW.findall(html):
        names = roles.setdefault(strip(role), [])
        n = strip(name)
        if n not in names:
            names.append(n)
    m = re.search(r"作品名.*?<span[^>]*>(.*?)</span>", html, re.S)
    return roles, (strip(m.group(1)) if m else None)


def split_roles(roles):
    lyr = list(roles.get("作詞", []))
    com = list(roles.get("作曲", []))
    for role, names in roles.items():
        if "作詞" in role and "作曲" in role:
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
    nextone.start()
    result = {}
    for sid in ids:
        s = songs.get(sid)
        if not s:
            print(f"{sid}\tNOT_IN_JSON", flush=True)
            continue
        code = s.get("nextoneCode")
        if not code:
            print(f"{sid}\tNO_NEXTONE_CODE\t{s['title']}", flush=True)
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
