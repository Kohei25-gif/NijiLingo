// API呼び出し・パース関連（groq.tsから分離）
import type { SpacyAnalysis } from './types';
import { CONFIG } from './config';

// モデル定義
export const MODELS = {
  FULL: 'qwen/qwen3-32b',    // FULL翻訳・解説用（Qwen3-32B, /no_think推論なし）
  PARTIAL: 'qwen/qwen3-32b', // PARTIAL編集用（Qwen3-32B, /no_think推論なし）
  VERIFY: 'moonshotai/kimi-k2-instruct-0905', // 検証・修正用（Kimi K2）
} as const;

export class OpenAIApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = 'OpenAIApiError';
    this.status = status;
    this.details = details;
  }
}

export const getOpenAIErrorMessage = (status: number): string => {
  if (status === 401) {
    return 'OpenAI API の認証に失敗しました（401）。APIキーを確認してください。';
  }
  if (status === 403) {
    return 'OpenAI API へのアクセスが拒否されました（403）。APIキー設定をご確認ください。';
  }
  if (status === 429) {
    return 'OpenAI API のレート制限に到達しました（429）。しばらく待ってから再試行してください。';
  }
  if (status >= 500) {
    return `OpenAI API のサーバーエラーが発生しました（${status}）。時間をおいて再試行してください。`;
  }
  return `OpenAI API エラーが発生しました（${status}）。`;
};

// E10: 絶対URLを使用（React Native では相対URLが使えない）
const API_BASE_URL = CONFIG.API_BASE_URL;

// OpenAI API呼び出し（Vercel Serverless Function経由）
export async function callGeminiAPI(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.3,
  signal?: AbortSignal,
  maxTokens?: number
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/openai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      systemPrompt,
      userPrompt,
      temperature,
      ...(maxTokens && { maxTokens }),
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new OpenAIApiError(
      response.status,
      error.error || getOpenAIErrorMessage(response.status),
      error.details
    );
  }

  const data = await response.json();
  // Qwen3の/no_thinkモードでも空の<think>タグが出ることがあるため除去
  return (data.content as string).replace(/<think>[\s\S]*?<\/think>\s*/g, '');
}

// JSONをパース（マークダウンコードブロックも対応）
export function parseJsonResponse<T>(text: string): T {
  // ```json ... ``` を除去
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // JSONオブジェクトを抽出（日本語テキストが前後にある場合に対応）
  // LLMが複数JSONを返す場合があるため、最初のJSONだけ取る
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // 複数JSON連結の場合: 最初の有効なJSONを探す
    const firstJson = cleaned.match(/\{[^{}]*\}/);
    if (firstJson) {
      return JSON.parse(firstJson[0]);
    }
    throw new Error(`JSON parse failed: ${cleaned.substring(0, 200)}`);
  }
}

// ===== spaCy API（新設計）=====

// E9: import.meta.env の代わりに CONFIG を使用
const SPACY_API_URL = CONFIG.SPACY_API_URL;

export async function callSpacyAPI(
  text: string,
  lang: string
): Promise<SpacyAnalysis> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000); // 3秒タイムアウト

  try {
    const response = await fetch(`${SPACY_API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`spaCy API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}
