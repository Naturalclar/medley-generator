import { describe, expect, it } from "vitest";
import {
  buildYoutubePlaylistUrl,
  countPlayableOnYoutube,
  formatSetlistText,
  generateSetlist,
  isChallenge,
  maxSetlistSize,
  requestableSongs,
  unplayableOnYoutube,
  unrequestableSongs,
  workCodeOf,
  workCodeStatusOf,
  workSocietyOf,
  youtubeStatusOf,
} from "./generator";
import type { Mastery, Song } from "./types";

/** テスト用の Song を最小指定で作るヘルパー。未指定は素直な既定値。 */
function song(partial: Partial<Song> & { id: string }): Song {
  return {
    title: partial.id,
    artist: null,
    lyricist: null,
    composer: null,
    key: null,
    bpm: null,
    mastery: "ready",
    lastPlayedAt: null,
    youtubeId: null,
    jasracCode: null,
    nextoneCode: null,
    workCodeNotFound: false,
    tags: [],
    memo: "",
    ...partial,
  };
}

/** 常に 0 を返す乱数。sample は index 0 を選び続けるので選出が「先頭から順」で決定的になる。 */
const pickInOrder = () => 0;

function countByMastery(setlist: Song[], mastery: Mastery): number {
  return setlist.filter((s) => s.mastery === mastery).length;
}

describe("generateSetlist", () => {

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
      random: pickInOrder,
    });
    expect(result).toHaveLength(2);
  });

  it("空プールなら空配列", () => {
    expect(
      generateSetlist([], { count: 4, includeWishlist: false }),
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
      random: pickInOrder,
    };
    const a = generateSetlist(pool, opts).map((s) => s.id);
    const b = generateSetlist(pool, opts).map((s) => s.id);
    expect(a).toEqual(b);
  });

  // #142: BPMの山型並べ替えは廃止。並び順は選出順のまま返す。
  it("並び替えず、選出した順で返す", () => {
    const pool = [130, 100, 140, 110, 120].map((bpm) =>
      song({ id: `s${bpm}`, mastery: "ready", bpm }),
    );
    const result = generateSetlist(pool, {
      count: 5,
      includeWishlist: false,
      random: pickInOrder,
    });
    // pickInOrder は常に先頭を取るので、選出順 = プールの順
    expect(result.map((s) => s.bpm)).toEqual([130, 100, 140, 110, 120]);
  });

  it("1曲だけのセトリで ready があるときは本命(ready)を選ぶ", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "p1", mastery: "practicing", bpm: 110 }),
    ];
    const result = generateSetlist(pool, {
      count: 1,
      includeWishlist: false,
      random: pickInOrder,
    });
    expect(result).toHaveLength(1);
    expect(result[0].mastery).toBe("ready");
  });

  it("練習中しか無いプールでも count=1 で1曲返す(以前は0曲だった)", () => {
    const pool = [song({ id: "p1", mastery: "practicing", bpm: 110 })];
    const result = generateSetlist(pool, {
      count: 1,
      includeWishlist: false,
      random: pickInOrder,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });

  it("要求数が上限を超えても maxSetlistSize ちょうどを返す", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "r2", mastery: "ready", bpm: 110 }),
      song({ id: "p1", mastery: "practicing", bpm: 120 }),
      song({ id: "p2", mastery: "practicing", bpm: 130 }),
      song({ id: "w1", mastery: "wishlist", bpm: 140 }),
    ];
    // ready2 + wishlist1 + 練習中スロット1 = 4
    const max = maxSetlistSize(pool, true);
    expect(max).toBe(4);
    const result = generateSetlist(pool, {
      count: 100,
      includeWishlist: true,
      random: pickInOrder,
    });
    expect(result).toHaveLength(max);
  });

  describe("wishlistOnly", () => {
    const pool = [
      song({ id: "r1", mastery: "ready", bpm: 100 }),
      song({ id: "r2", mastery: "ready", bpm: 105 }),
      song({ id: "p1", mastery: "practicing", bpm: 110 }),
      song({ id: "w1", mastery: "wishlist", bpm: 120 }),
      song({ id: "w2", mastery: "wishlist", bpm: 130 }),
      song({ id: "w3", mastery: "wishlist", bpm: 140 }),
    ];

    it("覚えたい曲だけを返す", () => {
      const result = generateSetlist(pool, {
        count: 3,
        includeWishlist: true,
        wishlistOnly: true,
        random: pickInOrder,
      });
      expect(result).toHaveLength(3);
      expect(countByMastery(result, "wishlist")).toBe(3);
    });

    it("練習中を1枠混ぜるルールより絞り込みが優先される", () => {
      // 通常なら count>1 で練習中が1曲入るが、wishlistOnly では入らない
      const result = generateSetlist(pool, {
        count: 3,
        includeWishlist: false,
        wishlistOnly: true,
        random: pickInOrder,
      });
      expect(countByMastery(result, "practicing")).toBe(0);
      expect(countByMastery(result, "ready")).toBe(0);
    });

    it("includeWishlist=false でも覚えたい曲が選ばれる(絞り込みが勝つ)", () => {
      const result = generateSetlist(pool, {
        count: 2,
        includeWishlist: false,
        wishlistOnly: true,
        random: pickInOrder,
      });
      expect(result.map((s) => s.mastery)).toEqual(["wishlist", "wishlist"]);
    });

    it("要求数が覚えたい曲数を超えても在庫ぶんだけ返す", () => {
      const result = generateSetlist(pool, {
        count: 100,
        includeWishlist: true,
        wishlistOnly: true,
        random: pickInOrder,
      });
      expect(result).toHaveLength(3);
    });

    it("覚えたい曲が無ければ空になる", () => {
      const noWishlist = [
        song({ id: "r1", mastery: "ready" }),
        song({ id: "p1", mastery: "practicing" }),
      ];
      const result = generateSetlist(noWishlist, {
        count: 3,
        includeWishlist: true,
        wishlistOnly: true,
        random: pickInOrder,
      });
      expect(result).toEqual([]);
    });
  });
});

describe("maxSetlistSize", () => {
  const pool = [
    song({ id: "r1", mastery: "ready" }),
    song({ id: "r2", mastery: "ready" }),
    song({ id: "p1", mastery: "practicing" }),
    song({ id: "w1", mastery: "wishlist" }),
    song({ id: "w2", mastery: "wishlist" }),
    song({ id: "w3", mastery: "wishlist" }),
  ];

  it("includeWishlist=true は ready + wishlist + 練習中スロット", () => {
    // 2 + 3 + 1
    expect(maxSetlistSize(pool, true)).toBe(6);
  });

  it("includeWishlist=false は wishlist を除外", () => {
    // 2 + 0 + 1
    expect(maxSetlistSize(pool, false)).toBe(3);
  });

  it("練習中が無ければスロット分は増えない", () => {
    const noPracticing = [
      song({ id: "r1", mastery: "ready" }),
      song({ id: "w1", mastery: "wishlist" }),
    ];
    expect(maxSetlistSize(noPracticing, true)).toBe(2);
    expect(maxSetlistSize(noPracticing, false)).toBe(1);
  });

  it("空プールは0", () => {
    expect(maxSetlistSize([], true)).toBe(0);
  });

  it("wishlistOnly は覚えたい曲数そのもの(includeWishlist を見ない)", () => {
    expect(maxSetlistSize(pool, true, true)).toBe(3);
    expect(maxSetlistSize(pool, false, true)).toBe(3);
  });

  it("wishlistOnly で覚えたい曲が無ければ0", () => {
    const noWishlist = [
      song({ id: "r1", mastery: "ready" }),
      song({ id: "p1", mastery: "practicing" }),
    ];
    expect(maxSetlistSize(noWishlist, true, true)).toBe(0);
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

  it("markChallenge で挑戦枠(ready以外)にだけ🔰が付く", () => {
    const setlist = [
      song({ id: "a", title: "本命", mastery: "ready" }),
      song({ id: "b", title: "練習曲", mastery: "practicing" }),
      song({ id: "c", title: "挑戦曲", mastery: "wishlist" }),
    ];
    const text = formatSetlistText(setlist, new Date(2026, 7, 4), {
      markChallenge: true,
    });
    expect(text).toBe(
      [
        "🎹 2026/08/04 メドレーセトリ",
        "1. 本命",
        "2. 🔰 練習曲",
        "3. 🔰 挑戦曲",
      ].join("\n"),
    );
  });

  it("markChallenge 無指定なら🔰は付かない(後方互換)", () => {
    const setlist = [song({ id: "b", title: "練習曲", mastery: "practicing" })];
    const text = formatSetlistText(setlist, new Date(2026, 7, 4));
    expect(text).toBe(["🎹 2026/08/04 メドレーセトリ", "1. 練習曲"].join("\n"));
  });
});

describe("isChallenge", () => {
  it("ready は挑戦枠でない", () => {
    expect(isChallenge(song({ id: "a", mastery: "ready" }))).toBe(false);
  });
  it("practicing / wishlist は挑戦枠", () => {
    expect(isChallenge(song({ id: "b", mastery: "practicing" }))).toBe(true);
    expect(isChallenge(song({ id: "c", mastery: "wishlist" }))).toBe(true);
  });
});

describe("buildYoutubePlaylistUrl", () => {
  it("youtubeId を並び順どおりに繋いだURLを作る", () => {
    const setlist = [
      song({ id: "a", youtubeId: "aaaaaaaaaaa" }),
      song({ id: "b", youtubeId: "bbbbbbbbbbb" }),
      song({ id: "c", youtubeId: "ccccccccccc" }),
    ];
    expect(buildYoutubePlaylistUrl(setlist)).toBe(
      "https://www.youtube.com/watch_videos?video_ids=aaaaaaaaaaa,bbbbbbbbbbb,ccccccccccc",
    );
  });

  it("youtubeId が無い曲は飛ばす", () => {
    const setlist = [
      song({ id: "a", youtubeId: "aaaaaaaaaaa" }),
      song({ id: "no-id", youtubeId: null }),
      song({ id: "b", youtubeId: "bbbbbbbbbbb" }),
    ];
    expect(buildYoutubePlaylistUrl(setlist)).toBe(
      "https://www.youtube.com/watch_videos?video_ids=aaaaaaaaaaa,bbbbbbbbbbb",
    );
  });

  it("1曲も youtubeId が無ければ null", () => {
    expect(buildYoutubePlaylistUrl([song({ id: "a", youtubeId: null })])).toBe(
      null,
    );
    expect(buildYoutubePlaylistUrl([])).toBe(null);
  });

  it("50曲を超える分は切り捨てる(watch_videos の上限)", () => {
    const setlist = Array.from({ length: 60 }, (_, i) =>
      song({ id: `s${i}`, youtubeId: `id${String(i).padStart(9, "0")}` }),
    );
    const url = buildYoutubePlaylistUrl(setlist);
    const ids = url!.split("video_ids=")[1].split(",");
    expect(ids).toHaveLength(50);
  });
});

describe("countPlayableOnYoutube", () => {
  it("youtubeId が設定済みの曲数を数える", () => {
    const setlist = [
      song({ id: "a", youtubeId: "aaaaaaaaaaa" }),
      song({ id: "b", youtubeId: null }),
      song({ id: "c", youtubeId: "ccccccccccc" }),
    ];
    expect(countPlayableOnYoutube(setlist)).toBe(2);
    expect(countPlayableOnYoutube([])).toBe(0);
  });
});

describe("youtubeStatusOf", () => {
  it("youtubeId の有無を返す", () => {
    expect(youtubeStatusOf(song({ id: "a", youtubeId: "aaaaaaaaaaa" }))).toBe(
      "has-video",
    );
    expect(youtubeStatusOf(song({ id: "b", youtubeId: null }))).toBe(
      "no-video",
    );
  });

  // 一覧のチップは「動画あり」「動画なし」の2つで全曲を覆う。片方に寄る曲が
  // 出ると、両方OFFにしても曲が残る/両方ONでも消えるといった食い違いになる。
  it("2つの状態で全曲を漏れなく分類する", () => {
    const songs = [
      song({ id: "a", youtubeId: "aaaaaaaaaaa" }),
      song({ id: "b", youtubeId: null }),
      song({ id: "c", youtubeId: "ccccccccccc" }),
    ];
    const has = songs.filter((s) => youtubeStatusOf(s) === "has-video");
    const no = songs.filter((s) => youtubeStatusOf(s) === "no-video");
    expect(has.length + no.length).toBe(songs.length);
  });
});

describe("unplayableOnYoutube", () => {
  it("youtubeId が無い曲をセトリの並び順で返す", () => {
    const setlist = [
      song({ id: "a", youtubeId: "aaaaaaaaaaa" }),
      song({ id: "b", youtubeId: null }),
      song({ id: "c", youtubeId: "ccccccccccc" }),
      song({ id: "d", youtubeId: null }),
    ];
    expect(unplayableOnYoutube(setlist).map((s) => s.id)).toEqual(["b", "d"]);
  });

  it("全曲に youtubeId があれば空", () => {
    const setlist = [
      song({ id: "a", youtubeId: "aaaaaaaaaaa" }),
      song({ id: "b", youtubeId: "bbbbbbbbbbb" }),
    ];
    expect(unplayableOnYoutube(setlist)).toEqual([]);
    expect(unplayableOnYoutube([])).toEqual([]);
  });

  // 落ちた曲数がボタンの「(N曲)」表示と食い違わないこと。UIはこの2つを
  // 別々に出すので、合計がセトリ全体に一致しないと数字が噛み合わなくなる。
  it("再生できる曲数と足すとセトリの曲数になる", () => {
    const setlist = [
      song({ id: "a", youtubeId: "aaaaaaaaaaa" }),
      song({ id: "b", youtubeId: null }),
      song({ id: "c", youtubeId: null }),
    ];
    expect(
      countPlayableOnYoutube(setlist) + unplayableOnYoutube(setlist).length,
    ).toBe(setlist.length);
  });
});

describe("workCodeOf", () => {
  it("JASRAC / NexTone のうち入っている方を返す", () => {
    expect(workCodeOf(song({ id: "a", jasracCode: "052-2119-3" }))).toBe(
      "052-2119-3",
    );
    expect(workCodeOf(song({ id: "b", nextoneCode: "N12345678" }))).toBe(
      "N12345678",
    );
  });

  it("どちらも無ければ null", () => {
    expect(workCodeOf(song({ id: "c" }))).toBe(null);
  });
});

describe("workSocietyOf", () => {
  it("コードが入っている側の団体を返す", () => {
    expect(workSocietyOf(song({ id: "a", jasracCode: "052-2119-3" }))).toBe(
      "JASRAC",
    );
    expect(workSocietyOf(song({ id: "b", nextoneCode: "N12345678" }))).toBe(
      "NexTone",
    );
  });

  it("どちらも無ければ null", () => {
    expect(workSocietyOf(song({ id: "c" }))).toBe(null);
    expect(
      workSocietyOf(song({ id: "d", workCodeNotFound: true })),
    ).toBe(null);
  });
});

describe("workCodeStatusOf", () => {
  it("コードがあれば requestable", () => {
    expect(workCodeStatusOf(song({ id: "a", jasracCode: "052-2119-3" }))).toBe(
      "requestable",
    );
    expect(workCodeStatusOf(song({ id: "b", nextoneCode: "N12345678" }))).toBe(
      "requestable",
    );
  });

  // コードが無い曲は、調査済みかどうかで次にやることが変わる。
  it("コードが無ければ workCodeNotFound で未調査と登録なしを分ける", () => {
    expect(workCodeStatusOf(song({ id: "c" }))).toBe("unchecked");
    expect(
      workCodeStatusOf(song({ id: "d", workCodeNotFound: true })),
    ).toBe("not-found");
  });
});

describe("requestableSongs", () => {
  it("作品コードを持つ曲だけをセトリの並び順で、管理団体付きで返す", () => {
    const setlist = [
      song({ id: "a", jasracCode: "052-2119-3" }),
      song({ id: "b" }), // コード未登録なので申請できない
      song({ id: "c", nextoneCode: "N12345678" }),
    ];
    expect(requestableSongs(setlist)).toEqual([
      { song: setlist[0], code: "052-2119-3", society: "JASRAC" },
      { song: setlist[2], code: "N12345678", society: "NexTone" },
    ]);
  });

  it("1曲もコードが無ければ空", () => {
    expect(requestableSongs([song({ id: "a" })])).toEqual([]);
    expect(requestableSongs([])).toEqual([]);
  });
});

describe("unrequestableSongs", () => {
  it("申請できない曲を理由付きでセトリの並び順で返す", () => {
    const setlist = [
      song({ id: "a", jasracCode: "052-2119-3" }),
      song({ id: "b" }),
      song({ id: "c", workCodeNotFound: true }),
    ];
    expect(unrequestableSongs(setlist)).toEqual([
      { song: setlist[1], status: "unchecked" },
      { song: setlist[2], status: "not-found" },
    ]);
  });

  it("全曲にコードがあれば空", () => {
    expect(
      unrequestableSongs([song({ id: "a", jasracCode: "052-2119-3" })]),
    ).toEqual([]);
    expect(unrequestableSongs([])).toEqual([]);
  });

  // requestable と unrequestable は互いに排他で、合わせるとセトリ全体になる。
  it("requestableSongs と合わせるとセトリの全曲になる", () => {
    const setlist = [
      song({ id: "a", jasracCode: "052-2119-3" }),
      song({ id: "b" }),
      song({ id: "c", workCodeNotFound: true }),
      song({ id: "d", nextoneCode: "N12345678" }),
    ];
    expect(
      requestableSongs(setlist).length + unrequestableSongs(setlist).length,
    ).toBe(setlist.length);
  });
});
