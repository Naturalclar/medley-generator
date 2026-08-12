/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * YouTube プレイリスト作成用の OAuth クライアントID。
   * 未設定ならプレイリスト作成ボタンは表示しない(公開しても問題ない値)。
   */
  readonly VITE_YOUTUBE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
