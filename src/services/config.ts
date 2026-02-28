// 環境設定（Expo用）
// E9: import.meta.env の代替
// E10: 相対URLの代わりに絶対URLを使用

export const CONFIG = {
  // Vercel Serverless Function のベースURL
  API_BASE_URL: 'https://niji-chat.vercel.app',
  // spaCy API のURL
  SPACY_API_URL: 'https://nijilingo-spacy-server-production.up.railway.app',
} as const;
