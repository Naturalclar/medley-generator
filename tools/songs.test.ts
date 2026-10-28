import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import songs from "../src/data/songs.json";

const URL = "https://utaten.com/lyric/ab123456/";
// 「utatenUrl キーが無い曲」の見本。実データの songs[1] に URL が登録されても
// 前提が崩れないよう、キーを取り除いて作る(#270)。
const { utatenUrl: _utatenUrl, ...songWithoutUrl } = songs[1];

it("曲編集ヘルパーが登録済み URL と省略状態を保持する", () => {
  const dir = mkdtempSync(join(tmpdir(), "utaten-test-"));
  const file = join(dir, "songs.json");
  const input = [{ ...songs[0], utatenUrl: URL }, songWithoutUrl];
  try {
    writeFileSync(file, JSON.stringify(input));
    execFileSync(process.execPath, [
      ".claude/skills/manage-songs/scripts/songs.mjs", "edit", songs[0].id,
      "--memo", "test", "--file", file,
    ]);
    const output = JSON.parse(readFileSync(file, "utf8"));
    expect(output[0]).toEqual({ ...input[0], memo: "test" });
    expect(output[1]).toEqual(input[1]);
    expect(output[1]).not.toHaveProperty("utatenUrl");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
