export type LanguageOption = {
  code: string;
  name: string;
  flag: string;
};

export const LANGUAGES_WITH_AUTO: LanguageOption[] = [
  { code: 'auto', name: '自動認識', flag: '🌐' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'en', name: '英語', flag: '🇺🇸' },
  { code: 'fr', name: 'フランス語', flag: '🇫🇷' },
  { code: 'es', name: 'スペイン語', flag: '🇪🇸' },
  { code: 'ko', name: '韓国語', flag: '🇰🇷' },
  { code: 'zh', name: '中国語', flag: '🇨🇳' },
  { code: 'de', name: 'ドイツ語', flag: '🇩🇪' },
  { code: 'it', name: 'イタリア語', flag: '🇮🇹' },
  { code: 'pt', name: 'ポルトガル語', flag: '🇧🇷' },
  { code: 'cs', name: 'チェコ語', flag: '🇨🇿' },
];

export const SOURCE_LANGUAGES = LANGUAGES_WITH_AUTO;
export const TARGET_LANGUAGES = LANGUAGES_WITH_AUTO.filter(l => l.code !== 'auto');

export const LANGUAGE_OPTIONS = TARGET_LANGUAGES;

export const LANG_CODE_MAP: Record<string, string> = {
  '日本語': 'ja-JP',
  '英語': 'en-US',
  'スペイン語': 'es-ES',
  'フランス語': 'fr-FR',
  '中国語': 'zh-CN',
  '韓国語': 'ko-KR',
  'ドイツ語': 'de-DE',
  'イタリア語': 'it-IT',
  'ポルトガル語': 'pt-BR',
  'チェコ語': 'cs-CZ',
};

export function findLanguageByName(name: string): LanguageOption | undefined {
  return LANGUAGES_WITH_AUTO.find(l => l.name === name);
}
