// 多言語テキスト関数（groq.tsから分離）

/**
 * 「〜との違い」を各言語で返す（ISO 639-1 言語コード）
 */
export function getDifferenceFromText(langCode: string, level: number): string {
  const labelMap: Record<string, Record<string, string>> = {
    ja: { '-100': 'もっとカジュアルとの違い', '-50': 'カジュアルとの違い', '0': 'ベースとの違い', '50': 'ていねいとの違い', '100': 'もっとていねいとの違い' },
    en: { '-100': 'Difference from More Casual', '-50': 'Difference from Casual', '0': 'Difference from Base', '50': 'Difference from Polite', '100': 'Difference from More Polite' },
    es: { '-100': 'Diferencia con Más Casual', '-50': 'Diferencia con Casual', '0': 'Diferencia con Base', '50': 'Diferencia con Cortés', '100': 'Diferencia con Formal' },
    fr: { '-100': 'Différence avec Plus Décontracté', '-50': 'Différence avec Décontracté', '0': 'Différence avec Base', '50': 'Différence avec Poli', '100': 'Différence avec Formel' },
    zh: { '-100': '与更随意的差异', '-50': '与随意的差异', '0': '与基础的差异', '50': '与礼貌的差异', '100': '与正式的差异' },
    ko: { '-100': '더 캐주얼과의 차이', '-50': '캐주얼과의 차이', '0': '기본과의 차이', '50': '정중과의 차이', '100': '포멀과의 차이' },
    de: { '-100': 'Unterschied zu Lockerer', '-50': 'Unterschied zu Locker', '0': 'Unterschied zu Basis', '50': 'Unterschied zu Höflich', '100': 'Unterschied zu Formell' },
    it: { '-100': 'Differenza da Più Informale', '-50': 'Differenza da Informale', '0': 'Differenza da Base', '50': 'Differenza da Cortese', '100': 'Differenza da Formale' },
    pt: { '-100': 'Diferença de Mais Casual', '-50': 'Diferença de Casual', '0': 'Diferença de Base', '50': 'Diferença de Educado', '100': 'Diferença de Formal' },
    cs: { '-100': 'Rozdíl od Neformálnější', '-50': 'Rozdíl od Neformální', '0': 'Rozdíl od Základ', '50': 'Rozdíl od Zdvořilý', '100': 'Rozdíl od Formální' },
  }
  const labels = labelMap[langCode] || labelMap['en']
  return labels[String(level)] || `Difference from ${level}%`
}

/**
 * レベル値からUIラベルを返す（プロンプト用・英語固定）
 */
export function getLevelLabel(level: number): string {
  const labels: Record<string, string> = {
    '-100': 'More Casual', '-50': 'Casual', '0': 'Base', '50': 'Polite', '100': 'More Polite',
  }
  return labels[String(level)] || `${level}%`
}

/**
 * 「まだ生成されていません」を各言語で返す（ISO 639-1 言語コード）
 */
export function getNotYetGeneratedText(langCode: string): string {
  switch (langCode) {
    case 'ja': return '前のレベルの翻訳がまだ生成されていません。'
    case 'en': return 'Previous level translation not yet generated.'
    case 'es': return 'La traducción del nivel anterior aún no se ha generado.'
    case 'fr': return 'La traduction du niveau précédent n\'a pas encore été générée.'
    case 'zh': return '上一级别的翻译尚未生成。'
    case 'ko': return '이전 레벨의 번역이 아직 생성되지 않았습니다.'
    case 'de': return 'Die Übersetzung der vorherigen Stufe wurde noch nicht generiert.'
    case 'it': return 'La traduzione del livello precedente non è stata ancora generata.'
    case 'pt': return 'A tradução do nível anterior ainda não foi gerada.'
    case 'cs': return 'Překlad předchozí úrovně ještě nebyl vygenerován.'
    default: return 'Previous level translation not yet generated.'
  }
}

/**
 * 「生成に失敗しました」を各言語で返す（ISO 639-1 言語コード）
 */
export function getFailedToGenerateText(langCode: string): string {
  switch (langCode) {
    case 'ja': return '解説の生成に失敗しました。'
    case 'en': return 'Failed to generate explanation.'
    case 'es': return 'Error al generar la explicación.'
    case 'fr': return 'Échec de la génération de l\'explication.'
    case 'zh': return '生成解释失败。'
    case 'ko': return '설명 생성에 실패했습니다.'
    case 'de': return 'Erklärung konnte nicht generiert werden.'
    case 'it': return 'Impossibile generare la spiegazione.'
    case 'pt': return 'Falha ao gerar a explicação.'
    case 'cs': return 'Generování vysvětlení se nezdařilo.'
    default: return 'Failed to generate explanation.'
  }
}

/**
 * 「変化なし」を各言語で返す（ISO 639-1 言語コード）
 */
export function getNoChangeText(langCode: string): string {
  switch (langCode) {
    case 'ja': return 'このレベルでは前のレベルと同じ表現になりました。'
    case 'en': return 'No change from the previous level.'
    case 'es': return 'Sin cambios respecto al nivel anterior.'
    case 'fr': return 'Pas de changement par rapport au niveau précédent.'
    case 'zh': return '与上一级别相同，没有变化。'
    case 'ko': return '이전 레벨과 동일하여 변화가 없습니다.'
    case 'de': return 'Keine Änderung gegenüber der vorherigen Stufe.'
    case 'it': return 'Nessun cambiamento rispetto al livello precedente.'
    case 'pt': return 'Sem alteração em relação ao nível anterior.'
    case 'cs': return 'Žádná změna oproti předchozí úrovni.'
    default: return 'No change from the previous level.'
  }
}

/**
 * 言語名からISOコードを取得
 */
export function getLangCodeFromName(langName: string): string {
  const map: Record<string, string> = {
    '日本語': 'ja', 'Japanese': 'ja',
    '英語': 'en', 'English': 'en',
    'スペイン語': 'es', 'Spanish': 'es',
    'フランス語': 'fr', 'French': 'fr',
    '中国語': 'zh', 'Chinese': 'zh',
    '韓国語': 'ko', 'Korean': 'ko',
    'ドイツ語': 'de', 'German': 'de',
    'イタリア語': 'it', 'Italian': 'it',
    'ポルトガル語': 'pt', 'Portuguese': 'pt',
    'チェコ語': 'cs', 'Czech': 'cs',
  }
  const result = map[langName]
  if (!result) {
    console.warn(`[getLangCodeFromName] Unknown langName: "${langName}", defaulting to 'en'`)
  }
  return result || 'en'
}

/**
 * ISOコードから英語言語名を取得（AIプロンプト用）
 */
export function getLangNameFromCode(langCode: string): string {
  const map: Record<string, string> = {
    'ja': 'Japanese',
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'zh': 'Chinese',
    'ko': 'Korean',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'cs': 'Czech',
  }
  return map[langCode] || 'English'
}

/**
 * 「豆知識」ラベルを各言語で返す
 */
export function getGrammarLabel(langCode: string): string {
  const map: Record<string, string> = {
    'ja': '豆知識',
    'en': 'Tips',
    'es': 'Consejos',
    'fr': 'Astuces',
    'zh': '小知识',
    'ko': '꿀팁',
    'de': 'Tipps',
    'it': 'Curiosità',
    'pt': 'Dicas',
    'cs': 'Tipy',
  }
  return map[langCode] || 'Grammar'
}

export function getVerifyingText(langCode: string): string {
  const map: Record<string, string> = {
    'ja': '検証中...',
    'en': 'Checking...',
    'es': 'Verificando...',
    'fr': 'Vérification...',
    'zh': '验证中...',
    'ko': '검증 중...',
    'de': 'Prüfung...',
    'it': 'Verifica...',
    'pt': 'Verificando...',
    'cs': 'Ověřování...',
  }
  return map[langCode] || 'Checking...'
}

export function getFixingText(langCode: string): string {
  const map: Record<string, string> = {
    'ja': '修正中...',
    'en': 'Fixing...',
    'es': 'Corrigiendo...',
    'fr': 'Correction...',
    'zh': '修正中...',
    'ko': '수정 중...',
    'de': 'Korrektur...',
    'it': 'Correzione...',
    'pt': 'Corrigindo...',
    'cs': 'Oprava...',
  }
  return map[langCode] || 'Fixing...'
}

export function getNaturalnessCheckLabel(langCode: string): string {
  const map: Record<string, string> = {
    'ja': '文の自然さ ✅',
    'en': 'Natural ✅',
    'es': 'Natural ✅',
    'fr': 'Naturel ✅',
    'zh': '自然度 ✅',
    'ko': '자연스러움 ✅',
    'de': 'Natürlich ✅',
    'it': 'Naturale ✅',
    'pt': 'Natural ✅',
    'cs': 'Přirozené ✅',
  }
  return map[langCode] || 'Natural ✅'
}
