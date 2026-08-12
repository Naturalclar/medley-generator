/**
 * YouTube Data API v3 でプレイリストを作る処理。
 *
 * このアプリはバックエンドの無い静的サイトなので、client secret は使えない。
 * Google Identity Services (GIS) のトークンモデル(暗黙的フロー)でアクセス
 * トークンだけを取り、そのままブラウザから API を叩く。
 *
 * トークンはメモリにだけ置く(localStorage 等に保存しない)。ページを離れれば消える。
 */

/** プレイリスト作成に必要なスコープ。動画の追加まで行うので youtube が要る。 */
const SCOPE = "https://www.googleapis.com/auth/youtube";

/** ビルド時に注入されるクライアントID。未設定なら機能自体を出さない。 */
export const YOUTUBE_CLIENT_ID: string | undefined = import.meta.env
  .VITE_YOUTUBE_CLIENT_ID;

export function isYoutubePlaylistEnabled(): boolean {
  return !!YOUTUBE_CLIENT_ID;
}

// --- GIS の型(必要な部分だけ) ---
interface TokenResponse {
  access_token?: string;
  error?: string;
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}
interface GoogleAccountsOauth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
  }) => TokenClient;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleAccountsOauth2 } };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

/** GIS のスクリプトを一度だけ読み込む。 */
function loadGis(): Promise<GoogleAccountsOauth2> {
  const existing = window.google?.accounts?.oauth2;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const done = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new Error("Google Identity Services を読み込めませんでした"));
    };
    const prev = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (prev) {
      prev.addEventListener("load", done, { once: true });
      prev.addEventListener(
        "error",
        () => reject(new Error("Google Identity Services の読み込みに失敗しました")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = () =>
      reject(new Error("Google Identity Services の読み込みに失敗しました"));
    document.head.appendChild(script);
  });
}

/**
 * アクセストークンを取得する(必要ならGoogleのログイン/同意画面が出る)。
 * ユーザー操作(クリック)から呼ばないとポップアップがブロックされる点に注意。
 */
export async function requestAccessToken(): Promise<string> {
  if (!YOUTUBE_CLIENT_ID) {
    throw new Error("YouTube のクライアントIDが設定されていません");
  }
  const oauth2 = await loadGis();
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: YOUTUBE_CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.access_token) resolve(res.access_token);
        else reject(new Error(res.error ?? "認証がキャンセルされました"));
      },
    });
    client.requestAccessToken();
  });
}

async function callApi(
  path: string,
  token: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // クォータ超過は分かりやすい文言にする(1日10,000ユニットの制限)
    if (res.status === 403) {
      throw new Error(
        "YouTube API の1日の利用上限に達したか、権限がありません(明日まで待つと回復します)",
      );
    }
    throw new Error(`YouTube API エラー (${res.status})`);
  }
  return res.json();
}

export interface CreatePlaylistProgress {
  /** 追加が終わった曲数 */
  added: number;
  /** 追加対象の総数 */
  total: number;
}

export interface CreatePlaylistResult {
  playlistId: string;
  url: string;
  added: number;
  failed: number;
}

/**
 * プレイリストを作り、動画を順番に追加する。
 *
 * 途中で失敗した曲があっても中断せず、最後に成功/失敗数を返す
 * (1曲追加できないだけで全部無駄になるのは体験が悪いため)。
 */
export async function createPlaylist(
  token: string,
  title: string,
  videoIds: string[],
  onProgress?: (p: CreatePlaylistProgress) => void,
): Promise<CreatePlaylistResult> {
  const created = await callApi("playlists?part=snippet,status", token, {
    snippet: { title },
    status: { privacyStatus: "unlisted" },
  });
  const playlistId = String(created.id);

  let added = 0;
  let failed = 0;
  for (const videoId of videoIds) {
    try {
      await callApi("playlistItems?part=snippet", token, {
        snippet: {
          playlistId,
          resourceId: { kind: "youtube#video", videoId },
        },
      });
      added++;
    } catch {
      failed++;
    }
    onProgress?.({ added: added + failed, total: videoIds.length });
  }

  return {
    playlistId,
    url: `https://www.youtube.com/playlist?list=${playlistId}`,
    added,
    failed,
  };
}
