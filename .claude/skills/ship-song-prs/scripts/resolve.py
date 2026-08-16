#!/usr/bin/env python3
"""
songs.json の曲について J-WID / NexTone を引き、「配信(インタラクティブ配信)」を
管理している団体の作品コードを候補として出す。

配信を基準にするのは、この用途(YouTube等での演奏配信 → avvy申請)で必要な支分権が
配信だから。JASRACとNexToneの両方に作品が載っていても、配信を管理しているのは
通常どちらか一方なので、これで一意に決まる。

出力は判断材料をそのまま並べるだけ。確定は人間が見てからやる。
"""
import json
import pathlib
import re
import sys
import time
import unicodedata

import jwid
import nextone

# songs.json はスクリプト位置から解決する(リポジトリのどこから実行しても動くように)。
SONGS_PATH = str(
    pathlib.Path(__file__).resolve().parents[4] / "src" / "data" / "songs.json"
)

# NexTone 結果表の支分権カラム(leaf)の並び。thead が 2段(複製/演奏 が colspan)なので
# 実セルはこの13列になる。
NEXTONE_SUBRIGHTS = [
    "複製/オーディオ", "複製/ビデオ", "複製/ゲーム", "複製/映画", "複製/広告",
    "配信", "放送", "出版", "貸与", "通カラ",
    "演奏/演奏会催物等", "演奏/上映BGM", "演奏/社交場カラオケ",
]
NEXTONE_HAISHIN = NEXTONE_SUBRIGHTS.index("配信")


def norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower()
    return re.sub(r"[\s　・,，.。!！?？'’\"”“()（）\[\]【】~〜\-−ー_/／&+*＊]", "", s)


def artist_keys(song):
    keys = set()
    for part in re.split(r"[/／、,]", song.get("artist") or ""):
        k = norm(part)
        if len(k) >= 2:
            keys.add(k)
    return keys


# ---------------------------------------------------------------- JASRAC

# 外国作品の作品コードは 0Y4-4243-6 のように英字を含むので \d+ では足りない
DETAIL_LINK = re.compile(r'href="(main\?trxID=F20101&amp;WORKS_CD=([0-9A-Z]+)[^"]*)"')


def dedupe(rows):
    seen, out = set(), []
    for r in rows:
        if r[1] in seen:
            continue
        seen.add(r[1])
        out.append(r)
    return out


def jwid_candidates(song):
    """(候補行, 検索結果HTML, 使った戦略) を返す。"""
    title, keys = song["title"], artist_keys(song)
    artist = song.get("artist") or None

    def filtered(html, need_artist=True):
        t = norm(title)
        out = []
        for row in jwid.rows(html):
            _, code, rtitle, author, rartist = row
            nt = norm(rtitle)
            if nt != t:
                continue
            if need_artist and keys:
                hay = norm(author) + "|" + norm(rartist)
                if not any(k in hay for k in keys):
                    continue
            out.append(row)
        return dedupe(out)

    # 1. タイトル完全一致 + アーティスト部分一致(DB側で絞る)
    if artist:
        html = jwid.search(title, match=jwid.EXACT, artist=artist)
        rows = filtered(html, need_artist=False)
        if rows:
            return rows, html, "title=exact,artist=db"
        time.sleep(1.0)
    # 2. タイトル完全一致のみ + ローカルでアーティスト/著作者照合
    html = jwid.search(title, match=jwid.EXACT)
    rows = filtered(html, need_artist=True)
    if rows:
        return rows, html, "title=exact,artist=local"
    # 3. 照合できない(曲名義がキャラ名など)ときは絞らず全部出して目視
    rows = dedupe(filtered(html, need_artist=False))
    if rows:
        return rows, html, "title=exact,artist=none"
    # 4. 完全一致で1件も出ないケース(「secret base 〜君がくれたもの〜」のように
    #    波ダッシュや括弧の表記がDBと違う)は、頭の部分だけで前方一致検索する
    head = re.split(r"[〜~(（\[]", title)[0].strip()
    if head and head != title:
        time.sleep(1.0)
        html = jwid.search(head, match=jwid.FORWARD, artist=artist)
        rows = dedupe(filtered(html, need_artist=bool(artist)))
        if rows:
            return rows, html, "title=head-forward"
    return [], html, "no-match"


def jwid_rights(html, code):
    """詳細ページから (全体の管理状況, {利用分野: bool}) を返す。

    全支分権をJASRACが持つ作品は利用分野ごとの内訳が出ず、冒頭の一文だけになる。
    一部管理の作品だけ利用分野ごとの記載がある。
    """
    flat = code.replace("-", "")
    url = None
    for href, wcd in DETAIL_LINK.findall(html):
        if wcd == flat:
            url = jwid.BASE + href.replace("&amp;", "&")
            break
    if not url:
        return "?", {}
    for attempt in range(3):
        try:
            d = jwid.opener.open(url, timeout=30).read().decode("shift_jis", errors="replace")
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3.0 * (attempt + 1))
    if "この作品は、JASRACが一部の著作権を管理しています" in d:
        summary = "partial"
    elif "この作品は、JASRACが著作権を管理しています" in d:
        summary = "full"
    elif "この作品は、JASRACでは著作権を管理しておりません" in d:
        summary = "none"
    else:
        summary = "?"
    # 利用分野ごとの内訳。<dt>利用分野</dt><dd><p>この利用分野は、JASRAC...</p>
    rights = {}
    for field, body in re.findall(
        r'<dt class="\w+">([^<]+)</dt>\s*<dd class="txt">\s*<p>(この利用分野は[^<]*)</p>', d
    ):
        rights.setdefault(field.strip(), "管理しています" in body)
    return summary, rights


def jwid_haishin(summary, rights):
    """JASRACが配信を管理しているか。判断できなければ None。"""
    if summary == "full":
        return True
    if summary == "none":
        return False
    if "配信" in rights:
        return rights["配信"]
    return None


# ---------------------------------------------------------------- NexTone


def nextone_candidates(song):
    html = nextone.search(song["title"], match="exact")
    t, keys = norm(song["title"]), artist_keys(song)
    out, loose = [], []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        cd = re.search(r'result-piece-cd-value">([^<]+)<', tr)
        if not cd:
            continue
        vals = [nextone.strip(x) for x in re.findall(r'<td class="piece-table-col">(.*?)</td>', tr, re.S)]
        subs = re.findall(r'<span class="subright subright-(\w+)"', tr)
        title = (vals[0] if vals else "").split("＜副題＞")[0].strip()
        author = vals[1] if len(vals) > 1 else ""
        artist = vals[2] if len(vals) > 2 else ""
        haishin = subs[NEXTONE_HAISHIN] == "manage" if len(subs) == len(NEXTONE_SUBRIGHTS) else None
        if norm(title) != t:
            continue
        row = (cd.group(1), title, author, artist, haishin)
        loose.append(row)
        hay = norm(author) + "|" + norm(artist)
        if not keys or any(k in hay for k in keys):
            out.append(row)
    return (out, "artist-matched") if out else (loose, "artist-unmatched")


# ---------------------------------------------------------------- main


def main():
    songs = {s["id"]: s for s in json.load(open(SONGS_PATH))}
    ids = sys.argv[1:]
    jwid.start()
    nextone.start()
    for sid in ids:
        s = songs.get(sid)
        if not s:
            print(f"\n######## {sid}: NOT IN songs.json")
            continue
        print(f"\n######## {sid} | {s['title']} | {s.get('artist')}")
        try:
            cands, html, how = jwid_candidates(s)
            if not cands:
                print("  [JASRAC] 一致候補なし")
            for row in cands[:8]:
                _, code, title, author, artist = row
                summary, r = jwid_rights(html, code)
                print(f"  [JASRAC:{how}] {code} | {title} | {author} | {artist} "
                      f"| {summary} 配信={jwid_haishin(summary, r)}")
                time.sleep(0.8)
        except Exception as ex:
            print("  [JASRAC] ERROR", type(ex).__name__, ex)
        time.sleep(0.8)
        try:
            nc, how = nextone_candidates(s)
            if not nc:
                print("  [NexTone] 一致候補なし")
            for code, title, author, artist, haishin in nc[:8]:
                print(f"  [NexTone:{how}] {code} | {title} | {author} | {artist} | 配信={haishin}")
        except Exception as ex:
            print("  [NexTone] ERROR", type(ex).__name__, ex)
        time.sleep(0.8)


if __name__ == "__main__":
    main()
