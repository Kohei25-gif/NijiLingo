// OpenAI API 翻訳サービス（翻訳フロー関数のみ）
// spaCyベース3分類（固定語/内容語/機能語）

// 型定義を再エクスポート
export type { TranslationResult } from './types';

import type {
  TranslationResult,
  TranslateOptions,
  ExplanationResult,
  SpacyAnalysis,
  VerificationIssue,
  VerificationResult,
} from './types';

// API
import { MODELS, callGeminiAPI, parseJsonResponse, callSpacyAPI } from './api';

// ガード関数
import {
  applyEvaluationWordGuard,
  applyReverseTranslationGuard,
  applyTranslationLanguageGuard,
  checkModalityConsistency,
  _internal as guardsInternal,
} from './guards';

// プロンプト
import {
  TONE_BOUNDARY_RULES,
  PARTIAL_SPACY_SYSTEM_PROMPT,
  getLanguageSpecificRules,
  getToneInstruction,
  getReverseTranslationInstruction,
  getSimpleFullGenPrompt,
} from './prompts';

// i18n
import {
  getDifferenceFromText,
  getFailedToGenerateText,
  getNoChangeText,
  getLangCodeFromName,
  getLangNameFromCode,
} from './i18n';

// 再エクスポート（App.tsxからのimportを維持するため）
export { getDifferenceFromText, getNotYetGeneratedText, getFailedToGenerateText, getLangCodeFromName, getGrammarLabel, getVerifyingText, getFixingText, getNaturalnessCheckLabel } from './i18n';

// テスト用エクスポート
export const _internal = guardsInternal;

// ============================================
// FULL翻訳
// ============================================

export async function translateFull(options: TranslateOptions): Promise<TranslationResult> {
  const { sourceText, sourceLang, targetLang, isNative } = options;
  const toneLevel = options.toneLevel ?? 0;

  const toneInstruction = getToneInstruction(options);
  const reverseTranslationInstruction = getReverseTranslationInstruction(sourceLang, targetLang, toneLevel, options.tone, options.customTone);

  const langInfoOnly = `
【出力言語】
・translation: ${targetLang}
・reverse_translation: ${sourceLang}
`;

  const isBusiness = options.tone === 'business';
  const noToneSpecified = !options.tone;
  const japaneseRule = (targetLang === '日本語' || sourceLang === '日本語') ? `
【日本語の敬語ルール】
- 正しい敬語を使う（おっしゃる、ご覧になる、召し上がる等）
- 二重敬語を避け、正しい単一の敬語形を使う
${isBusiness ? `- ビジネス/丁寧トーンでは必ず敬語（です/ます/ございます）で出力する` : ''}
${noToneSpecified ? `- 原文のフォーマリティ（丁寧さ）のレベルをそのまま保って訳すこと（丁寧な原文→敬語、カジュアルな原文→くだけた口調）` : ''}
` : '';

  const languageSpecificRules = getLanguageSpecificRules(targetLang);

const systemPrompt = `/no_think
あなたは${sourceLang}から${targetLang}への翻訳の専門家です。

${langInfoOnly}
${TONE_BOUNDARY_RULES}
${japaneseRule}
${languageSpecificRules}

${isNative ? '【ネイティブモード】自然でネイティブらしい表現を使用。' : ''}

${toneInstruction}
${reverseTranslationInstruction}

【言語検出】
原文の言語を正確に判定し、detected_language に出力すること。
選択肢: 日本語, 英語, フランス語, スペイン語, ドイツ語, イタリア語, ポルトガル語, 韓国語, 中国語, チェコ語

JSON形式で出力：
{
  "translation": "...",
  "reverse_translation": "...",
  "risk": "low|med|high",
  "detected_language": "言語名"
}`;

  const toneDesc = options.tone
    ? `${options.tone}スタイル、強度${toneLevel}%`
    : '自然な翻訳';

  const userPrompt = `以下のテキストを翻訳してください（${toneDesc}）：

${sourceText}`;

  console.log('[translateFull] ===== API CALL =====');
  console.log('[translateFull] tone:', options.tone);
  console.log('[translateFull] toneLevel:', toneLevel);
  console.log('[translateFull] toneInstruction:', toneInstruction);
  console.log('[translateFull] userPrompt:', userPrompt);

  const model = MODELS.FULL;
  const response = await callGeminiAPI(model, systemPrompt, userPrompt, 0.3, options.signal);
  console.log('[translateFull] model:', model);
  console.log('[translateFull] response:', response);

  const parsed = parseJsonResponse<TranslationResult>(response);
  const result = applyTranslationLanguageGuard(
    targetLang,
    applyReverseTranslationGuard(sourceLang, applyEvaluationWordGuard(sourceText, parsed))
  );
  console.log('[translateFull] parsed result:', result);

  return result;
}

// ============================================
// 解説生成
// ============================================

function sanitizeExplanation(explanation: ExplanationResult): ExplanationResult {
  return {
    point: explanation.point || '',
    explanation: explanation.explanation || '',
  };
}

export async function generateExplanation(
  translatedText: string,
  _sourceLang: string,
  targetLang: string,
  outputLangCode: string = 'ja'
): Promise<ExplanationResult> {
  const outputLangName = getLangNameFromCode(outputLangCode)
  const targetLangName = getLangNameFromCode(targetLang) || targetLang

  let systemPrompt: string
  let userPrompt: string

  if (outputLangCode === 'ja') {
    systemPrompt = `/no_think
あなたは誰にでもわかりやすく解説することが得意な${targetLangName}の先生です。

【出力ルール】
1. point: 核となるフレーズ（どうしてもない場合は単語）を「${targetLangName}表現 = 口語的な日本語の意味」形式で1つ書く
2. explanation: 口語的な日本語で2〜3文。以下を含めること：
   - この表現の意味（口語的な日本語で）
   - 具体的にどんな場面・相手に使えるか
   - 文章全体に対して、受け取った相手がどう受け止めるかを、文章の文脈や意図を深く理解した上で、わかりやすい言葉で１〜３文の日本語で率直に説明すること。また、相手が嫌な思いをしたり、勘違いしたりする恐れ（皮肉表現なども含む）のある文章の場合の時のみ、注意点等を必ず含めて書くこと。
   項目分けせず自然な文章で。「です・ます調」で統一。

必ず以下のJSON形式で出力：
{
  "point": "${targetLangName}表現 = 意味",
  "explanation": "です・ます調で2〜3文の解説"
}`
    userPrompt = `${targetLangName}翻訳: ${translatedText}

この${targetLangName}表現について日本語（です・ます調）で解説して。`
  } else {
    systemPrompt = `/no_think
You are a ${targetLangName} teacher who excels at explaining things in a way anyone can understand.

【Output Rules - Write everything in ${outputLangName}】
1. point: Write the key phrase (or word only if no phrase exists) in "${targetLangName} expression = meaning in everyday ${outputLangName}" format
2. explanation: Write 2-3 sentences in everyday ${outputLangName}. Include:
   - What the expression means (in everyday language)
   - Specific situations/people it's useful for
   - For the sentence as a whole, explain frankly in 1-3 sentences how the recipient would perceive it, based on a deep understanding of the context and intent. Only when the message could cause discomfort or misunderstanding (including sarcasm or irony), be sure to include cautions or notes about it.
   No bullet points, write as natural prose.

Output ONLY valid JSON:
{
  "point": "${targetLangName} expression = meaning",
  "explanation": "2-3 sentences explanation in ${outputLangName}"
}`
    userPrompt = `${targetLangName} translation: ${translatedText}

Explain this ${targetLangName} expression in ${outputLangName}.`
  }

  const response = await callGeminiAPI(MODELS.FULL, systemPrompt, userPrompt);
  const parsed = parseJsonResponse<ExplanationResult>(response);
  return sanitizeExplanation(parsed);
}

export async function generateToneDifferenceExplanation(
  previousTranslation: string,
  currentTranslation: string,
  previousLevel: number,
  _currentLevel: number,
  tone: string,
  sourceLang: string,
  targetLangCode: string,
  originalText?: string
): Promise<ExplanationResult> {
  const langName = getLangNameFromCode(sourceLang)
  const targetLangName = getLangNameFromCode(targetLangCode) || targetLangCode

  if (previousTranslation === currentTranslation) {
    return {
      point: getDifferenceFromText(sourceLang, previousLevel),
      explanation: getNoChangeText(sourceLang)
    };
  }

  void tone;
  void _currentLevel;

  let systemPrompt: string;
  let userPrompt: string;

  if (sourceLang === 'ja') {
    systemPrompt = `/no_think
あなたは誰にでもわかりやすく解説することが得意な${targetLangName}の先生です。

【出力ルール】
1. point: 核となるフレーズ（どうしてもない場合は単語）を「${targetLangName}表現 = 口語的な日本語の意味」形式で1つ書く
2. explanation: 口語的な日本語で2〜3文。以下を含めること：
   - この表現の意味（口語的な日本語で）
   - 具体的にどんな場面・相手に使えるか
   - 文章全体に対して、受け取った相手がどう受け止めるかを、文章の文脈や意図を深く理解した上で、わかりやすい言葉で１〜３文の日本語で率直に説明すること。また、相手が嫌な思いをしたり、勘違いしたりする恐れ（皮肉表現なども含む）のある文章の場合の時のみ、注意点等を必ず含めて書くこと。
   項目分けせず自然な文章で。「です・ます調」で統一。

※ 前のトーンの翻訳も参考として渡します。前のトーンに一字一句同じ表現がある場合は、それとは別の表現を選んで解説すること。

必ず以下のJSON形式で出力：
{
  "point": "${targetLangName}表現 = 意味",
  "explanation": "です・ます調で2〜3文の解説"
}`
    userPrompt = `${originalText ? `原文: 「${originalText}」\n` : ''}前のトーンの翻訳: "${previousTranslation}"
この翻訳: "${currentTranslation}"

この${targetLangName}翻訳について日本語（です・ます調）で解説して。`
  } else {
    systemPrompt = `/no_think
You are a ${targetLangName} teacher who excels at explaining things in a way anyone can understand.

【Output Rules - Write everything in ${langName}】
1. point: Write the key phrase (or word only if no phrase exists) in "${targetLangName} expression = meaning in everyday ${langName}" format
2. explanation: Write 2-3 sentences in everyday ${langName}. Include:
   - What the expression means (in everyday language)
   - Specific situations/people it's useful for
   - For the sentence as a whole, explain frankly in 1-3 sentences how the recipient would perceive it, based on a deep understanding of the context and intent. Only when the message could cause discomfort or misunderstanding (including sarcasm or irony), be sure to include cautions or notes about it.
   No bullet points, write as natural prose.

The previous tone translation is also provided for reference. If an expression appears word-for-word identical in the previous translation, pick a different expression to explain.

Output ONLY valid JSON:
{
  "point": "${targetLangName} expression = meaning",
  "explanation": "2-3 sentences in ${langName}"
}`
    userPrompt = `${originalText ? `Original: 「${originalText}」\n` : ''}Previous tone translation: "${previousTranslation}"
This translation: "${currentTranslation}"

Explain this ${targetLangName} expression in ${langName}.`
  }

  try {
    const response = await callGeminiAPI(MODELS.FULL, systemPrompt, userPrompt, 0.3, undefined, 300);
    const parsed = parseJsonResponse<ExplanationResult>(response);
    return sanitizeExplanation(parsed);
  } catch (error) {
    console.error('[generateToneDifferenceExplanation] error:', error);
    return { point: getDifferenceFromText(sourceLang, previousLevel), explanation: getFailedToGenerateText(sourceLang) };
  }
}

// ============================================
// 相手メッセージ翻訳
// ============================================

export async function translatePartnerMessage(
  text: string,
  partnerLang: string
): Promise<TranslationResult & { explanation: ExplanationResult }> {
  const translationResult = await translateFull({
    sourceText: text,
    sourceLang: partnerLang,
    targetLang: '日本語',
    isNative: false,
  });

  const explanation = await generateExplanation(text, '日本語', partnerLang);

  return { ...translationResult, explanation };
}

// ============================================
// spaCy構造抽出（新設計）
// ============================================

export async function extractStructureSpacy(
  text: string,
  lang: string
): Promise<SpacyAnalysis> {
  try {
    return await callSpacyAPI(text, lang);
  } catch (error) {
    console.error('[extractStructureSpacy] spaCy API error:', error);
    return {
      tokens: [],
      summary: { total: 0, protected: 0, unprotected: 0 },
      lang,
      model: 'fallback',
    };
  }
}

// ============================================
// シンプルフル生成（新設計）
// ============================================

/**
 * シンプルプロンプトでフル生成（新設計）
 * 既存のtranslateFull()（巨大systemPrompt）の代替。
 *
 * 違い:
 * - プロンプトが1-2行（「〇〇トーンで翻訳して」）
 * - 構造抽出結果は使わない
 * - API呼び出し1回で完結
 * - 3つのガード（evaluation, reverse, language）はそのまま適用
 */
export async function translateFullSimple(options: {
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  contentWords?: string;
  meaningConstraint?: string;
  toneInstruction?: string;
  tone?: string;
  signal?: AbortSignal;
}): Promise<TranslationResult> {
  const { sourceText, sourceLang, targetLang, contentWords, meaningConstraint, toneInstruction, tone, signal } = options;
  const prompt = getSimpleFullGenPrompt(targetLang, sourceLang, contentWords, { hasToneInstruction: !!toneInstruction });

  // 逆翻訳指示（敬語/くだけた口調等のルール）
  const reverseInstr = getReverseTranslationInstruction(sourceLang, targetLang, 0, tone);

  // トーン指示 + meaning定義制約 + 逆翻訳指示を組み立て
  let systemPrompt = `/no_think\n${prompt}`;
  if (toneInstruction) {
    systemPrompt += `\n\n${toneInstruction}`;
  }
  if (meaningConstraint) {
    systemPrompt += `\n\n【意味の制約】\n以下の語の意味を翻訳に必ず反映すること:\n${meaningConstraint}`;
  }
  systemPrompt += `\n\n${reverseInstr}`;

  console.log('[translateFullSimple] ===== API CALL =====');
  console.log('[translateFullSimple] prompt:', systemPrompt);

  const response = await callGeminiAPI(MODELS.FULL, systemPrompt, sourceText, 0.3, signal);
  console.log('[translateFullSimple] response:', response);

  const parsed = parseJsonResponse<TranslationResult>(response);
  const result = applyTranslationLanguageGuard(
    targetLang,
    applyReverseTranslationGuard(sourceLang, applyEvaluationWordGuard(sourceText, parsed))
  );
  console.log('[translateFullSimple] result:', result);

  return result;
}

// ============================================
// spaCy構造制約付き部分生成（Phase 2c-2）
// ============================================

/**
 * spaCy構造制約を使った部分生成（場面設定Partial）
 *
 * フロー:
 * 1. getToneInstruction() で場面設定を取得
 * 2. structureText（spaCyの3分類制約）をシステムプロンプトに組み込み
 * 3. API呼び出し → JSONパース
 * 4. 失敗時は baseTranslation をフォールバック
 */
export async function translatePartialSpacy(options: {
  baseTranslation: string;
  structureText: string;
  tone: string;
  toneLevel: number;
  targetLang: string;
  sourceLang: string;
  originalText: string;
  signal?: AbortSignal;
  referenceTranslation?: string;
  fallbackToPreviousLevel?: { translation: string; reverse_translation: string; risk: string };
  meaningConstraint?: string;
}): Promise<{ translation: string; reverse_translation: string; risk: string }> {
  const { baseTranslation, structureText, tone, toneLevel, targetLang, sourceLang, originalText, signal, referenceTranslation, fallbackToPreviousLevel, meaningConstraint } = options;

  // 場面設定（getToneInstructionが場面設定テーブルを返す）
  const toneInstruction = getToneInstruction({
    sourceText: originalText,
    sourceLang,
    targetLang,
    isNative: false,
    tone,
    toneLevel,
  });

  // 逆翻訳指示（言語を明示）
  const reverseTranslationInstr = getReverseTranslationInstruction(
    sourceLang,
    targetLang,
    toneLevel,
    tone
  );

  // systemPrompt: 役割 + 構造制約（語リスト）
  const systemPrompt = structureText
    ? `${PARTIAL_SPACY_SYSTEM_PROMPT}\n\n【構造制約】\n${structureText}`
    : PARTIAL_SPACY_SYSTEM_PROMPT;

  // userPrompt: ベース翻訳 + 原文 + 場面設定 + ルール + 逆翻訳指示
  const ruleBlock = [
    '【ルール】',
    '- 【絶対変えるな】の語はそのまま保つこと',
    '- 【言い換えOK】の各語は、横に書かれた説明に合う言葉を選ぶこと',
    '- 【自由に変えていい】の語は自由に調整してよい',
    '- 内容・出来事はそのまま保つこと',
    '- Do not change the subject of the sentence (e.g. "I" must stay "I", not "we")',
    '- 原文がカジュアルな語を使っている場合、語彙の格を上げるな。ビジネストーンは丁寧表現や文の構造で表現せよ',
  ].join('\n');

  // 出力言語を英語名で明示 — U4(言語混在)修正
  const targetLangEnglish = getLangNameFromCode(getLangCodeFromName(targetLang));

  // 100%生成時は「ベースを書き直せ」ではなく「50%版を推敲しろ」に変える
  // 語彙エスカレーション（go→proceed等）を防ぎ、文体推敲に誘導する
  const toneInstructionAdjusted = referenceTranslation
    ? toneInstruction.replace('Apply these to the base translation.', 'Adjust the 50% version to match this tone. Keep the same vocabulary. Add polite expressions to increase formality, do not upgrade word choices.')
    : toneInstruction;

  // meaning定義テキスト（ルールブロック後、トーン指示前に配置）
  const meaningBlock = meaningConstraint
    ? `【意味の制約】\n以下の語の意味を翻訳に必ず反映すること:\n${meaningConstraint}`
    : '';

  // ルールをトーンより先に配置: 意味制約が主、ニュアンス調整が従
  const userPrompt = [
    `Output language: ${targetLangEnglish}`,
    ...(referenceTranslation
      ? [`Base (0%): "${baseTranslation}"`,
         `50% version: "${referenceTranslation}"`]
      : [`ベース翻訳 (${targetLang}): ${baseTranslation}`]),
    `原文: ${originalText}`,
    '',
    ruleBlock,
    '',
    meaningBlock,
    ...(tone === 'casual' ? ['Keep the same meaning, but you are free to use completely different words and phrasing.'] : []),
    '',
    toneInstructionAdjusted,
    '',
    reverseTranslationInstr,
  ].filter(line => line !== undefined).join('\n');

  console.log(`[translatePartialSpacy] ===== API CALL ===== tone=${tone} level=${toneLevel}`);
  console.log('[translatePartialSpacy] systemPrompt:', systemPrompt);
  console.log('[translatePartialSpacy] userPrompt:', userPrompt);

  try {
    const response = await callGeminiAPI(MODELS.PARTIAL, systemPrompt, userPrompt, 0, signal, 150);
    console.log(`[translatePartialSpacy] response (${tone}/${toneLevel}):`, response);

    const parsed = parseJsonResponse<{ translation?: string; reverse_translation?: string }>(response);

    // LanguageGuard: 翻訳結果に日本語が混入していないかチェック
    const guarded = applyTranslationLanguageGuard(targetLang, {
      translation: parsed.translation || baseTranslation,
      reverse_translation: parsed.reverse_translation || originalText,
      risk: 'low',
    });
    const partialResult = {
      translation: guarded.translation,
      reverse_translation: guarded.reverse_translation,
      risk: guarded.risk,
    };

    // モダリティガード: 原文の発話行為（依頼/確認/提案等）が翻訳で変わっていないか検証
    const modalityCheck = checkModalityConsistency(originalText, partialResult.translation);
    if (!modalityCheck.passed) {
      console.log(`[ModalityGuard] fallback triggered: ${modalityCheck.reason}`);
      // 前段レベルの結果があればそれを返す（API呼び出しなし）
      if (fallbackToPreviousLevel) {
        console.log(`[ModalityGuard] fallback to previous level: ${tone}${toneLevel === 100 ? '50' : '0'}`);
        return fallbackToPreviousLevel;
      }
      // 構造制約なし・meaning定義のみでフル生成にフォールバック（意味固定は維持）
      const fallbackResult = await translateFullSimple({
        sourceText: originalText,
        sourceLang,
        targetLang,
        meaningConstraint,
        signal,
      });
      return {
        translation: fallbackResult.translation,
        reverse_translation: fallbackResult.reverse_translation,
        risk: fallbackResult.risk,
      };
    }

    return partialResult;
  } catch (error) {
    // AbortError はそのまま throw（キャンセル時は上位で処理）
    if ((error as any)?.name === 'AbortError') throw error;
    console.warn(`[translatePartialSpacy] failed for level ${toneLevel}:`, error);
    return {
      translation: baseTranslation,
      reverse_translation: originalText,
      risk: 'high',
    };
  }
}

// ===== meaning定義生成 =====
// 内容語の意味定義を生成し、部分生成での意味逸脱を防ぐ
export async function generateMeaningDefinitions(
  originalText: string,
  baseTranslation: string,
  flexibleWords: string[],
  sourceLang: string,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  if (flexibleWords.length === 0) return {};

  const systemPrompt = `/no_think
You are a translation assistant. Given an original sentence and its base translation, define the meaning of each listed word as used in THIS specific sentence.
Be specific enough that a translator can distinguish this meaning from similar words.
Explain the meaning of each word as a descriptive phrase about the state, action, or feeling. Do not define a word by simply listing synonyms.
If the word involves an action or relationship between people, include who does what to whom.
If a person's name appears, note their likely role (e.g. child, colleague, friend) based on context.
Output JSON only: {"definitions": {"word": "definition", ...}}`;

  const userPrompt = `Original (${sourceLang}): 「${originalText}」
Base translation: "${baseTranslation}"
Words to define: ${flexibleWords.join(', ')}`;

  try {
    const response = await callGeminiAPI(MODELS.FULL, systemPrompt, userPrompt, 0.1, signal);
    console.log('[generateMeaningDefinitions] response:', response);
    const parsed = parseJsonResponse<{ definitions?: Record<string, string> }>(response);
    return parsed.definitions || {};
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    console.warn('[generateMeaningDefinitions] failed, continuing without definitions:', error);
    return {};
  }
}

// ============================================
// 検証API: 意味保持チェック + 自然さチェック + 語単位修正
// ============================================

/**
 * 翻訳の品質を検証する（70Bモデル使用）
 * 4項目チェック: 意味シフト / 意味欠落 / 意味追加 / 不自然な表現
 * 各帯の生成完了後にfire-and-forgetで呼ばれる
 */
export async function verifyTranslation(options: {
  originalText: string;
  translation: string;
  reverseTranslation?: string;
  meaningDefinitions: Record<string, string>;
  tone?: string;
  signal?: AbortSignal;
}): Promise<VerificationResult> {
  const { originalText, translation, reverseTranslation, meaningDefinitions, tone, signal } = options;

  const definitionsList = Object.entries(meaningDefinitions)
    .map(([word, def]) => `- "${word}": ${def}`)
    .join('\n');

  const toneContext = tone ? `\nThis translation is tone-adjusted to ${tone}.` : '';

  const reverseCheckBlock = reverseTranslation ? `
5. Reverse translation subject/perspective: Does the reverse translation preserve the subject and perspective of the original? If the original uses first person ("I"), the reverse translation must also use first person. Using honorific forms that shift the subject (e.g. Japanese 尊敬語 turning "I did X" into "someone did X for you") is a high severity issue.
6. Reverse translation naturalness: Is the reverse translation natural and idiomatic in the original language? Overly literal, awkward, or unnatural phrasing in the reverse translation is an issue.` : '';

  const systemPrompt = `You are a translation quality checker.
Judge based on the target language's own grammar rules.${toneContext}

Check for:
1. Meaning shift: Does any word's meaning change from the definition?
2. Meaning loss: Is any defined meaning missing in the translation?
3. Meaning addition: Does the translation convey any intent or nuance not present in the original? Judge by the overall message, not by individual words.
4. Unnatural expression: Is any part grammatically awkward or unnatural in the target language?${reverseCheckBlock}

Severity:
- high: Grammatically wrong, clearly unnatural, or meaning is wrong
- medium: Slightly odd but native speakers might use it
- low: Style preference

Respond in JSON:
{
  "pass": true/false,
  "issues": [
    {
      "type": "meaning_shift|meaning_loss|meaning_addition|unnatural|reverse_subject|reverse_unnatural",
      "severity": "high|medium|low",
      "word": "(for meaning issues) the problematic word",
      "expected": "(for meaning issues) what it should mean",
      "got": "(for meaning issues) what it actually conveys",
      "phrase": "(for unnatural/reverse issues) the awkward phrase",
      "reason": "why it is an issue"
    }
  ]
}
Set pass to false only if there are high severity issues. If all issues are medium or low, set pass to true.`;

  const reverseLine = reverseTranslation ? `\nReverse translation: "${reverseTranslation}"` : '';
  const userPrompt = `Original: "${originalText}"
Translation: "${translation}"${reverseLine}

Intended meanings:
${definitionsList}`;

  console.log('[verifyTranslation] ===== API CALL =====');
  console.log('[verifyTranslation] translation:', translation);

  try {
    const response = await callGeminiAPI(MODELS.VERIFY, systemPrompt, userPrompt, 0.1, signal);
    console.log('[verifyTranslation] response:', response);
    const parsed = parseJsonResponse<VerificationResult>(response);
    return {
      pass: parsed.pass ?? true,
      issues: parsed.issues || [],
    };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    console.warn('[verifyTranslation] failed, treating as pass:', error);
    return { pass: true, issues: [] };
  }
}

/**
 * 意味ズレの語だけ差し替える（70Bモデル使用）
 * meaning_shift / meaning_loss / meaning_addition 用
 */
export async function fixMeaningIssues(options: {
  originalText: string;
  translation: string;
  issues: VerificationIssue[];
  sourceLang: string;
  targetLang: string;
  tone?: string;
  bucket?: number;
  signal?: AbortSignal;
}): Promise<{ translation: string; reverse_translation: string }> {
  const { originalText, translation, issues, sourceLang, targetLang, tone, bucket, signal } = options;

  const reverseInstr = getReverseTranslationInstruction(sourceLang, targetLang, 0, tone);

  const issuesList = JSON.stringify(issues, null, 2);

  // トーン定義を翻訳時と同じgetToneInstructionから取得
  const toneDefinition = (tone && bucket) ? getToneInstruction({
    sourceText: originalText, sourceLang, targetLang, isNative: false,
    tone, toneLevel: bucket,
  }) : '';
  const toneBlock = toneDefinition ? `\n${toneDefinition}` : '';

  const systemPrompt = `You are a translation fixer.
Fix based on the issues provided. The expected field shows the correct meaning for each word.
Keep everything else, including the tone level, exactly the same.${toneBlock}
The translation MUST be in ${targetLang}. Do NOT output in the original language.
${reverseInstr}
Respond in JSON:
{
  "translation": "...in ${targetLang}...",
  "reverse_translation": "...in ${sourceLang}..."
}`;

  const userPrompt = `Original text (${sourceLang}):
"${originalText}"
Translation (${targetLang}):
"${translation}"
Issues found:
${issuesList}`;

  console.log('[fixMeaningIssues] ===== API CALL =====');
  console.log('[fixMeaningIssues] issues:', issues);

  try {
    const response = await callGeminiAPI(MODELS.VERIFY, systemPrompt, userPrompt, 0.1, signal);
    console.log('[fixMeaningIssues] response:', response);
    const parsed = parseJsonResponse<{ translation: string; reverse_translation: string }>(response);
    return {
      translation: parsed.translation || translation,
      reverse_translation: parsed.reverse_translation || '',
    };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    console.warn('[fixMeaningIssues] failed, keeping original:', error);
    return { translation, reverse_translation: '' };
  }
}

/**
 * 不自然な表現を修正する（70Bモデル使用）
 * unnatural 用。文全体を返させる（文法連鎖があるため）
 */
export async function fixNaturalness(options: {
  originalText: string;
  translation: string;
  issues: VerificationIssue[];
  sourceLang: string;
  targetLang: string;
  tone?: string;
  bucket?: number;
  signal?: AbortSignal;
}): Promise<{ translation: string; reverse_translation: string }> {
  const { originalText, translation, issues, sourceLang, targetLang, tone, bucket, signal } = options;

  const reverseInstr = getReverseTranslationInstruction(sourceLang, targetLang, 0, tone);

  const issuesList = issues
    .map(i => `- "${i.phrase}" is ${i.reason}`)
    .join('\n');

  // トーン定義を翻訳時と同じgetToneInstructionから取得
  const toneDefinition = (tone && bucket) ? getToneInstruction({
    sourceText: originalText, sourceLang, targetLang, isNative: false,
    tone, toneLevel: bucket,
  }) : '';
  const toneBlock = toneDefinition ? `\n${toneDefinition}` : '';

  const systemPrompt = `You are a translation fixer.
The translation has unnatural expressions. Rewrite the sentence fixing ONLY the unnatural parts.
Do not change anything else. Keep the meaning and tone level exactly the same.${toneBlock}
The translation MUST be in ${targetLang}. Do NOT output in the original language.
${reverseInstr}
Respond in JSON:
{
  "translation": "...in ${targetLang}...",
  "reverse_translation": "...in ${sourceLang}..."
}`;

  const userPrompt = `Original text (${sourceLang}):
"${originalText}"
Translation with unnatural expressions (${targetLang}):
"${translation}"
Issues:
${issuesList}`;

  console.log('[fixNaturalness] ===== API CALL =====');
  console.log('[fixNaturalness] issues:', issues);

  try {
    const response = await callGeminiAPI(MODELS.VERIFY, systemPrompt, userPrompt, 0.1, signal);
    console.log('[fixNaturalness] response:', response);
    const parsed = parseJsonResponse<{ translation: string; reverse_translation: string }>(response);
    return {
      translation: parsed.translation || translation,
      reverse_translation: parsed.reverse_translation || '',
    };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    console.warn('[fixNaturalness] failed, keeping original:', error);
    return { translation, reverse_translation: '' };
  }
}
