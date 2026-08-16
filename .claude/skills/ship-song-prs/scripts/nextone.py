#!/usr/bin/env python3
"""NexTone 作品検索データベースをタイトルで引く。"""
import re
import sys
import time
import urllib.parse
import urllib.request
import http.cookiejar

BASE = "https://search.nex-tone.co.jp/"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", UA)]

state = {"list_url": None, "form_action": None}


def absurl(base, href):
    return urllib.parse.urljoin(base, href)


def start():
    r = opener.open(BASE, timeout=30)
    html = r.read().decode("utf-8", errors="replace")
    action = re.search(r'<form id="id1"[^>]*action="([^"]+)"', html).group(1)
    url = absurl(r.geturl(), action.replace("&amp;", "&"))
    r2 = opener.open(url, data=b"id1_hf_0=&accept=1", timeout=30)
    html2 = r2.read().decode("utf-8", errors="replace")
    state["list_url"] = r2.geturl()
    state["form_action"] = absurl(
        r2.geturl(),
        re.search(r'<form id="id3"[^>]*action="([^"]+)"', html2)
        .group(1)
        .replace("&amp;", "&"),
    )


def search(title, artist=None, match="partial"):
    p = "detail-condition-container:"
    fields = [
        ("id3_hf_0", ""),
        ("freeWord", ""),
        (p + "conditionPieceCd", ""),
        (p + "conditionTitle1", title),
        (p + "excludeSubtitle1", "include"),
        (p + "titleMatchCondition1", match),
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
        (p + "conditionArtistName1", artist or ""),
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
    r = opener.open(state["form_action"], data=body, timeout=30)
    return r.read().decode("utf-8", errors="replace")


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def rows(html):
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        tds = [strip(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if not tds:
            continue
        if any(re.fullmatch(r"N?\d{8}", t or "") for t in tds[:2]):
            out.append(tds)
    return out


def main():
    start()
    for q in sys.argv[1:]:
        title, artist = (q.split("|", 1) + [None])[:2] if "|" in q else (q, None)
        html = search(title, artist=artist)
        m = re.search(r"(\d+)\s*件", html)
        print(f"=== {q} (hits={m.group(1) if m else '?'})")
        rs = rows(html)
        if not rs:
            print("  -- no rows --")
        for r in rs[:25]:
            print("  ", " | ".join(r))
        time.sleep(2)


if __name__ == "__main__":
    main()
