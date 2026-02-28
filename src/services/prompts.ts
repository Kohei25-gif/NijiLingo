// プロンプト定数・ルール生成関数（groq.tsから分離）
// spaCyベース3分類（固定語/内容語/機能語）

import type { TranslateOptions, SpacyAnalysis } from './types';

// トーン調整の境界定義（構造フィールドとの重複なし。トーンが何を変えていいかだけ定義）
export const TONE_BOUNDARY_RULES = `
【トーン調整の境界】
- トーンは口調のみ変更する。構造情報の値はすべて保持する
- 変えていいのは「語彙の格式レベル・文体・丁寧さ」のみ
- 名詞は同カテゴリ内の言い換えのみ許容する`;

// 言語固有ルール（条件出力版）
export function getLanguageSpecificRules(targetLang: string): string {
  const parts: string[] = [];

  // 英語のみ追加ルール（過去のFAILから確立されたもの）
  if (targetLang === '英語') {
    parts.push(`
【英語固有ルール】
- 二人称代名詞は "you" と訳す
- 服の一般語は clothes/outfit を使う（"dress" はドレス/ワンピースが明示された時だけ）`);
  }

  return parts.join('');
}

// トーン指示を生成
export function getToneInstruction(options: TranslateOptions): string {
  const { tone, toneLevel = 0, customTone } = options;

  if (!tone || toneLevel === 0) {
    return '';
  }

  // トーン指示テーブル: 場面設定型（操作指示ではなくゴール場面を渡す）
  // LLM自身の言語感覚で適切な度合いを選ばせる。暴走も抑制も場面が制御する。
  // casual 100%はP8で実績あり（→連鎖暴走を解決）。他も同じ方法論に統一。
  const toneTable: Record<string, Record<string, string>> = {
    casual: {
      '50': 'Rewrite as if writing a casual email to a friend.',
      '100': 'Translate naturally using native expressions and slang where appropriate.',
    },
    business: {
      '50': 'Write in a polite and respectful tone. Use courteous expressions appropriate for the target language. Do not replace everyday vocabulary with literary or archaic words.',
      '100': 'Write in a highly polite and formal tone. Use courteous expressions, honorifics, and refined sentence structure appropriate for the target language. Do not replace everyday vocabulary with literary or archaic words.',
    },
  };

  if (tone === 'custom') {
    // プリセット別の具体的スタイル指示
    const presetInstructions: Record<string, string> = {
      'オジサン構文': `【カスタムトーン: オジサン構文】
■ 翻訳(英語)と逆翻訳(日本語)の両方にスタイルを適用すること。

▼ オジサン構文（ojisan_level=5）:
- 呼びかけを1回（例：〇〇ちゃん/〇〇さん/君〜）
- 絵文字を3〜8個（😊😅✨💦👍💓❄️😂）- 翻訳・逆翻訳の両方に必須
- 「…」を2回以上
- 改行を1回以上入れて"手紙感"を出す
- 気遣いフレーズを1つ（例：無理しないでね/疲れてない？/体調大丈夫？）
- 最後に柔らかい締め（例：またね😊/返信待ってるね✨）
- 「〜かな？😅」または「〜だよ😊」を最低1回
- 軽い自分語りを1回（例：昔は〜/おじさんも〜）
- 感嘆符・疑問符を合計3回以上（！！/！？/？？）
- 英語にも絵文字 例: "Nice outfit! 😊✨ Are you doing okay? 💦"
- ❌ 絵文字ゼロは絶対禁止`,

      '限界オタク': `【カスタムトーン: 限界オタク】
■ 翻訳(英語)と逆翻訳(日本語)の両方にスタイルを適用すること。

▼ 限界オタク（otaku_level=5）:
- 冒頭に感情トリガー（例：え、待って / 無理 / は？好き）を1つ以上
- 「？？？？？」か「！！！！！！」を必ず1回
- 「！」「？」「……」を合計3回以上
- 短文連打を1回（例：待って。無理。好き。ほんとに。）
- 括弧リアクションを1回（例：（情緒）（死）（助けて）（無理））
- 結論系の〆を1回（例：結論：優勝 / はい神 / つまり：尊い / 解散）
- 絵文字を1〜4個（🙏✨🔥😭😇）
- 擬音を1回（ﾋｪ… / ｱｯ / ﾝ゛ｯ 等）
- 自己崩壊ワード（情緒 / 脳が追いつかん / 語彙死んだ / 助けて / 好きすぎて無理）
- 英語も感情爆発（I CAN'T... TOO PRECIOUS... HELP... wait what??? / OMG??? / literally dying）
- ❌ 冷静な表現は絶対禁止`,

      '赤ちゃん言葉': `【カスタムトーン: 赤ちゃん言葉】
■ 翻訳(英語)と逆翻訳(日本語)の両方にスタイルを適用すること。

▼ 赤ちゃん言葉（baby_level=5）:
- 語尾を赤ちゃん化を最低2箇所（「です」→「でしゅ」、「ます」→「ましゅ」、「だよ」→「でしゅよ〜」）
- 擬音/感情語を最低1つ（えーん / えへへ / むぎゅ / ぷんぷん / ねむねむ / うぇぇ）
- 反復を最低1回（すきすき / おいちいおいちい / してほちい...してほちいの）
- 短文を最低1回（やだ。むり。ねむい。）
- 括弧感情を1回（（えへへ）（ぷんぷん）（しょんぼり）（どきどき））
- 赤ちゃん結論で〆る（おわりなの。/ がんばったの。/ えらいの。）
- 音の幼児化：「すごい」→「しゅごい」、「して」→「してほちい」、「だめ」→「だめぇ」
- 「しゅ/でしゅ/ましゅ/ほちい/よちよち」系を合計3回以上
- 英語も幼児っぽく（pwease / sowwy / vewy nice / dis is so good）
- ❌ 大人っぽい硬い表現は禁止`,

      'ギャル': `【カスタムトーン: ギャル】
■ 翻訳(英語)と逆翻訳(日本語)の両方にスタイルを適用すること。

▼ ギャル（gal_level=5）:
- 冒頭に導入フレーズを1つ（例：え、まって / てか / それな）
- 「え、まって」を必ず1回入れる
- 強調語を2つ以上（例：まじ / ガチ / 超 / 鬼 / えぐい / やば）
- 相槌・共感を1回（例：わかる / それな / ほんとそれ）
- 記号を合計3回以上使う（！/？/w/笑）
- 絵文字を2〜6個入れる（例：💅✨🥺💕🔥）
- 「〜すぎ」「〜案件」「〜しか勝たん」のいずれかを必ず1回
- 短文を1回連打（例：無理。好き。優勝。）
- 最後は軽い結論で締める（例：結論：優勝 / 〜しか勝たん / 最高じゃん？）
- 英語もギャルっぽく（like, totally, omg, so cute, literally, vibes, slay）
- ❌ 堅い表現・敬語は禁止`,
    };

    const preset = presetInstructions[customTone || ''];
    if (preset) {
      return preset;
    }
    // 自由入力はシンプルに
    return `[Tone instruction]\nRephrase the base translation in the style of "${customTone || ''}".`;
  }

  const instructions = toneTable[tone];
  if (!instructions) {
    return '';
  }

  const bucket = toneLevel < 75 ? '50' : '100';
  const instruction = instructions[bucket];

  return `[Tone instruction]\n${instruction}\nApply these to the base translation.`;
}

// 逆翻訳指示生成
export function getReverseTranslationInstruction(
  sourceLang: string,
  targetLang: string,
  _toneLevel: number,
  tone?: string,
  _customTone?: string
): string {
  const isPolite = tone === 'business';

  // ===== 日本語（既存のまま変更なし） =====
  if (sourceLang === '日本語') {
    if (isPolite) {
      return `【逆翻訳】
- reverse_translation は日本語で出力
- トーン調整後の翻訳を敬語で日本語に訳す
- トーン調整で追加された表現の差分を必ず反映すること（各パーセンテージ間の逆翻訳のトーンに差を出す）
- 二重敬語は使わず、正しい敬語を使う
- 人名の敬称は原文に従うこと。原文に「さん」「様」がなければ付けない
- 原文と同じ意味の語は、できるだけ原文の語彙に揃えること
- 原文の主語・視点を保持すること。原文が一人称なら逆翻訳も一人称で訳す
- 各人物への敬語レベルは原文の表現に合わせること（原文で「寝る」なら「おやすみになる」にしない）
- 敬語（丁寧語・謙譲語・尊敬語）で出力すること。ただし主語が話者本人の動作には尊敬語を使わないこと`;
    }
    return `【逆翻訳】
- reverse_translation は日本語で出力
- トーン調整後の翻訳を友達に話すようなくだけた口調で日本語に訳す
- トーン調整で追加された表現の差分を必ず反映すること（各パーセンテージ間の逆翻訳のトーンに差を出す）
- 敬語・丁寧語（です/ます）を使わない
- 人名の敬称は原文に従うこと。原文に「さん」「様」がなければ付けない
- 原文と同じ意味の語は、できるだけ原文の語彙に揃えること
- 原文の主語・視点を保持すること。原文が一人称なら逆翻訳も一人称で訳す
- 各人物への敬語レベルは原文の表現に合わせること（原文で「寝る」なら「おやすみになる」にしない）`;
  }

  // ===== 韓国語（敬語体系あり） =====
  if (sourceLang === '韓国語') {
    if (isPolite) {
      return `【逆翻訳】
- reverse_translation は必ず韓国語で出力すること
- トーン調整後の${targetLang}を韓国語に訳す
- 합니다体（フォーマル敬語）で出力すること
- トーン調整で追加された表現の差分を必ず反映すること（各パーセンテージ間の逆翻訳のトーンに差を出す）
- 原文と同じ意味の語は、できるだけ原文の語彙に揃えること
- 原文の主語・視点を保持すること。原文が一人称なら逆翻訳も一人称で訳す
- 各人物への敬語レベルは原文の表現に合わせること
- 人名の敬称は原文に従うこと。原文に敬称がなければ付けない`;
    }
    return `【逆翻訳】
- reverse_translation は必ず韓国語で出力すること
- トーン調整後の${targetLang}を韓国語に訳す
- 해체（くだけた口調）で出力すること
- トーン調整で追加された表現の差分を必ず反映すること（各パーセンテージ間の逆翻訳のトーンに差を出す）
- 原文と同じ意味の語は、できるだけ原文の語彙に揃えること
- 原文の主語・視点を保持すること。原文が一人称なら逆翻訳も一人称で訳す
- 各人物への敬語レベルは原文の表現に合わせること
- 人名の敬称は原文に従うこと。原文に敬称がなければ付けない`;
  }

  // ===== その他8言語（汎用） =====
  if (isPolite) {
    return `【逆翻訳】
- reverse_translation は必ず ${sourceLang} で出力すること
- トーン調整後の${targetLang}を${sourceLang}に訳す
- ${sourceLang}のフォーマルで丁寧な表現で逆翻訳すること
- トーン調整で追加された表現の差分を必ず反映すること（各パーセンテージ間の逆翻訳のトーンに差を出す）
- 逆翻訳は ${sourceLang} の語彙のみで構成する
- 原文と同じ意味の語は、できるだけ原文の語彙に揃えること
- 原文の主語・視点を保持すること。原文が一人称なら逆翻訳も一人称で訳す
- 各人物への敬語レベルは原文の表現に合わせること
- 人名の敬称は原文に従うこと。原文に敬称がなければ付けない`;
  }

  return `【逆翻訳】
- reverse_translation は必ず ${sourceLang} で出力すること
- トーン調整後の${targetLang}を${sourceLang}に訳す
- ${sourceLang}のカジュアルな口語表現で逆翻訳すること
- トーン調整で追加された表現の差分を必ず反映すること（各パーセンテージ間の逆翻訳のトーンに差を出す）
- 逆翻訳は ${sourceLang} の語彙のみで構成する
- 原文と同じ意味の語は、できるだけ原文の語彙に揃えること
- 原文の主語・視点を保持すること。原文が一人称なら逆翻訳も一人称で訳す
- 各人物への敬語レベルは原文の表現に合わせること
- 人名の敬称は原文に従うこと。原文に敬称がなければ付けない`;
}

// ============================================
// spaCyベース新設計プロンプト・定数
// ============================================

// Phase 2d: 場面設定Partial用システムプロンプト
// 構造制約（spaCy 3分類の語リスト）は structureText として動的に追加される
export const PARTIAL_SPACY_SYSTEM_PROMPT = `/no_think
あなたはNijiLingoのトーン調整エンジンです。

【出力】
translationは必ず指定された出力言語で、reverse_translationは必ず原文の言語で出力すること。
JSON形式のみ: {"translation":"...","reverse_translation":"...(原文の言語で)..."}`;

// ============================================
// spaCyベース新設計プロンプト関数
// ============================================

export function structureToPromptTextSpacy(analysis: SpacyAnalysis): string {
  if (!analysis.tokens || analysis.tokens.length === 0) {
    return '';
  }

  // 3分類: 品詞タグで振り分け
  const FIXED_UPOS = new Set(['NOUN', 'PROPN', 'NUM', 'PRON']);
  const FLEXIBLE_UPOS = new Set(['VERB', 'ADJ', 'ADV', 'AUX']);
  // FREE: それ以外（DET, SCONJ, ADP, CCONJ, PART, INTJ, etc.）
  // AUXをFLEXIBLEに昇格: meaning定義が意味の重さを自動判定する（might→重い定義、is→軽い定義）

  const fixedWords: string[] = [];
  const flexibleWords: string[] = [];
  const freeWords: string[] = [];

  for (let i = 0; i < analysis.tokens.length; i++) {
    const token = analysis.tokens[i];
    // 接語('s)・句読点をスキップ — U3(先頭's文法崩壊)修正
    // P13: 's のみ除外。'll,'ve,'re,'d,'m は通す
    if (/^['\u2019\u02BC]s$/i.test(token.text) || token.upos === 'PUNCT') continue;

    // P16: 's以外のアポストロフィ始まり接語（'m, 'll, 're, 've, 'd）は前のトークンと結合してFREEに
    // spaCyが I'm → I(PRON) + 'm(AUX) に分割するのを再結合して1語の機能語にする
    if (/^['\u2019\u02BC](?:m|ll|re|ve|d)$/i.test(token.text) && i > 0) {
      const prevToken = analysis.tokens[i - 1];
      const combined = prevToken.text + token.text;  // I + 'm → I'm
      // 前のトークンを配列から除去（直前に追加された方を狙う）
      for (const arr of [fixedWords, flexibleWords, freeWords]) {
        const idx = arr.lastIndexOf(prevToken.text);
        if (idx !== -1) { arr.splice(idx, 1); break; }
      }
      // 結合後はFREE（機能語）に分類
      freeWords.push(combined);
      continue;
    }

    if (FIXED_UPOS.has(token.upos)) {
      fixedWords.push(token.text);
    } else if (FLEXIBLE_UPOS.has(token.upos)) {
      flexibleWords.push(token.text);
    } else {
      freeWords.push(token.text);
    }
  }

  // 語リストのみ出力（ルール説明は userPrompt 側で一元管理）
  const lines: string[] = [];

  if (fixedWords.length > 0) {
    lines.push(`【絶対変えるな（固定語）】: ${fixedWords.join(', ')}`);
  }
  if (flexibleWords.length > 0) {
    lines.push(`【意味を保って言い換えOK（内容語）】: ${flexibleWords.join(', ')}`);
  }
  if (freeWords.length > 0) {
    lines.push(`【自由に変えていい（機能語）】: ${freeWords.join(', ')}`);
  }

  return lines.join('\n');
}

// 構造抽出結果からFLEXIBLE（内容語）リストを取得（meaning定義生成用）
export function extractFlexibleWords(analysis: SpacyAnalysis): string[] {
  if (!analysis.tokens || analysis.tokens.length === 0) return [];

  const FLEXIBLE_UPOS = new Set(['VERB', 'ADJ', 'ADV', 'AUX']);
  const result: string[] = [];

  for (let i = 0; i < analysis.tokens.length; i++) {
    const token = analysis.tokens[i];
    if (/^['\u2019\u02BC]s$/i.test(token.text) || token.upos === 'PUNCT') continue;
    // P16: 接語は結合してFREEなのでスキップ
    if (/^['\u2019\u02BC](?:m|ll|re|ve|d)$/i.test(token.text)) continue;
    if (FLEXIBLE_UPOS.has(token.upos)) {
      result.push(token.text);
    }
  }
  return result;
}

// meaning定義のみのテキストを組み立てる（構造制約なし・意味制約のみ）
// casual 100%フル生成やPartialフォールバック用: 自由に翻訳していいが意味は守る
export function buildMeaningConstraintText(
  definitions: Record<string, string>
): string {
  if (Object.keys(definitions).length === 0) return '';
  return Object.entries(definitions)
    .map(([word, def]) => `- ${word} = ${def}`)
    .join('\n');
}

export function getSimpleFullGenPrompt(targetLang: string, sourceLang: string, contentWords?: string, options?: { hasToneInstruction?: boolean }): string {
  const constraint = contentWords
    ? `\n\n【翻訳の制約】\n原文の以下の語は意味を必ず反映すること:\n${contentWords}`
    : '';
  const politenessLine = options?.hasToneInstruction
    ? ''
    : '\nPreserve the original text\'s level of politeness: if the original is polite, keep the translation polite; if casual, keep it casual.';
  return `Translate to ${targetLang} naturally.${politenessLine}${constraint}
Output JSON only: {"translation":"...","reverse_translation":"...in ${sourceLang}...","risk":"low|med|high","detected_language":"..."}`;
}

// フル生成用: 原文spaCy結果からcontent wordsリストを生成
export function extractContentWordsForFullGen(analysis: SpacyAnalysis): string {
  if (!analysis.tokens || analysis.tokens.length === 0) {
    return '';
  }
  const CONTENT_UPOS = new Set(['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN', 'NUM', 'PRON', 'AUX']);
  const contentWords = analysis.tokens
    .filter(t => CONTENT_UPOS.has(t.upos))
    .map(t => t.text);
  return contentWords.join(', ');
}

