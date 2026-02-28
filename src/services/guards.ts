// サーバー側ガード機能（groq.tsから分離）

import type {
  TranslationResult,
  ModalityClass,
} from './types';

export function hasJapaneseCharacters(text: string): boolean {
  return /[ぁ-んァ-ン一-龯]/.test(text);
}

// modality_class を抽出（request/confirmation/suggestion/obligation判定）
export function extractModalityClass(text: string): ModalityClass {
  const normalized = text.trim().toLowerCase();

  // request（依頼）パターン - 「してくれる？」「してもらえる？」など
  const requestPatterns = [
    // --- English ---
    /^can you\b/i,
    /^could you\b/i,
    /^would you\b/i,
    /^will you\b/i,
    /^please\b/i,            // 文頭のPlease（命令・依頼の定型）
    /\bplease\b.*\?$/i,
    /^would you mind\b/i,
    /\bi'd like you to\b/i,
    /\bwould it be possible\b/i,
    /\bi was wondering if\b/i,
    // --- Japanese ---
    /してくれ/,
    /してもらえ/,
    /お願い/,
    /していただ/,
    /くれる[？?]$/,
    /もらえる[？?]$/,
    /いただける[？?]$/,
    /してほしい/,
    /てくださ/,
    /ていただきたい/,
    /てくれよ$/,              // 「してくれよ」「教えてくれよ」
    // --- Spanish ---
    /\bpor favor\b/,
    /\bpodr[ií]a[s]?\b/,       // podría, podrías, podria, podrias
    // --- French ---
    /\bs'il (te|vous) pla[iî]t\b/,
    /\bpourr(iez|ais)-?(vous|tu)\b/,
    // --- German ---
    /\bbitte\b/,
    /\bk[oö]nnt(est|en)\b/,    // könntest, könnten, konntest, konnten
    /\bw[uü]rd(est|en)\b/,     // würdest, würden, wurdest, wurden
    // --- Italian ---
    /\bper favore\b/,
    /\bpotresti\b/,
    /\bpotrebbe\b/,
    // --- Portuguese ---
    /\bpor favor\b/,
    /\bpoderia\b/,
    /\bvoc[eê] poderia\b/,
    // --- Korean ---
    /해\s?주세요/,
    /해\s?줄래/,
    /부탁/,
    // --- Chinese ---
    /^请/,                       // 文頭の请のみ（文中は誤検知リスク）
    /能不能/,
    // --- Czech ---
    /\bpros[ií]m\b/,            // prosím, prosim
    /\bmohl[a]?\s?by/,          // mohl by, mohla by
  ];

  // confirmation（確認）パターン - 「〜するの？」「〜なの？」など
  const confirmationPatterns = [
    // --- English ---
    /^are you\b.*\?$/i,
    /^is it\b.*\?$/i,
    /^is this\b.*\?$/i,
    /^is that\b.*\?$/i,
    /^did you\b.*\?$/i,
    /^do you\b.*\?$/i,
    /^does\b.*\?$/i,
    /^have you\b.*\?$/i,
    /^has\b.*\?$/i,
    /^isn't it\b.*\?$/i,
    /^don't you\b.*\?$/i,
    /,\s*right[？?.]?$/i,    // "You know that, right" "It's cold, right?"（カンマ必須）
    // --- Japanese ---
    /するの[？?]$/,
    /なの[？?]?$/,            // 「本当なの」「大丈夫なの」（疑問符任意）
    /[てで]るの[？?]?$/,      // 「わかってるの」「してるの」「見てるの」
    /たの[？?]?$/,            // 「食べたの」「行ったの」「したの」
    /でしょ[？?]?$/,          // 「嘘でしょ」「わかってるでしょ」
    /だろ[？?]?$/,            // 「知ってるだろ」「行くだろ」
    /ですか[？?]?$/,
    /ますか[？?]?$/,
    /でしょうか/,
    /よね[？?]$/,
    /じゃない[？?]$/,
    // --- Spanish ---
    /^¿est[áa]/i,               // ¿Está, ¿Esta
    /^¿tiene/i,                  // ¿Tiene
    // --- French ---
    /^est-ce que/i,              // Est-ce que
    /^n'est-ce pas/i,            // N'est-ce pas
    // --- German ---
    /^ist (das|es)/i,            // Ist das, Ist es
    /oder[？?]$/,                 // ...oder?
    // --- Italian ---
    /^hai /i,                    // Hai ...?
    /vero[？?]$/,                 // ...vero?
    // --- Portuguese ---
    /né[？?]$/,                   // ...né?
    // --- Korean ---
    /맞아[？?]$/,                  // ...맞아?
    /인가요[？?]?$/,                // ...인가요?
    /잖아/,                       // ...잖아
    // --- Chinese ---
    /^是不是/,                     // 是不是...
    /对吧/,                       // ...对吧
    // --- Czech ---
    /^je to/i,                   // Je to...?
  ];

  // suggestion（提案）パターン
  const suggestionPatterns = [
    // --- English ---
    /^how about\b/i,
    /^why don't (we|you)\b/i,
    /^let's\b/i,
    /^shall we\b/i,
    /^what if\b/i,
    /\byou might want to\b/i,
    /\bmaybe we should\b/i,
    // --- Japanese ---
    /しよう[？?]?$/,
    /しない[？?]$/,
    /どう[？?]$/,
    /たらどう/,
    /ませんか/,
    /てみない/,
    // --- Spanish ---
    /^¿qué tal si/i,            // ¿Qué tal si...
    /^¿por qué no/i,            // ¿Por qué no...
    // --- French ---
    /^et si/i,                   // Et si...
    /^pourquoi ne pas/i,         // Pourquoi ne pas...
    /\bon pourrait\b/,           // on pourrait
    // --- German ---
    /^wie w[äa]re es/i,          // Wie wäre es / Wie ware es
    /^lass uns/i,                // Lass uns...
    /^sollen wir/i,              // Sollen wir...
    // --- Italian ---
    /^che ne dici/i,             // Che ne dici...
    /^perch[ée] non/i,           // Perché non / Perche non
    /^facciamo/i,                // Facciamo...（文頭のみ）
    // --- Portuguese ---
    /^que tal/i,                 // Que tal...
    /^por que não/i,             // Por que não...
    // --- Korean ---
    /할까[？?]$/,                  // ...할까?
    /하자/,                       // ...하자
    /어때/,                       // ...어때
    // --- Chinese ---
    /怎么样/,                      // ...怎么样
    /^我们.+吧$/,                  // 我们...吧
    /不如/,                       // 不如...
    // --- Czech ---
    /^co kdybychom/i,            // Co kdybychom...
    /^pojďme/i,                  // Pojďme...
  ];

  // obligation（義務）パターン
  const obligationPatterns = [
    // --- English ---
    /\bmust\b/i,
    /\bhave to\b/i,
    /\bneed to\b/i,
    /\bshould\b/i,
    /\bought to\b/i,
    /\bsupposed to\b/i,
    /\bhad better\b/i,
    // --- Japanese ---
    /しなければ/,
    /しないと/,
    /べき/,
    /なくてはいけない/,
    /すべき/,
    /ねばならない/,
    /なきゃ$/,               // 「行かなきゃ」「やらなきゃ」
    /ないと$/,               // 「勉強しないと」「行かないと」
    // --- Spanish ---
    /\btener que\b/,
    /\btien(e[s]?|en) que\b/,   // tiene que, tienes que, tienen que
    /\bhay que\b/,
    // --- French ---
    /\bil faut\b/,
    /\bdevr(ais|ait|ions|iez|aient)\b/, // devoir条件法
    /\bdoi(s|t|vent)\b/,         // dois, doit, doivent
    // --- German ---
    /\bm[uü]ss(en|t|)\b/,       // müssen, müsst, muss, mussen, musst
    /\bsoll(en|st|te|ten)?\b/,   // sollen, sollst, sollte, sollten, soll
    // --- Italian ---
    /\bdev[oie]\b/,              // devo, deve, devi
    /\bbisogna\b/,
    // --- Portuguese ---
    /\btem que\b/,
    /\bprecis[ao]\b/,            // preciso, precisa
    /\bdeve\b/,
    // --- Korean ---
    /해야/,
    /어야\s?하/,
    /아야\s?하/,
    // --- Chinese ---
    /必须/,
    /应该/,
    // --- Czech ---
    /\bmus[ií](m|[sš]|me|te)?\b/, // musím, musíš, musí, musíme, musite, musim, musis
    /\bm[eě]l[a]?\s?by\b/,       // měl by, měla by, mel by
  ];

  // パターンマッチング（優先度順）
  if (requestPatterns.some(p => p.test(normalized))) return 'request';
  if (confirmationPatterns.some(p => p.test(normalized))) return 'confirmation';
  if (suggestionPatterns.some(p => p.test(normalized))) return 'suggestion';
  if (obligationPatterns.some(p => p.test(normalized))) return 'obligation';

  return 'statement';
}

// modality_classの一貫性チェック
export function checkModalityConsistency(
  originalText: string,
  translatedText: string
): { passed: boolean; reason: string | null } {
  const originalModality = extractModalityClass(originalText);
  const translatedModality = extractModalityClass(translatedText);

  // 元がstatementの場合は緩い判定（statement→何かは自然な変化）
  if (originalModality === 'statement') {
    return { passed: true, reason: null };
  }

  // request/confirmation/suggestion/obligation → statementは意味が変わるので検出
  // 例: 「送ってください」(request) → 「I will send」(statement) は主語と行為の方向が逆転

  // request/confirmationの混同は特に危険
  if (
    (originalModality === 'request' && translatedModality === 'confirmation') ||
    (originalModality === 'confirmation' && translatedModality === 'request')
  ) {
    return {
      passed: false,
      reason: `modality_violation: ${originalModality} → ${translatedModality}`
    };
  }

  // その他のmodality変更もチェック
  if (originalModality !== translatedModality) {
    return {
      passed: false,
      reason: `modality_violation: ${originalModality} → ${translatedModality}`
    };
  }

  return { passed: true, reason: null };
}

export function applyEvaluationWordGuard(
  sourceText: string,
  result: TranslationResult
): TranslationResult {
  if (sourceText.includes('素敵') && !result.reverse_translation.includes('素敵')) {
    return { ...result, risk: 'high' };
  }
  const generalClothingTerms = ['洋服', '服装', '服', 'コーデ', '装い'];
  const explicitDressTerms = ['ドレス', 'ワンピース'];
  const hasGeneralClothing = generalClothingTerms.some(term => sourceText.includes(term));
  const hasExplicitDress = explicitDressTerms.some(term => sourceText.includes(term));
  if (hasGeneralClothing && !hasExplicitDress && /dress/i.test(result.translation)) {
    return { ...result, risk: 'high' };
  }
  return result;
}

// 二重語尾を修正する後処理関数
export function fixDoubleEnding(text: string): string {
  return text
    // カジュアル系（25%付近）
    .replace(/ですねね[。！!]?$/, 'ですね。')
    .replace(/ますねね[。！!]?$/, 'ますね。')
    .replace(/だね[！!]+ですね[。]?$/, 'だね！')
    .replace(/だよ[！!]+ですね[。]?$/, 'だよ！')
    .replace(/よね[！!]+ですね[。]?$/, 'よね！')
    .replace(/じゃん[！!]+ですね[。]?$/, 'じゃん！')
    .replace(/ございますございます/, 'ございます')
    // カジュアル系（75%, 100%用）
    .replace(/だよね?じゃん[！!]*$/, 'じゃん！')
    .replace(/じゃん[！!]*だよね?[！!]*$/, 'じゃん！！')
    .replace(/だよ[！!]+じゃん[！!]*$/, 'じゃん！')
    .replace(/じゃん[！!]+だよ[！!]*$/, 'じゃん！！')
    .replace(/よね[！!]+じゃん[！!]*$/, 'じゃん！')
    .replace(/じゃん[！!]+よね[！!]*$/, 'じゃん！！')
    // カジュアル系の混合パターン
    .replace(/だね[！!]+じゃん[！!]*$/, 'じゃん！')
    .replace(/だよ[！!]+だね[！!]*$/, 'だね！')
    .replace(/よね[！!]+だね[！!]*$/, 'だね！')
    .replace(/だね[！!]+だよ[！!]*$/, 'だよ！')
    .replace(/ですね[。]?だね[！!]*$/, 'だね！')
    .replace(/ますね[。]?だね[！!]*$/, 'だね！')
    // 「よ」+「じゃん」等の二重語尾パターン
    .replace(/よじゃん[！!]*$/, 'じゃん！')
    .replace(/ないよじゃん[！!]*$/, 'ないじゃん！')
    .replace(/だよじゃん[！!]*$/, 'じゃん！')
    .replace(/よ[！!]+じゃん[！!]*$/, 'じゃん！')
    // ビジネス・フォーマル系
    .replace(/ですねでございます[。]?$/, 'でございます。')
    .replace(/ますねでございます[。]?$/, 'でございます。')
    .replace(/ですねございます[。]?$/, 'でございます。')
    .replace(/ですでございます[。]?$/, 'でございます。')
    .replace(/ますでございます[。]?$/, 'でございます。')
    .replace(/ですねですね[。]?$/, 'ですね。')
    .replace(/ますねますね[。]?$/, 'ますね。')
    // ビジネス系の混合パターン
    .replace(/ございますね[。]?でございます[。]?$/, 'でございます。')
    .replace(/でございます[。]?ございますね[。]?$/, 'でございますね。')
    // 「ません」+「です/ございます」の二重語尾パターン
    .replace(/ませんですね[。]?$/, 'ませんね。')
    .replace(/ませんでございます[。]?$/, 'ません。')
    .replace(/ございませんでございます[。]?$/, 'ございません。')
    .replace(/ないねですね[。]?$/, 'ないですね。')
    .replace(/いいえいいえ[、,]?/, 'いいえ、')
    // 汎用パターン（カスタム等で発生する可能性のある二重語尾）
    .replace(/です[。]?です[。]?$/, 'です。')
    .replace(/ます[。]?ます[。]?$/, 'ます。')
    .replace(/ですね[。]?ますね[。]?$/, 'ますね。')
    .replace(/ますね[。]?ですね[。]?$/, 'ですね。');
}

export function applyReverseTranslationGuard(
  sourceLang: string,
  result: TranslationResult
): TranslationResult {
  let reverseText = result.reverse_translation?.trim() ?? '';

  // 日本語以外が原文の場合
  if (sourceLang !== '日本語') {
    // 中国語・韓国語の場合：漢字・ハングルは正常なのでひらがな・カタカナのみチェック
    if (sourceLang === '中国語' || sourceLang === '韓国語') {
      // ひらがな・カタカナが含まれていたら除去
      if (/[ぁ-んァ-ン]/.test(reverseText)) {
        console.warn('[applyReverseTranslationGuard] Japanese kana found in reverse_translation for CJK source:', reverseText);
        const cleanedReverse = reverseText.replace(/[ぁ-んァ-ン]+/g, '').trim();
        return { ...result, reverse_translation: cleanedReverse, risk: 'high' };
      }
      return result;
    }
    // 他の言語（英語、フランス語など）の場合：日本語文字が含まれていたら除去
    if (hasJapaneseCharacters(reverseText)) {
      console.warn('[applyReverseTranslationGuard] Japanese found in reverse_translation for non-Japanese source:', reverseText);
      const cleanedReverse = reverseText.replace(/[ぁ-んァ-ン一-龯！？。、「」『』（）]+/g, '').trim();
      return { ...result, reverse_translation: cleanedReverse, risk: 'high' };
    }
    return result;
  }

  // 日本語→英語の場合：逆翻訳は日本語であるべき
  // 二重語尾を修正
  reverseText = fixDoubleEnding(reverseText);

  if (!reverseText || !hasJapaneseCharacters(reverseText)) {
    return { ...result, reverse_translation: reverseText, risk: 'high' };
  }
  return { ...result, reverse_translation: reverseText };
}

// translationフィールドに日本語が混入していないかチェック
export function applyTranslationLanguageGuard(
  targetLang: string,
  result: TranslationResult
): TranslationResult {
  // ターゲットが日本語・中国語の場合はチェック不要
  // （中国語は漢字をCJK共通で使うため、日本語と区別できない）
  if (targetLang === '日本語' || targetLang === '中国語') {
    return result;
  }
  // translationに日本語が混入していたらrisk=highにする
  // ひらがな・カタカナのみで判定（漢字は中国語と共有のため除外）
  const hasJapanese = /[ぁ-んァ-ン]/.test(result.translation);
  if (hasJapanese) {
    console.warn('[applyTranslationLanguageGuard] Japanese detected in translation:', result.translation);
    // 日本語部分を除去して返す（ひらがな・カタカナのみ除去、漢字は残す）
    const cleanedTranslation = result.translation.replace(/[ぁ-んァ-ン]+/g, '').trim();
    return {
      ...result,
      translation: cleanedTranslation || result.translation,
      risk: 'high'
    };
  }
  return result;
}

// エクスポート（テスト用）
export const _internal = {
  extractModalityClass,
};
