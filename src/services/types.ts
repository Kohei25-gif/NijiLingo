// types.ts: 型定義

// ═══ 翻訳結果（API仕様 — 英語維持） ═══

export interface TranslationResult {
  translation: string;
  reverse_translation: string;
  risk: 'low' | 'med' | 'high';
  detected_language?: string;
}

// ═══ 解説 ═══

export interface ExplanationResult {
  point: string;
  explanation: string;
}

// ═══ 翻訳オプション ═══

export interface TranslateOptions {
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  isNative: boolean;
  tone?: string;
  toneLevel?: number;
  customTone?: string;
  signal?: AbortSignal;
}

// ═══ コード内部ロジック用（英語維持） ═══

export type ModalityClass = 'request' | 'confirmation' | 'suggestion' | 'obligation' | 'statement';

// ===== 検証API =====

export interface VerificationIssue {
  type: 'meaning_shift' | 'meaning_loss' | 'meaning_addition' | 'unnatural' | 'reverse_subject' | 'reverse_unnatural';
  severity: 'high' | 'medium' | 'low';
  // 意味ズレ系 (meaning_shift / meaning_loss / meaning_addition)
  word?: string;
  expected?: string;
  got?: string;
  // 自然さ系 (unnatural)
  phrase?: string;
  reason?: string;
}

export interface VerificationResult {
  pass: boolean;
  issues: VerificationIssue[];
}

// ===== spaCy構造抽出（新設計）=====

export interface SpacyToken {
  text: string;
  lemma: string;
  upos: string;
  protect: boolean;
}

export interface SpacySummary {
  total: number;
  protected: number;
  unprotected: number;
}

export interface SpacyAnalysis {
  tokens: SpacyToken[];
  summary: SpacySummary;
  lang: string;
  model: string;
}
