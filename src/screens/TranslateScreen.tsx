import { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  SafeAreaView,
  Keyboard,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Copy, Check, ArrowLeft, Home, Settings, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppData } from '../context/AppDataContext';
import { translateFull, translateFullSimple, translatePartialSpacy, extractStructureSpacy, generateExplanation, generateToneDifferenceExplanation, generateMeaningDefinitions, verifyTranslation, fixMeaningIssues, fixNaturalness, getLangCodeFromName } from '../services/groq';
import { structureToPromptTextSpacy, extractContentWordsForFullGen, extractFlexibleWords, buildMeaningConstraintText } from '../services/prompts';
import type { TranslationResult, ExplanationResult } from '../services/types';
import { getVerifyingText, getFixingText, getNaturalnessCheckLabel, getDifferenceFromText, getNotYetGeneratedText, getFailedToGenerateText, getGrammarLabel } from '../services/i18n';

type RootStackParamList = {
  Home: undefined;
  Translate: { mode: 'receive' | 'send' };
  List: undefined;
  FaceToFace: { partnerId?: number };
};

type Props = NativeStackScreenProps<RootStackParamList, 'Translate'>;

// ═══ メッセージ型 ═══
interface ChatMessage {
  id: number;
  type: 'self' | 'partner';
  original: string;
  translation: string;
  reverseTranslation: string;
  explanation: { point: string; explanation: string } | null;
  detectedLanguage?: string;
}

// ═══ プレビュー型 ═══
interface Preview {
  translation: string;
  reverseTranslation: string;
  explanation: { point: string; explanation: string } | null;
  noChange?: boolean;
}

// ═══ スライダーユーティリティ ═══

function sliderToToneBucket(position: number): { tone: string; bucket: number } {
  if (position < -75) return { tone: 'casual', bucket: 100 };
  if (position < -25) return { tone: 'casual', bucket: 50 };
  if (position <= 25) return { tone: '_base', bucket: 0 };
  if (position <= 75) return { tone: 'business', bucket: 50 };
  return { tone: 'business', bucket: 100 };
}

function getSliderBucket(value: number): number {
  if (value < -75) return -100;
  if (value < -25) return -50;
  if (value <= 25) return 0;
  if (value <= 75) return 50;
  return 100;
}

function getBadgeText(bucket: number): string {
  switch (bucket) {
    case -100: return 'もっとカジュアル';
    case -50: return 'カジュアル';
    case 0: return 'ベース';
    case 50: return 'ていねい';
    case 100: return 'もっとていねい';
    default: return 'ベース';
  }
}

function getBadgeColor(bucket: number): string {
  switch (bucket) {
    case -100: return '#e67e22';
    case -50: return '#f0a050';
    case 0: return '#999';
    case 50: return '#5a8abf';
    case 100: return '#2c5aa0';
    default: return '#999';
  }
}

function getSliderTrackColor(value: number): string {
  if (value < 0) {
    const ratio = Math.abs(value) / 100;
    return `rgb(${Math.round(153 + (230 - 153) * ratio)},${Math.round(153 + (126 - 153) * ratio)},${Math.round(153 + (34 - 153) * ratio)})`;
  }
  const ratio = value / 100;
  return `rgb(${Math.round(153 + (44 - 153) * ratio)},${Math.round(153 + (90 - 153) * ratio)},${Math.round(153 + (160 - 153) * ratio)})`;
}

// 2つの翻訳テキストから変化したキーワードを抽出
function extractChangedParts(prev: string, curr: string): { prev: string; curr: string } | null {
  const normalize = (w: string) => w.toLowerCase().replace(/[.,!?;:'"]/g, '');
  const prevWords = prev.split(/\s+/);
  const currWords = curr.split(/\s+/);
  const minLen = Math.min(prevWords.length, currWords.length);
  let start = 0;
  while (start < minLen && normalize(prevWords[start]) === normalize(currWords[start])) {
    start++;
  }
  if (start >= minLen && prevWords.length === currWords.length) return null;
  let prevFirstEnd = start;
  let currFirstEnd = start;
  const remainPrev = prevWords.slice(start);
  const remainCurr = currWords.slice(start);
  for (let offset = 1; offset <= Math.max(remainPrev.length, remainCurr.length); offset++) {
    if (start + offset < prevWords.length && start + offset < currWords.length &&
        normalize(prevWords[start + offset]) === normalize(currWords[start + offset])) {
      prevFirstEnd = start + offset - 1;
      currFirstEnd = start + offset - 1;
      break;
    }
    prevFirstEnd = Math.min(start + offset, prevWords.length - 1);
    currFirstEnd = Math.min(start + offset, currWords.length - 1);
  }
  const ctxStart = Math.max(0, start - 1);
  const prevCtxEnd = Math.min(prevWords.length - 1, prevFirstEnd + 1);
  const currCtxEnd = Math.min(currWords.length - 1, currFirstEnd + 1);
  return {
    prev: prevWords.slice(ctxStart, prevCtxEnd + 1).join(' '),
    curr: currWords.slice(ctxStart, currCtxEnd + 1).join(' '),
  };
}

// 言語検出用データ
const LANGUAGE_PROFILES: Record<string, string[]> = {
  '日本語': ['は', 'す', 'い', 'す_', 'です', 'ます', '日本', '本語', '日本語', 'こん', 'にち', 'ちは', 'あり', 'がと', 'とう'],
  '英語': ['the', 'is', 'are', 'you', 'to', 'and', 'in', 'it', 'of', 'that', 'have', 'for', 'not', 'with', 'this'],
  'フランス語': ['le', 'la', 'les', 'de', 'est', 'et', 'en', 'un', 'une', 'je', 'vous', 'que', 'ne', 'pas', 'pour'],
  'スペイン語': ['el', 'la', 'de', 'que', 'es', 'en', 'un', 'una', 'los', 'las', 'no', 'por', 'con', 'para', 'se'],
  'ドイツ語': ['der', 'die', 'und', 'in', 'ist', 'das', 'den', 'ich', 'sie', 'es', 'nicht', 'mit', 'ein', 'eine', 'auf'],
  'イタリア語': ['il', 'la', 'di', 'che', 'e', 'un', 'una', 'in', 'per', 'non', 'sono', 'con', 'lo', 'gli', 'le'],
  'ポルトガル語': ['de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'os', 'se'],
  '韓国語': ['요', '니다', '안녕', '하세요', '감사', '합니다', '는', '이', '가', '을', '를', '에', '에서', '와', '과'],
  '中国語': ['的', '是', '了', '在', '有', '我', '他', '她', '你', '们', '这', '那', '好', '中', '文'],
  'チェコ語': ['je', 'se', 'na', 'v', 'a', 'že', 'do', 'pro', 'to', 'ne', 'si', 'tak', 'jak', 'ale', 'co'],
};
const LATIN_FEATURES: Record<string, { unique: string; chars: string; bigrams: string[] }> = {
  'フランス語': { unique: 'çœ', chars: 'çéèêëàâîïôùûüœ', bigrams: ['ai', 'au', 'ou', 'eu', 'oi', 'on', 'an', 'en'] },
  'スペイン語': { unique: 'ñ¿¡', chars: 'áéíóúüñ', bigrams: ['ue', 'ie', 'io', 'ia', 'ei'] },
  'ドイツ語': { unique: 'ß', chars: 'äöüß', bigrams: ['ch', 'sch', 'ei', 'ie', 'au', 'eu'] },
  'イタリア語': { unique: 'ìò', chars: 'àèéìòù', bigrams: ['ch', 'gh', 'sc', 'gn', 'gl'] },
  'ポルトガル語': { unique: 'ãõ', chars: 'áàâãçéêíóôõú', bigrams: ['ão', 'õe', 'ai', 'ei', 'ou'] },
  'チェコ語': { unique: 'řů', chars: 'áčďéěíňóřšťúůýž', bigrams: ['ch', 'st', 'ní', 'tí'] },
  '英語': { unique: '', chars: '', bigrams: [] },
};
const COMMON_WORDS: Record<string, string[]> = {
  '英語': ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'have', 'has', 'this', 'that', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'do', 'does', 'not', 'can', 'will', 'would', 'could', 'should', 'what', 'how', 'why', 'when', 'where', 'who', 'come', 'here', 'there', 'go', 'get', 'make', 'know', 'think', 'take', 'see', 'want', 'just', 'now', 'only', 'very', 'also', 'back', 'after', 'use', 'our', 'out', 'up', 'other', 'into', 'more', 'some', 'time', 'so', 'if', 'no', 'than', 'them', 'then', 'way', 'look', 'first', 'new', 'because', 'day', 'people', 'over', 'such', 'through', 'long', 'little', 'own', 'good', 'man', 'too', 'any', 'same', 'tell', 'work', 'last', 'most', 'need', 'feel', 'high', 'much', 'off', 'old', 'right', 'still', 'mean', 'keep', 'let', 'put', 'did', 'had', 'got'],
  'フランス語': ['le', 'la', 'les', 'un', 'une', 'est', 'sont', 'ai', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'de', 'et', 'en', 'ce', 'cette', 'mon', 'ton', 'son', 'ne', 'pas', 'que', 'qui', 'mais', 'ou', 'donc', 'car', 'comprends', 'comprend', 'suis', 'es', 'fait', 'faire', 'avoir', 'pour', 'avec', 'sur', 'dans', 'par', 'merci', 'beaucoup', 'bonjour', 'bonsoir', 'comment', 'allez', 'bien', 'très', 'oui', 'non'],
  'スペイン語': ['el', 'la', 'los', 'las', 'un', 'una', 'es', 'son', 'yo', 'tu', 'él', 'ella', 'mi', 'su', 'de', 'y', 'en', 'que', 'no', 'tengo', 'tiene', 'pero', 'como', 'para', 'por', 'con', 'entiendo', 'entiende', 'hablo', 'habla', 'puedo', 'puede', 'quiero', 'quiere', 'gracias', 'hola', 'buenos', 'buenas', 'muy', 'bien'],
  'ドイツ語': ['der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'war', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'mein', 'dein', 'sein', 'und', 'mit', 'für', 'auf', 'nicht', 'aber', 'oder', 'wenn', 'wie', 'geht', 'ihnen', 'haben', 'werden', 'kann', 'guten', 'tag', 'morgen', 'danke', 'bitte', 'gut', 'sehr'],
  'イタリア語': ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'e', 'sono', 'ho', 'hai', 'ha', 'io', 'tu', 'lui', 'lei', 'noi', 'di', 'che', 'non', 'ma', 'come', 'per', 'con', 'capisco', 'capisce', 'parlo', 'parla', 'posso', 'voglio', 'bene', 'molto', 'questo', 'quello', 'stai', 'sta', 'sto', 'grazie', 'ciao', 'buongiorno', 'buonasera'],
  'ポルトガル語': ['o', 'a', 'os', 'as', 'um', 'uma', 'são', 'tenho', 'tem', 'eu', 'tu', 'ele', 'ela', 'nós', 'de', 'em', 'que', 'não', 'com', 'para', 'por', 'mas', 'entendo', 'entende', 'falo', 'fala', 'posso', 'pode', 'quero', 'quer', 'muito', 'bem', 'obrigado', 'obrigada', 'bom', 'dia', 'tudo'],
  'チェコ語': ['ten', 'ta', 'to', 'je', 'jsou', 'byl', 'já', 'ty', 'on', 'ona', 'my', 'vy', 'z', 'na', 'v', 'a', 'že', 'do', 'pro', 'ale', 'jak', 'máte', 'mám', 'rozumím', 'mluvím', 'dobrý', 'den', 'děkuji'],
};

function detectLanguage(text: string): string {
  if (!text.trim()) return '';
  const textLower = text.toLowerCase();
  // Stage 1: 固有スクリプト検出（CJK言語）
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return '日本語';
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return '韓国語';
  if (/[\u4E00-\u9FFF]/.test(text)) return '中国語';
  // Stage 2: 拡張特徴文字検出（ラテン系言語）
  const latinScores: Record<string, number> = {};
  for (const [lang, features] of Object.entries(LATIN_FEATURES)) {
    latinScores[lang] = 0;
    for (const char of features.unique) { if (textLower.includes(char)) latinScores[lang] += 5; }
    for (const char of features.chars) { if (textLower.includes(char)) latinScores[lang] += 1; }
    for (const bigram of features.bigrams) { if (textLower.includes(bigram)) latinScores[lang] += 0.5; }
  }
  const maxLatinScore = Math.max(0, ...Object.values(latinScores));
  if (maxLatinScore >= 5) return Object.entries(latinScores).sort((a, b) => b[1] - a[1])[0][0];
  // Stage 3: 単語リスト検出
  const wordScores: Record<string, number> = {};
  const words = textLower.match(/\b\w+\b/g) || [];
  for (const [lang, commonWords] of Object.entries(COMMON_WORDS)) {
    wordScores[lang] = 0;
    for (const word of words) { if (commonWords.includes(word)) wordScores[lang] += 1; }
  }
  for (const lang of Object.keys(wordScores)) { if (latinScores[lang]) wordScores[lang] += latinScores[lang]; }
  const maxWordScore = Math.max(0, ...Object.values(wordScores));
  if (maxWordScore >= 2) {
    const sortedScores = Object.entries(wordScores).sort((a, b) => b[1] - a[1]);
    const [bestLang, bestScore] = sortedScores[0];
    const englishScore = wordScores['英語'] || 0;
    if (bestLang !== '英語' && bestScore > englishScore) return bestLang;
    else if (bestLang === '英語') return '英語';
    if (bestScore >= 2) return bestLang;
  }
  // Stage 4: n-gram統計的検出
  const extractNgrams = (t: string): string[] => {
    const ngrams: Record<string, number> = {};
    const normalized = t.toLowerCase().trim().replace(/\s+/g, ' ');
    for (const n of [1, 2, 3]) {
      const padded = '_'.repeat(n - 1) + normalized + '_'.repeat(n - 1);
      for (let i = 0; i <= padded.length - n; i++) { const ngram = padded.slice(i, i + n); ngrams[ngram] = (ngrams[ngram] || 0) + 1; }
    }
    return Object.entries(ngrams).sort((a, b) => b[1] - a[1]).map(([ng]) => ng);
  };
  const textNgrams = extractNgrams(text);
  const ngramScores: Record<string, number> = {};
  const isLatinOnly = text.split('').every(c => (c.codePointAt(0) || 0) < 0x3000);
  const candidateLangs = isLatinOnly
    ? ['英語', 'フランス語', 'スペイン語', 'ドイツ語', 'イタリア語', 'ポルトガル語', 'チェコ語']
    : Object.keys(LANGUAGE_PROFILES);
  for (const lang of candidateLangs) {
    const profile = LANGUAGE_PROFILES[lang];
    if (!profile) continue;
    let score = 0;
    const profileSet = new Set(profile);
    for (let i = 0; i < Math.min(textNgrams.length, 30); i++) {
      if (profileSet.has(textNgrams[i])) score += Math.max(0, profile.length - profile.indexOf(textNgrams[i]));
    }
    if (latinScores[lang]) score *= (1 + latinScores[lang] * 0.1);
    ngramScores[lang] = score;
  }
  const totalScore = Object.values(ngramScores).reduce((a, b) => a + b, 0);
  if (totalScore > 0) return Object.entries(ngramScores).sort((a, b) => b[1] - a[1])[0][0];
  return '英語';
}

const PROMPT_VERSION = '2026-02-11-phase2d-fix3';
const UI_TONE_LEVELS = [0, 50, 100];

function getCacheKey(
  tone: string | null,
  toneBucket: number,
  sourceText: string,
  customToneText?: string,
  sourceLang?: string,
  targetLang?: string,
): string {
  const normalizedTone = tone || 'none';
  const customPart = tone === 'custom' && customToneText ? `_${customToneText}` : '';
  const langPart = `${sourceLang || 'auto'}->${targetLang || 'unknown'}`;
  return `${PROMPT_VERSION}|${langPart}|${sourceText}|${normalizedTone}_${toneBucket}${customPart}`;
}

// ═══ 言語リスト ═══

const LANGUAGES = [
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

// ソース言語用（自動認識含む）
const SOURCE_LANGUAGES = LANGUAGES;
// ターゲット言語用（自動認識なし）
const TARGET_LANGUAGES = LANGUAGES.filter(l => l.code !== 'auto');

function getLangCodeForExplanation(langName: string): string {
  const found = LANGUAGES.find(l => l.name === langName);
  return found?.code === 'auto' ? 'en' : (found?.code || 'en');
}

// ═══ カスタムトーン プリセット ═══
const CUSTOM_PRESETS = [
  { label: '限界オタク', value: '限界オタク' },
  { label: '赤ちゃん言葉', value: '赤ちゃん言葉' },
  { label: 'オジサン構文', value: 'オジサン構文' },
  { label: 'ギャル', value: 'ギャル' },
];

// ═══ メインコンポーネント ═══

export default function TranslateScreen({ route, navigation }: Props) {
  const { mode } = route.params;
  const { translateDraft, setTranslateDraft } = useAppData();
  const [activeMode, setActiveMode] = useState<'receive' | 'send'>(mode);
  const isPartnerMode = activeMode === 'receive';
  const isSelfMode = activeMode === 'send';

  // ── トークメニュー ──
  const [showTalkMenu, setShowTalkMenu] = useState(false);

  // ── メッセージボード（コンテキストで永続化） ──
  const messages = translateDraft.messages as ChatMessage[];
  const setMessages = (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    if (typeof updater === 'function') {
      setTranslateDraft((prev) => ({ messages: updater(prev.messages as ChatMessage[]) }));
    } else {
      setTranslateDraft({ messages: updater });
    }
  };
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // ── 言語選択（モード別に独立） ──
  const [partnerSourceLang, setPartnerSourceLang] = useState('自動認識');
  const [partnerTargetLang, setPartnerTargetLang] = useState('日本語');
  const [selfSourceLang, setSelfSourceLang] = useState('自動認識');
  const [selfTargetLang, setSelfTargetLang] = useState('英語');
  const sourceLang = isPartnerMode ? partnerSourceLang : selfSourceLang;
  const setSourceLang = isPartnerMode ? setPartnerSourceLang : setSelfSourceLang;
  const targetLang = isPartnerMode ? partnerTargetLang : selfTargetLang;
  const setTargetLang = isPartnerMode ? setPartnerTargetLang : setSelfTargetLang;
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [langModalTarget, setLangModalTarget] = useState<'source' | 'target'>('source');
  const detectedLang = translateDraft.detectedLang;
  const setDetectedLang = (lang: string) => setTranslateDraft({ detectedLang: lang });
  const selfTargetLangManuallySet = useRef(false);

  // ── 入力（Web版と同じ: コンテキストで永続化、画面遷移しても消えない） ──
  const partnerInputText = translateDraft.partnerInputText;
  const selfInputText = translateDraft.selfInputText;
  const setPartnerInputText = (text: string) => setTranslateDraft({ partnerInputText: text });
  const setSelfInputText = (text: string) => setTranslateDraft({ selfInputText: text });
  const inputText = isPartnerMode ? partnerInputText : selfInputText;
  const setInputText = isPartnerMode ? setPartnerInputText : setSelfInputText;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── プレビュー（コンテキストで永続化） ──
  const showPreview = translateDraft.showPreview;
  const setShowPreview = (v: boolean) => setTranslateDraft({ showPreview: v });
  const preview = translateDraft.preview as Preview;
  const setPreview = (v: Preview | ((prev: Preview) => Preview)) => {
    if (typeof v === 'function') {
      setTranslateDraft((prev) => ({ preview: v(prev.preview as Preview) }));
    } else {
      setTranslateDraft({ preview: v });
    }
  };

  // ── スライダー（コンテキストで永続化） ──
  const sliderValue = translateDraft.sliderValue;
  const setSliderValue = (v: number) => setTranslateDraft({ sliderValue: v });
  const sliderBucket = translateDraft.sliderBucket;
  const setSliderBucket = (v: number) => setTranslateDraft({ sliderBucket: v });
  const toneAdjusted = translateDraft.toneAdjusted;
  const setToneAdjusted = (v: boolean) => setTranslateDraft({ toneAdjusted: v });
  const [toneLoading, setToneLoading] = useState(false);

  // ── トーン差分解説（コンテキストで永続化） ──
  const toneDiffExplanation = translateDraft.toneDiffExplanation as ExplanationResult | null;
  const setToneDiffExplanation = (v: ExplanationResult | null) => setTranslateDraft({ toneDiffExplanation: v });
  const [toneDiffLoading, setToneDiffLoading] = useState(false);
  const [toneDiffExpanded, setToneDiffExpanded] = useState(false);

  // ── カスタムトーン（コンテキストで永続化） ──
  const customTone = translateDraft.customTone;
  const setCustomTone = (v: string) => setTranslateDraft({ customTone: v });
  const [showCustomInput, setShowCustomInput] = useState(false);
  const isCustomActive = translateDraft.isCustomActive;
  const setIsCustomActive = (v: boolean) => setTranslateDraft({ isCustomActive: v });

  // ── ロック（コンテキストで永続化 + AsyncStorageからも復元） ──
  const lockedSliderPosition = translateDraft.lockedSliderPosition;
  const setLockedSliderPosition = (v: number | null) => setTranslateDraft({ lockedSliderPosition: v });

  // 起動時にAsyncStorageからロック位置を復元（初回のみ）
  useEffect(() => {
    if (lockedSliderPosition === null) {
      AsyncStorage.getItem('nijilingo_locked_slider_position').then(val => {
        if (val !== null) setLockedSliderPosition(JSON.parse(val));
      }).catch(() => {});
    }
  }, []);

  // ── コピーフィードバック ──
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);

  // ── プレビュー固定ソーステキスト（コンテキストで永続化） ──
  const previewSourceText = translateDraft.previewSourceText;
  const setPreviewSourceText = (v: string) => setTranslateDraft({ previewSourceText: v });

  // ── 検証API状態 ──
  const [verificationStatus, setVerificationStatus] = useState<Record<string, 'verifying' | 'fixing' | 'passed' | null>>({});

  // ── キャッシュ（contextから取得、ナビゲーション跨ぎで永続化） ──
  const translationCacheRef = useRef(translateDraft.translationCache);
  const explanationCacheRef = useRef(translateDraft.explanationCache);
  // context→refの同期
  translationCacheRef.current = translateDraft.translationCache;
  explanationCacheRef.current = translateDraft.explanationCache;
  // useEffectトリガー用のstate（translationCacheの変更検知用）
  const [translationCacheVersion, setTranslationCacheVersion] = useState(0);

  // ── Refs ──
  const prevBucketRef = useRef(0);

  // ── キャッシュ到着時の自動プレビュー更新 ──
  useEffect(() => {
    if (!previewSourceText.trim()) return;
    const { tone, bucket } = sliderToToneBucket(sliderBucket);
    if (isCustomActive) return;
    const effectiveSourceLang = sourceLang === '自動認識' ? (detectedLang || '日本語') : sourceLang;
    const key = getCacheKey(tone, bucket, previewSourceText, undefined, effectiveSourceLang, targetLang);
    const cached = translationCacheRef.current[key];
    if (!cached) return;
    if (cached.translation === preview.translation && cached.reverseTranslation === preview.reverseTranslation && cached.noChange === preview.noChange) return;
    setPreview(prev => ({ ...prev, translation: cached.translation, reverseTranslation: cached.reverseTranslation, noChange: cached.noChange }));
  }, [sliderBucket, isCustomActive, previewSourceText, translationCacheVersion]);

  // ── トーン差分解説リセット（初回マウント時はスキップ） ──
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    setToneDiffExplanation(null);
    setToneDiffExpanded(false);
  }, [sliderBucket, isCustomActive, previewSourceText]);

  // ── キャッシュ更新ヘルパー（context永続化） ──
  const updateTranslationCache = (updates: Record<string, { translation: string; reverseTranslation: string; noChange?: boolean }>) => {
    setTranslateDraft((prev) => ({
      translationCache: { ...prev.translationCache, ...updates },
    }));
    setTranslationCacheVersion(v => v + 1);
  };

  // ── コピー関数 ──
  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setShowCopiedToast(true);
    setTimeout(() => setShowCopiedToast(false), 2000);
  };

  // ── ペースト関数 ──
  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setInputText(text);
  };

  // ══════════════════════════════════════════════
  // 検証・修正（fire-and-forget）
  // ══════════════════════════════════════════════

  const verifyAndFixOneBand = (params: {
    bandKey: string;
    tone: string;
    bucket: number;
    originalText: string;
    translation: string;
    reverseTranslation?: string;
    meaningDefinitions: Record<string, string>;
    sourceText: string;
    sourceLang: string;
    targetLang: string;
  }) => {
    const { bandKey, tone, bucket, originalText, translation, reverseTranslation, meaningDefinitions, sourceText, sourceLang, targetLang } = params;

    const applyFix = (fixed: { translation: string; reverse_translation: string }) => {
      const cacheKey = getCacheKey(tone, bucket, sourceText, undefined, sourceLang, targetLang);
      updateTranslationCache({
        [cacheKey]: { translation: fixed.translation, reverseTranslation: fixed.reverse_translation }
      });
      const currentToneBucket = sliderToToneBucket(sliderValue);
      if (currentToneBucket.tone === tone && currentToneBucket.bucket === bucket) {
        setPreview(prev => ({ ...prev, translation: fixed.translation, reverseTranslation: fixed.reverse_translation }));
      }
      // noChange整合性維持
      const otherBucket = bucket === 50 ? 100 : 50;
      const otherKey = getCacheKey(tone, otherBucket, sourceText, undefined, sourceLang, targetLang);
      const cachedOther = translationCacheRef.current[otherKey];
      if (cachedOther && cachedOther.translation === fixed.translation) {
        const updates: Record<string, { translation: string; reverseTranslation: string; noChange: boolean }> = {};
        updates[otherKey] = { translation: cachedOther.translation, reverseTranslation: fixed.reverse_translation, noChange: true };
        updates[cacheKey] = { translation: fixed.translation, reverseTranslation: fixed.reverse_translation, noChange: true };
        updateTranslationCache(updates);
      } else if (bucket === 50 && cachedOther) {
        // 50%が変わったので100%のnoChangeを再判定
        const newNoChange = cachedOther.translation === fixed.translation;
        if (cachedOther.noChange !== newNoChange) {
          updateTranslationCache({
            [otherKey]: { ...cachedOther, noChange: newNoChange }
          });
        }
      }
    };

    void (async () => {
      try {
        setVerificationStatus(prev => ({ ...prev, [bandKey]: 'verifying' }));
        const result = await verifyTranslation({ originalText, translation, reverseTranslation, meaningDefinitions, tone: `${tone} ${bucket}%` });
        const actionableIssues = (result.issues || []).filter((i: { severity: string }) => i.severity === 'high' || i.severity === 'medium');
        if (actionableIssues.length === 0) {
          setVerificationStatus(prev => ({ ...prev, [bandKey]: 'passed' }));
          return;
        }
        const meaningIssues = actionableIssues.filter((i: { type: string }) => i.type !== 'unnatural' && i.type !== 'reverse_subject' && i.type !== 'reverse_unnatural');
        const naturalIssues = actionableIssues.filter((i: { type: string }) => i.type === 'unnatural' || i.type === 'reverse_subject' || i.type === 'reverse_unnatural');
        setVerificationStatus(prev => ({ ...prev, [bandKey]: 'fixing' }));
        let currentTranslation = translation;
        if (meaningIssues.length > 0) {
          const fixed = await fixMeaningIssues({ originalText, translation: currentTranslation, issues: meaningIssues, sourceLang, targetLang, tone, bucket });
          currentTranslation = fixed.translation;
          applyFix(fixed);
        }
        if (naturalIssues.length > 0) {
          const fixed = await fixNaturalness({ originalText, translation: currentTranslation, issues: naturalIssues, sourceLang, targetLang, tone, bucket });
          applyFix(fixed);
        }
        setVerificationStatus(prev => ({ ...prev, [bandKey]: 'passed' }));
      } catch {
        setVerificationStatus(prev => ({ ...prev, [bandKey]: null }));
      }
    })();
  };

  // ══════════════════════════════════════════════
  // generateAndCacheUiBuckets（ベース翻訳 + Partial生成）
  // ══════════════════════════════════════════════

  const generateAndCacheUiBuckets = async (params: {
    tone: string;
    sourceText: string;
    targetLang: string;
    sourceLang: string;
    customToneOverride?: string;
    skipPartial?: boolean;
  }) => {
    const { tone, sourceText, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang, customToneOverride, skipPartial } = params;

    const customToneValue = typeof customToneOverride === 'string' ? customToneOverride : tone === 'custom' ? customTone : undefined;

    // キャッシュチェック: 全レベルがあればスキップ
    const allCached = UI_TONE_LEVELS.every((bucket) => {
      const key = getCacheKey(tone, bucket, sourceText, customToneValue, effectiveSourceLang, effectiveTargetLang);
      return Boolean(translationCacheRef.current[key]);
    });
    if (allCached) return;

    const cacheBucket = (bucket: number, result: TranslationResult, noChange?: boolean) => {
      const cacheKey = getCacheKey(tone, bucket, sourceText, customToneValue, effectiveSourceLang, effectiveTargetLang);
      updateTranslationCache({ [cacheKey]: { translation: result.translation, reverseTranslation: result.reverse_translation, noChange } });
    };

    // custom は FULL一発を共有
    if (tone === 'custom') {
      const result = await translateFull({ sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, isNative: false, customTone: customToneValue });
      UI_TONE_LEVELS.forEach((b) => cacheBucket(b, result));
      return;
    }

    // ベース翻訳キャッシュ共有
    const baseCacheKey = getCacheKey('_base', 0, sourceText, undefined, effectiveSourceLang, effectiveTargetLang);
    const cachedBase = translationCacheRef.current[baseCacheKey];
    let fullResult: TranslationResult;

    if (cachedBase) {
      fullResult = { translation: cachedBase.translation, reverse_translation: cachedBase.reverseTranslation } as TranslationResult;
    } else {
      const sourceLangCode = getLangCodeFromName(effectiveSourceLang);
      const sourceSpacyResult = await extractStructureSpacy(sourceText, sourceLangCode);
      const contentWordsForFull = extractContentWordsForFullGen(sourceSpacyResult);
      fullResult = await translateFullSimple({ sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, contentWords: contentWordsForFull || undefined });
      updateTranslationCache({ [baseCacheKey]: { translation: fullResult.translation, reverseTranslation: sourceText } });
    }

    const base0Result = { ...fullResult, reverse_translation: sourceText } as TranslationResult;
    cacheBucket(0, base0Result);

    if (skipPartial) return;

    // spaCy構造抽出
    const targetLangCode = getLangCodeFromName(effectiveTargetLang);
    const spacyResult = await extractStructureSpacy(fullResult.translation, targetLangCode);
    const baseStructureText = structureToPromptTextSpacy(spacyResult);

    // meaning定義生成
    const flexWords = extractFlexibleWords(spacyResult);
    const definitions = await generateMeaningDefinitions(sourceText, fullResult.translation, flexWords, effectiveSourceLang);
    const meaningConstraint = buildMeaningConstraintText(definitions);

    // Partial 50%
    const partial50 = await translatePartialSpacy({
      baseTranslation: fullResult.translation, structureText: baseStructureText,
      tone, toneLevel: 50, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang,
      originalText: sourceText, meaningConstraint,
    });

    // Partial 100%（50%テキスト参照）
    const partial100 = await translatePartialSpacy({
      baseTranslation: fullResult.translation, structureText: baseStructureText,
      tone, toneLevel: 100, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang,
      originalText: sourceText, referenceTranslation: partial50.translation, meaningConstraint,
    });

    // noChange判定つきでキャッシュ
    const noChange50 = partial50.translation === fullResult.translation;
    const noChange100 = partial100.translation === (noChange50 ? fullResult.translation : partial50.translation);
    const result50 = noChange50 ? { ...partial50, reverse_translation: sourceText } as TranslationResult : partial50 as TranslationResult;
    const result100 = noChange100 ? { ...partial100, reverse_translation: noChange50 ? sourceText : partial50.reverse_translation } as TranslationResult : partial100 as TranslationResult;
    cacheBucket(50, result50, noChange50);
    cacheBucket(100, result100, noChange100);

    // 検証（fire-and-forget）
    if (!noChange50) {
      verifyAndFixOneBand({ bandKey: `${tone}_50`, tone, bucket: 50, originalText: sourceText, translation: partial50.translation, reverseTranslation: partial50.reverse_translation, meaningDefinitions: definitions, sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang });
    }
    if (!noChange100) {
      verifyAndFixOneBand({ bandKey: `${tone}_100`, tone, bucket: 100, originalText: sourceText, translation: partial100.translation, reverseTranslation: partial100.reverse_translation, meaningDefinitions: definitions, sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang });
    }
  };

  // ══════════════════════════════════════════════
  // generateAllToneAdjustments（全4帯並列生成）
  // ══════════════════════════════════════════════

  const generateAllToneAdjustments = async (params: {
    sourceText: string;
    targetLang: string;
    sourceLang: string;
  }) => {
    const { sourceText } = params;
    const effectiveTargetLang = params.targetLang;
    const effectiveSourceLang = params.sourceLang;

    const makeCacheKey = (tone: string, bucket: number) =>
      getCacheKey(tone, bucket, sourceText, undefined, effectiveSourceLang, effectiveTargetLang);

    const cacheResult = (tone: string, bucket: number, result: TranslationResult, noChange?: boolean) => {
      updateTranslationCache({ [makeCacheKey(tone, bucket)]: { translation: result.translation, reverseTranslation: result.reverse_translation, noChange } });
    };

    // 全4帯キャッシュ済みならスキップ
    const requiredKeys = [makeCacheKey('casual', 50), makeCacheKey('casual', 100), makeCacheKey('business', 50), makeCacheKey('business', 100)];
    if (requiredKeys.every(key => Boolean(translationCacheRef.current[key]))) return;

    // ベース翻訳
    const baseCacheKey = makeCacheKey('_base', 0);
    const cachedBase = translationCacheRef.current[baseCacheKey];
    let fullResult: TranslationResult;

    if (cachedBase) {
      fullResult = { translation: cachedBase.translation, reverse_translation: cachedBase.reverseTranslation } as TranslationResult;
    } else {
      const sourceLangCode = getLangCodeFromName(effectiveSourceLang);
      const sourceSpacyResult = await extractStructureSpacy(sourceText, sourceLangCode);
      const contentWordsForFull = extractContentWordsForFullGen(sourceSpacyResult);
      fullResult = await translateFullSimple({ sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, contentWords: contentWordsForFull || undefined });
      updateTranslationCache({ [baseCacheKey]: { translation: fullResult.translation, reverseTranslation: sourceText } });
    }

    cacheResult('casual', 0, { ...fullResult, reverse_translation: sourceText } as TranslationResult);
    cacheResult('business', 0, { ...fullResult, reverse_translation: sourceText } as TranslationResult);

    // spaCy構造抽出
    const targetLangCode = getLangCodeFromName(effectiveTargetLang);
    const spacyResult = await extractStructureSpacy(fullResult.translation, targetLangCode);
    const baseStructureText = structureToPromptTextSpacy(spacyResult);

    // meaning定義生成
    const flexWords = extractFlexibleWords(spacyResult);
    const definitions = await generateMeaningDefinitions(sourceText, fullResult.translation, flexWords, effectiveSourceLang);
    const meaningConstraint = buildMeaningConstraintText(definitions);

    // Step 3: 並列生成 (casual 50% + business 50%)
    const [casual50, business50] = await Promise.all([
      translatePartialSpacy({ baseTranslation: fullResult.translation, structureText: baseStructureText, tone: 'casual', toneLevel: 50, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang, originalText: sourceText, meaningConstraint }),
      translatePartialSpacy({ baseTranslation: fullResult.translation, structureText: baseStructureText, tone: 'business', toneLevel: 50, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang, originalText: sourceText, meaningConstraint }),
    ]);

    // Step 3.5: noChangeリトライ
    let finalCasual50 = casual50;
    let finalBusiness50 = business50;
    const retryPromises: Promise<void>[] = [];

    if (casual50.translation === fullResult.translation) {
      retryPromises.push(
        translateFullSimple({ sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, meaningConstraint, toneInstruction: `Rewrite as if writing a casual email to a friend.\nHere is the base translation for reference — make yours more casual than this:\n"${fullResult.translation}"\nKeep the same meaning, but you are free to use completely different words and phrasing.`, tone: 'casual' }).then(result => { finalCasual50 = result; })
      );
    }
    if (business50.translation === fullResult.translation) {
      retryPromises.push(
        translateFullSimple({ sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, meaningConstraint, toneInstruction: `Write in a polite and respectful tone. Use courteous expressions appropriate for the target language. Do not replace everyday vocabulary with literary or archaic words.\nHere is the base translation for reference — make yours more formal than this:\n"${fullResult.translation}"`, tone: 'business' }).then(result => { finalBusiness50 = result; })
      );
    }
    if (retryPromises.length > 0) await Promise.all(retryPromises);

    // Step 4: 100%並列生成
    const [casual100Full, business100] = await Promise.all([
      translateFullSimple({ sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, meaningConstraint, toneInstruction: `Translate as if texting a close friend. Be more casual than the 50% version below — use slang, abbreviations, and a relaxed tone.\nHere is the 50% casual version — make yours noticeably more casual:\n"${finalCasual50.translation}"\nKeep the same meaning, but you are free to use completely different words and phrasing.`, tone: 'casual' }),
      translatePartialSpacy({ baseTranslation: fullResult.translation, structureText: baseStructureText, tone: 'business', toneLevel: 100, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang, originalText: sourceText, referenceTranslation: finalBusiness50.translation, fallbackToPreviousLevel: finalBusiness50, meaningConstraint }),
    ]);

    // Step 4.5: business 100% noChangeリトライ
    let finalBusiness100 = business100;
    const bus100Ref = finalBusiness50.translation === fullResult.translation ? fullResult.translation : finalBusiness50.translation;
    if (business100.translation === bus100Ref) {
      finalBusiness100 = await translateFullSimple({ sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, meaningConstraint, toneInstruction: `Write in a highly polite and formal tone. Use courteous expressions, honorifics, and refined sentence structure appropriate for the target language. Do not replace everyday vocabulary with literary or archaic words.\nHere is the 50% business version for reference — make yours more formal than this:\n"${finalBusiness50.translation}"`, tone: 'business' });
    }

    // Step 5: 全結果をキャッシュ
    const noChangeCas50 = finalCasual50.translation === fullResult.translation;
    const noChangeCas100 = casual100Full.translation === (noChangeCas50 ? fullResult.translation : finalCasual50.translation);
    const noChangeBus50 = finalBusiness50.translation === fullResult.translation;
    const noChangeBus100 = finalBusiness100.translation === (noChangeBus50 ? fullResult.translation : finalBusiness50.translation);

    const makeCachedResult = (result: { translation: string; reverse_translation: string }, noChange: boolean, prevReverseTranslation: string) =>
      noChange ? { ...result, reverse_translation: prevReverseTranslation } as TranslationResult : result as TranslationResult;

    cacheResult('casual', 50, makeCachedResult(finalCasual50, noChangeCas50, sourceText), noChangeCas50);
    cacheResult('casual', 100, makeCachedResult(casual100Full, noChangeCas100, noChangeCas50 ? sourceText : finalCasual50.reverse_translation), noChangeCas100);
    cacheResult('business', 50, makeCachedResult(finalBusiness50, noChangeBus50, sourceText), noChangeBus50);
    cacheResult('business', 100, makeCachedResult(finalBusiness100, noChangeBus100, noChangeBus50 ? sourceText : finalBusiness50.reverse_translation), noChangeBus100);

    // Step 6: 検証（fire-and-forget）
    const verifyParams = { sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang };
    if (!noChangeCas50) verifyAndFixOneBand({ bandKey: 'casual_50', tone: 'casual', bucket: 50, originalText: sourceText, translation: finalCasual50.translation, reverseTranslation: finalCasual50.reverse_translation, meaningDefinitions: definitions, ...verifyParams });
    if (!noChangeCas100) verifyAndFixOneBand({ bandKey: 'casual_100', tone: 'casual', bucket: 100, originalText: sourceText, translation: casual100Full.translation, reverseTranslation: casual100Full.reverse_translation, meaningDefinitions: definitions, ...verifyParams });
    if (!noChangeBus50) verifyAndFixOneBand({ bandKey: 'business_50', tone: 'business', bucket: 50, originalText: sourceText, translation: finalBusiness50.translation, reverseTranslation: finalBusiness50.reverse_translation, meaningDefinitions: definitions, ...verifyParams });
    if (!noChangeBus100) verifyAndFixOneBand({ bandKey: 'business_100', tone: 'business', bucket: 100, originalText: sourceText, translation: finalBusiness100.translation, reverseTranslation: finalBusiness100.reverse_translation, meaningDefinitions: definitions, ...verifyParams });
  };

  // ★ バックグラウンドトーン先行生成（fire-and-forget）
  const preGenerateToneAdjustments = (params: { sourceText: string; targetLang: string; sourceLang: string }) => {
    generateAllToneAdjustments(params).catch(error => {
      console.warn('[preGenerateToneAdjustments] バックグラウンド生成エラー:', error);
    });
  };

  // ══════════════════════════════════════════════
  // partnerモード: 翻訳 → メッセージボードに直接追加
  // ══════════════════════════════════════════════

  const handlePartnerTranslate = async () => {
    if (!inputText.trim()) return;
    Keyboard.dismiss();

    setLoading(true);
    setError(null);
    const sourceText = inputText;
    const msgId = Date.now();

    // 翻訳中プレースホルダーを先に追加
    const placeholderMsg: ChatMessage = {
      id: msgId,
      type: 'partner',
      original: sourceText,
      translation: '翻訳中...',
      reverseTranslation: '',
      explanation: null,
    };
    setMessages(prev => [...prev, placeholderMsg]);
    setInputText('');
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    // クライアント側言語検出 + 言語連動
    const detected = sourceLang === '自動認識' ? detectLanguage(sourceText) : sourceLang;
    if (detected) setDetectedLang(detected);
    if (!selfTargetLangManuallySet.current && detected) {
      setTargetLang(detected);
    }

    try {
      const result = await translateFull({
        sourceText,
        sourceLang: detected || sourceLang,
        targetLang,
        isNative: false,
        tone: 'casual',
        toneLevel: 50,
      });

      // 検出言語を表示 + 言語連動
      if (result.detected_language) {
        setDetectedLang(result.detected_language);
        if (!selfTargetLangManuallySet.current) {
          setTargetLang(result.detected_language);
        }
      }

      // プレースホルダーを結果で更新
      setMessages(prev => prev.map(m =>
        m.id === msgId ? {
          ...m,
          translation: result.translation,
        } : m
      ));

      // 自動スクロール
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      // バックグラウンドで解説取得（原文sourceTextを渡す — Web版と同じ）
      const tgtCode = getLangCodeForExplanation(targetLang);
      const srcCode = getLangCodeForExplanation(sourceLang === '自動認識' ? (result.detected_language || '英語') : sourceLang);
      generateExplanation(sourceText, tgtCode, srcCode, tgtCode)
        .then(exp => {
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, explanation: exp } : m
          ));
        })
        .catch(() => {});
    } catch (err) {
      // エラー時はメッセージを更新（削除せず保持）
      setMessages(prev => prev.map(m =>
        m.id === msgId
          ? {
              ...m,
              translation: '（翻訳エラー）',
              explanation: { point: '', explanation: 'エラーが発生しました' },
            }
          : m
      ));
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // selfモード: 翻訳 → プレビュー表示
  // ══════════════════════════════════════════════

  const handleSelfTranslate = async () => {
    if (!inputText.trim()) return;
    Keyboard.dismiss();

    const sourceText = inputText.trim();
    setPreviewSourceText(sourceText);

    // クライアント側言語検出（Web版と同じ）
    const detected = sourceLang === '自動認識' ? detectLanguage(sourceText) : sourceLang;
    if (detected) setDetectedLang(detected);

    const effectiveSourceLang = sourceLang === '自動認識' ? (detected || '自動認識') : sourceLang;
    const effectiveTargetLang = targetLang;
    const isLocked = lockedSliderPosition !== null;

    // キャッシュチェック（ベース）
    const baseCacheKey = getCacheKey('_base', 0, sourceText, undefined, effectiveSourceLang, effectiveTargetLang);
    const baseCached = translationCacheRef.current[baseCacheKey];

    if (baseCached && !isLocked) {
      // ベースキャッシュヒット → 即座に表示
      setPreview(prev => ({ ...prev, translation: baseCached.translation, reverseTranslation: baseCached.reverseTranslation, noChange: baseCached.noChange }));
      setShowPreview(true);
      setToneAdjusted(false);
      setSliderValue(0);
      setSliderBucket(0);
      prevBucketRef.current = 0;
      preGenerateToneAdjustments({ sourceText, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang });
      return;
    }

    setLoading(true);
    setError(null);
    setShowPreview(false);
    setToneAdjusted(false);
    setShowCustomInput(false);
    setIsCustomActive(false);
    setSliderValue(0);
    setSliderBucket(0);
    prevBucketRef.current = 0;
    setToneDiffExplanation(null);
    setToneDiffExpanded(false);

    try {
      if (isLocked) {
        // ★ ロック時: ベース + 全4段階を一気に生成
        await generateAllToneAdjustments({ sourceText, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang });
        setToneAdjusted(true);
        const { tone, bucket } = sliderToToneBucket(lockedSliderPosition!);
        const lockedBucket = getSliderBucket(lockedSliderPosition!);
        setSliderValue(lockedSliderPosition!);
        setSliderBucket(lockedBucket);
        prevBucketRef.current = lockedBucket;
        const lockKey = getCacheKey(tone, bucket, sourceText, undefined, effectiveSourceLang, effectiveTargetLang);
        const lockCached = translationCacheRef.current[lockKey];
        if (lockCached) {
          setPreview(prev => ({ ...prev, translation: lockCached.translation, reverseTranslation: lockCached.reverseTranslation, noChange: lockCached.noChange }));
        }
      } else {
        // ★ 通常時: ベース翻訳のみ → バックグラウンドで4帯先行生成
        await generateAndCacheUiBuckets({ tone: '_base', sourceText, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang, skipPartial: true });
        const newBaseCached = translationCacheRef.current[baseCacheKey];
        if (newBaseCached) {
          setPreview(prev => ({ ...prev, translation: newBaseCached.translation, reverseTranslation: newBaseCached.reverseTranslation, noChange: newBaseCached.noChange }));
        }
        preGenerateToneAdjustments({ sourceText, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang });
      }
      setShowPreview(true);

      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻訳に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // selfモード: コピー＆送信（メッセージボードに追加）
  // ══════════════════════════════════════════════

  const handleSelfSend = async () => {
    if (!showPreview) return;

    await copyToClipboard(preview.translation);

    const msgId = Date.now();
    const newMsg: ChatMessage = {
      id: msgId,
      type: 'self',
      original: inputText || previewSourceText,
      translation: preview.translation,
      reverseTranslation: preview.reverseTranslation,
      explanation: null,
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setShowPreview(false);
    setToneAdjusted(false);
    setShowCustomInput(false);
    setIsCustomActive(false);

    // 自動スクロール
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    // バックグラウンドで解説取得
    const srcCode = getLangCodeForExplanation(sourceLang === '自動認識' ? (detectedLang || '日本語') : sourceLang);
    const tgtCode = getLangCodeForExplanation(targetLang);
    generateExplanation(preview.translation, srcCode, tgtCode, srcCode)
      .then(exp => {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, explanation: exp } : m
        ));
      })
      .catch(() => {});
  };

  // ══════════════════════════════════════════════
  // ニュアンス調整ボタン
  // ══════════════════════════════════════════════

  const handleToneAdjust = async () => {
    if (!previewSourceText.trim() || !showPreview) return;

    // カスタムモードを解除
    setIsCustomActive(false);
    setShowCustomInput(false);

    const sourceText = previewSourceText;
    const effectiveSourceLang = sourceLang === '自動認識' ? (detectedLang || '日本語') : sourceLang;
    const effectiveTargetLang = targetLang;

    // 全4帯キャッシュ済みチェック
    const allCached = [
      getCacheKey('casual', 50, sourceText, undefined, effectiveSourceLang, effectiveTargetLang),
      getCacheKey('casual', 100, sourceText, undefined, effectiveSourceLang, effectiveTargetLang),
      getCacheKey('business', 50, sourceText, undefined, effectiveSourceLang, effectiveTargetLang),
      getCacheKey('business', 100, sourceText, undefined, effectiveSourceLang, effectiveTargetLang),
    ].every(key => Boolean(translationCacheRef.current[key]));

    if (allCached) {
      // ★ 全キャッシュ済み → 即座にスライダー表示
      setToneAdjusted(true);
      setSliderValue(0);
      setSliderBucket(0);
      prevBucketRef.current = 0;
      return;
    }

    setToneLoading(true);
    setError(null);

    try {
      await generateAllToneAdjustments({ sourceText, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang });
      setToneAdjusted(true);
      setSliderValue(0);
      setSliderBucket(0);
      prevBucketRef.current = 0;
    } catch {
      setError('ニュアンス調整中にエラーが発生しました');
    } finally {
      setToneLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // スライダー操作
  // ══════════════════════════════════════════════

  // ドラッグ中: バケット跨ぎで即プレビュー更新 + 触覚FB（Web版と同じ）
  const handleSliderChange = (value: number) => {
    setSliderValue(value);
    const newBucket = getSliderBucket(value);
    if (newBucket !== prevBucketRef.current) {
      const prev = prevBucketRef.current;
      prevBucketRef.current = newBucket;
      setSliderBucket(newBucket);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      console.log('[Slider] bucket changed:', prev, '->', newBucket);
      updatePreviewFromSlider(newBucket);
    }
  };

  // スライダー変更時（キャッシュ参照のみ — APIは呼ばない）
  const updatePreviewFromSlider = (sliderPosition: number) => {
    if (!previewSourceText.trim()) return;
    const { tone, bucket } = sliderToToneBucket(sliderPosition);
    const effectiveSourceLang = sourceLang === '自動認識' ? (detectedLang || '日本語') : sourceLang;
    const cacheKey = getCacheKey(tone, bucket, previewSourceText, undefined, effectiveSourceLang, targetLang);
    const cached = translationCacheRef.current[cacheKey];
    if (cached) {
      setPreview(prev => ({ ...prev, translation: cached.translation, reverseTranslation: cached.reverseTranslation, noChange: cached.noChange }));
    }
  };

  // ドラッグ完了: スナップ位置にセット
  const handleSliderComplete = (value: number) => {
    const bucket = getSliderBucket(value);
    setSliderValue(bucket);
    setSliderBucket(bucket);
    prevBucketRef.current = bucket;
    updatePreviewFromSlider(bucket);
  };

  // ── 差分解説取得（Web版と同じ: handleToneDiffExplanation） ──
  const handleToneDiffExplanation = async () => {
    // 既に展開中なら閉じる
    if (toneDiffExpanded) {
      setToneDiffExpanded(false);
      return;
    }

    const { tone: currentTone, bucket: currentInternalBucket } = sliderToToneBucket(sliderBucket);
    const effectiveSourceLang = sourceLang === '自動認識' ? (detectedLang || '日本語') : sourceLang;
    const effectiveTargetLang = targetLang;

    // 解説キャッシュキー
    const explCacheKey = `${previewSourceText}__${sliderBucket}`;

    // キャッシュにあればAPI呼び出しせずに表示
    if (explanationCacheRef.current[explCacheKey]) {
      setToneDiffExplanation(explanationCacheRef.current[explCacheKey]);
      setToneDiffExpanded(true);
      return;
    }

    // ベース(0)の場合は「この文の伝わり方」を解説
    if (sliderBucket === 0) {
      if (!preview.translation) {
        setToneDiffExplanation({ point: 'この文の伝わり方', explanation: '翻訳がまだ生成されていません。' });
        setToneDiffExpanded(true);
        return;
      }
      setToneDiffLoading(true);
      setToneDiffExpanded(true);
      const sourceLangCode0 = getLangCodeFromName(effectiveSourceLang);
      const targetLangCode0 = getLangCodeFromName(effectiveTargetLang);
      try {
        const explanation = await generateExplanation(preview.translation, sourceLangCode0, targetLangCode0, sourceLangCode0);
        const result = { point: explanation.point || getDifferenceFromText(sourceLangCode0, 0), explanation: explanation.explanation };
        setTranslateDraft((prev) => ({ explanationCache: { ...prev.explanationCache, [explCacheKey]: result } }));
        setToneDiffExplanation(result);
      } catch {
        setToneDiffExplanation({ point: getDifferenceFromText(sourceLangCode0, 0), explanation: getFailedToGenerateText(sourceLangCode0) });
      } finally {
        setToneDiffLoading(false);
      }
      return;
    }

    // 1つ前のトーンを計算
    const getPreviousTone = (tone: string, bucket: number): { tone: string; bucket: number } => {
      if (tone === 'casual' && bucket === 100) return { tone: 'casual', bucket: 50 };
      if (tone === 'casual' && bucket === 50) return { tone: '_base', bucket: 0 };
      if (tone === 'business' && bucket === 50) return { tone: '_base', bucket: 0 };
      if (tone === 'business' && bucket === 100) return { tone: 'business', bucket: 50 };
      return { tone: '_base', bucket: 0 };
    };

    const prev = getPreviousTone(currentTone, currentInternalBucket);
    const prevKey = getCacheKey(prev.tone, prev.bucket, previewSourceText, undefined, effectiveSourceLang, effectiveTargetLang);
    const currKey = getCacheKey(currentTone, currentInternalBucket, previewSourceText, undefined, effectiveSourceLang, effectiveTargetLang);
    const prevCached = translationCacheRef.current[prevKey];
    const currCached = translationCacheRef.current[currKey];
    const sourceLangCode = getLangCodeFromName(effectiveSourceLang);
    const prevUiBucket = prev.tone === 'casual' ? -prev.bucket : prev.tone === 'business' ? prev.bucket : 0;

    if (!prevCached || !currCached) {
      setToneDiffExplanation({ point: getDifferenceFromText(sourceLangCode, prevUiBucket), explanation: getNotYetGeneratedText(sourceLangCode) });
      setToneDiffExpanded(true);
      return;
    }

    setToneDiffLoading(true);
    setToneDiffExpanded(true);
    try {
      const keywords = extractChangedParts(prevCached.translation, currCached.translation);
      const explanation = await generateToneDifferenceExplanation(
        prevCached.translation, currCached.translation, prevUiBucket, currentInternalBucket, currentTone, sourceLangCode, keywords ?? undefined
      );
      setTranslateDraft((prev) => ({ explanationCache: { ...prev.explanationCache, [explCacheKey]: explanation } }));
      setToneDiffExplanation(explanation);
    } catch {
      setToneDiffExplanation({ point: getDifferenceFromText(sourceLangCode, prevUiBucket), explanation: getFailedToGenerateText(sourceLangCode) });
    } finally {
      setToneDiffLoading(false);
    }
  };

  // ── 解説テキストのnuance/grammar分離+ハイライト表示（Web版と同じ） ──
  const renderExplanationWithSplit = (text: string) => {
    const sepParts = text.split(/\n---\n|^---\n|\n---$/m);
    let nuance: string, grammar: string;
    if (sepParts.length >= 2) {
      nuance = sepParts[0].trim();
      grammar = sepParts.slice(1).join('\n').trim();
    } else {
      const splitMatch = text.match(/^(.*?。)\s*([\s\S]+)$/) || text.match(/^(.*?\.\s)([A-Z「][\s\S]+)$/);
      nuance = splitMatch ? splitMatch[1] : text;
      grammar = splitMatch ? splitMatch[2] : '';
    }
    const langCode = getLangCodeFromName(detectedLang || '日本語');
    return (
      <>
        {nuance ? (
          <View style={styles.nuanceTipBox}>
            <Text selectable style={styles.explanationDetailText}>{renderWithHighlight(nuance)}</Text>
          </View>
        ) : null}
        {grammar ? (
          <View style={styles.grammarTipBox}>
            <Text style={styles.grammarTipLabel}>{getGrammarLabel(langCode)}</Text>
            <Text selectable style={styles.grammarTipText}>{renderWithHighlight(grammar)}</Text>
          </View>
        ) : null}
      </>
    );
  };

  // 「」内をハイライト表示するヘルパー（Web版renderWithHighlight相当）
  const renderWithHighlight = (text: string): React.ReactNode => {
    const parts = text.split(/(「[^」]+」)/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      const match = part.match(/^「(.+)」$/);
      if (match) {
        return <Text key={i} style={styles.grammarHighlight}>{match[1]}</Text>;
      }
      return part;
    });
  };

  // ══════════════════════════════════════════════
  // カスタムトーン
  // ══════════════════════════════════════════════

  const handleCustomToggle = () => {
    if (isCustomActive) {
      setIsCustomActive(false);
      setShowCustomInput(false);
      // プレビューは維持（Web版と同じ）
    } else {
      setIsCustomActive(true);
      setShowCustomInput(true);
      // toneAdjustedは維持（Web版と同じ: カスタム解除でスライダー即復帰）
      setToneDiffExplanation(null);
      setToneDiffExpanded(false);
    }
  };

  const handleCustomTranslate = async (toneText: string) => {
    if (!toneText.trim() || !previewSourceText.trim()) return;

    setToneLoading(true);
    try {
      await generateAndCacheUiBuckets({
        tone: 'custom',
        sourceText: previewSourceText,
        targetLang,
        sourceLang: sourceLang === '自動認識' ? '自動認識' : sourceLang,
        customToneOverride: toneText,
      });
      // キャッシュから結果を表示（Web版と同じ: custom = bucket 100）
      const cacheKey = getCacheKey('custom', 100, previewSourceText, toneText, sourceLang === '自動認識' ? '自動認識' : sourceLang, targetLang);
      const cached = translationCacheRef.current[cacheKey];
      if (cached) {
        setPreview(prev => ({ ...prev, translation: cached.translation, reverseTranslation: cached.reverseTranslation }));
      }
    } catch {
      setError('カスタムトーン翻訳に失敗しました');
    } finally {
      setToneLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // ロック
  // ══════════════════════════════════════════════

  const handleLockToggle = () => {
    if (lockedSliderPosition !== null) {
      setLockedSliderPosition(null);
      AsyncStorage.removeItem('nijilingo_locked_slider_position').catch(() => {});
    } else {
      setLockedSliderPosition(sliderBucket);
      AsyncStorage.setItem('nijilingo_locked_slider_position', JSON.stringify(sliderBucket)).catch(() => {});
    }
  };

  // ══════════════════════════════════════════════
  // メッセージ描画
  // ══════════════════════════════════════════════

  const renderMessage = (msg: ChatMessage) => {
    const isSelf = msg.type === 'self';
    const isExpanded = expandedId === msg.id;

    return (
      <View key={msg.id} style={[styles.messageRow, isSelf ? styles.messageRowSelf : styles.messageRowPartner]}>
        <View style={[styles.messageBubble, isSelf ? styles.bubbleSelf : styles.bubblePartner]}>
          {/* メインテキスト */}
          <Text selectable style={styles.messageText}>
            {isSelf ? msg.translation : msg.original}
          </Text>

          {/* 逆翻訳 */}
          <Text selectable style={styles.messageSubText}>
            （{isSelf ? msg.reverseTranslation : msg.translation}）
          </Text>

          {/* 解説トグル＆コピーアイコン行 */}
          <View style={styles.bubbleActionsRow}>
            <TouchableOpacity
              onPress={() => {
                setExpandedId(isExpanded ? null : msg.id);
                if (!isExpanded) {
                  setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
                }
              }}
              style={styles.explanationToggle}
            >
              <Text style={[styles.explanationToggleText, isSelf ? styles.toggleSelf : styles.togglePartner]}>
                {isExpanded ? '▲ 解説を閉じる' : '▼ 解説'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const textToCopy = isSelf ? msg.translation : msg.original;
                copyToClipboard(textToCopy);
                setCopiedMessageId(msg.id);
                setTimeout(() => setCopiedMessageId(null), 2000);
              }}
              style={styles.bubbleCopyBtn}
            >
              {copiedMessageId === msg.id ? (
                <Check size={14} color={isSelf ? '#6366f1' : '#9CA3AF'} strokeWidth={2.5} />
              ) : (
                <Copy size={14} color={isSelf ? '#6366f1' : '#9CA3AF'} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>

          {/* 展開された解説 */}
          {isExpanded && (
            <View style={[styles.explanationBox, isSelf ? styles.explanationSelf : styles.explanationPartner]}>
              {msg.explanation ? (
                <>
                  {msg.explanation.point ? (
                    <LinearGradient
                      colors={['#FFF9E6', '#FFF3CD']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.explanationPointRow}
                    >
                      <Text style={styles.pointIcon}>💡</Text>
                      <Text style={[styles.pointText, !isSelf && styles.pointTextPartner]}>{msg.explanation.point}</Text>
                    </LinearGradient>
                  ) : null}
                  <Text selectable style={styles.explanationDetailText}>{msg.explanation.explanation}</Text>
                </>
              ) : (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#6b7280" />
                  <Text style={styles.loadingText}>解説を読み込み中...</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  // ══════════════════════════════════════════════
  // 描画
  // ══════════════════════════════════════════════

  const hasTranslationResult = showPreview && Boolean(preview.translation.trim());

  return (
    <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* ── ロゴヘッダー ── */}
      <View style={styles.logoHeader}>
        <Text style={styles.appTitle}>NijiLingo</Text>
        <Text style={styles.rainbowDot}>.</Text>
      </View>

      {/* ── アクション行（Web版と同じ: トーク、トークルーム、対面モード、設定） ── */}
      <View style={styles.actionRow}>
        <View>
          <TouchableOpacity
            onPress={() => setShowTalkMenu(!showTalkMenu)}
            disabled={messages.length === 0}
            style={messages.length === 0 ? styles.actionBtnDisabled : undefined}
          >
            <LinearGradient
              colors={['#B5EAD7', '#C7CEEA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionBtn}
            >
              <Text style={styles.actionBtnText}>💬 トーク</Text>
            </LinearGradient>
          </TouchableOpacity>
          {showTalkMenu && (
            <View style={styles.talkMenuDropdown}>
              <TouchableOpacity
                style={styles.talkMenuItem}
                onPress={() => { setShowTalkMenu(false); }}
              >
                <Text style={styles.talkMenuItemText}>💾 トーク保存</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.talkMenuItem}
                onPress={() => { setMessages([]); setShowTalkMenu(false); }}
              >
                <Text style={[styles.talkMenuItemText, styles.talkMenuDanger]}>🗑 トーク消去</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('List')}>
          <LinearGradient
            colors={['#B5EAD7', '#C7CEEA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>📋 トークルーム</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('FaceToFace', {})}>
          <LinearGradient
            colors={['#B5EAD7', '#C7CEEA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>🎤 対面モード</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => {}}
        >
          <Settings size={20} color="#333" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
      {showTalkMenu && (
        <TouchableOpacity
          style={styles.talkMenuBackdrop}
          activeOpacity={1}
          onPress={() => setShowTalkMenu(false)}
        />
      )}

      {/* ── メッセージボード ── */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesArea}
        contentContainerStyle={messages.length === 0 ? styles.messagesEmpty : styles.messagesContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>翻訳したメッセージがここに表示されます</Text>
          </View>
        ) : (
          messages.map(renderMessage)
        )}
      </ScrollView>

      {/* ── エラー表示 ── */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ selfモード: プレビュー ═══ */}
      {isSelfMode && showPreview && (
        toneDiffExpanded ? (
        <ScrollView style={[styles.previewContainer, styles.previewContainerExpanded]} nestedScrollEnabled>
          <View style={styles.previewLabelRow}>
            <Text style={styles.previewLabel}>翻訳プレビュー</Text>
            {preview.noChange && <Text style={{ color: '#888', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>（変化なし）</Text>}
            {(() => {
              const tb = sliderToToneBucket(sliderBucket);
              const bk = `${tb.tone}_${tb.bucket}`;
              const vs = verificationStatus[bk];
              const lc = getLangCodeFromName(detectedLang || '日本語');
              return vs === 'fixing'
                ? <Text style={{ color: '#e67e22', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>{getFixingText(lc)}</Text>
                : vs === 'verifying'
                  ? <Text style={{ color: '#888', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>{getVerifyingText(lc)}</Text>
                  : vs === 'passed'
                    ? <Text style={{ color: '#4CAF50', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>{getNaturalnessCheckLabel(lc)}</Text>
                    : null;
            })()}
            {toneLoading && <ActivityIndicator size="small" color="#4A90D9" style={{ marginLeft: 8 }} />}
          </View>
          <Text selectable style={styles.previewTranslation}>{preview.translation}</Text>
          <Text selectable style={styles.previewReverse}>逆翻訳：{preview.reverseTranslation}</Text>

          {!isCustomActive && (
            <View style={styles.toneDiffSection}>
              <TouchableOpacity
                onPress={handleToneDiffExplanation}
                style={styles.explanationToggle}
              >
                <Text style={[styles.explanationToggleText, styles.toggleSelf]}>
                  ▲ 解説を閉じる
                </Text>
              </TouchableOpacity>

              <View style={[styles.explanationBox, styles.explanationSelf]}>
                {toneDiffLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#6b7280" />
                    <Text style={styles.loadingText}>解説を生成中...</Text>
                  </View>
                ) : toneDiffExplanation ? (
                  <>
                    {toneDiffExplanation.point ? (
                      <LinearGradient
                        colors={['#FFF9E6', '#FFF3CD']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.explanationPointRow}
                      >
                        <Text style={styles.pointIcon}>💡</Text>
                        <Text style={styles.pointText}>{toneDiffExplanation.point}</Text>
                      </LinearGradient>
                    ) : null}
                    {renderExplanationWithSplit(toneDiffExplanation.explanation)}
                  </>
                ) : null}
              </View>
            </View>
          )}
        </ScrollView>
        ) : (
        <View style={styles.previewContainer}>
          <View style={styles.previewLabelRow}>
            <Text style={styles.previewLabel}>翻訳プレビュー</Text>
            {preview.noChange && <Text style={{ color: '#888', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>（変化なし）</Text>}
            {(() => {
              const tb = sliderToToneBucket(sliderBucket);
              const bk = `${tb.tone}_${tb.bucket}`;
              const vs = verificationStatus[bk];
              const lc = getLangCodeFromName(detectedLang || '日本語');
              return vs === 'fixing'
                ? <Text style={{ color: '#e67e22', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>{getFixingText(lc)}</Text>
                : vs === 'verifying'
                  ? <Text style={{ color: '#888', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>{getVerifyingText(lc)}</Text>
                  : vs === 'passed'
                    ? <Text style={{ color: '#4CAF50', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>{getNaturalnessCheckLabel(lc)}</Text>
                    : null;
            })()}
            {toneLoading && <ActivityIndicator size="small" color="#4A90D9" style={{ marginLeft: 8 }} />}
          </View>
          <Text selectable style={styles.previewTranslation}>{preview.translation}</Text>
          <Text selectable style={styles.previewReverse}>逆翻訳：{preview.reverseTranslation}</Text>

          {!isCustomActive && (
            <View style={styles.toneDiffSection}>
              <TouchableOpacity
                onPress={handleToneDiffExplanation}
                style={styles.explanationToggle}
              >
                <Text style={[styles.explanationToggleText, styles.toggleSelf]}>
                  ▼ 解説
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        )
      )}

      {/* ═══ 入力エリア ═══ */}
      {isPartnerMode ? (
        <View style={[styles.inputArea, styles.inputAreaPartner]}>
          {/* セクションヘッダー: ←🏠戻る + 言語セレクター */}
          <View style={styles.sectionHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.collapseBtn}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <ArrowLeft size={18} color="#333" strokeWidth={2.5} />
                <Home size={14} color="#333" strokeWidth={2.5} />
              </View>
            </TouchableOpacity>
            <View style={styles.langSelectorsCompact}>
              <TouchableOpacity
                style={styles.langSelectCompact}
                onPress={() => { setLangModalTarget('source'); setLangModalVisible(true); }}
              >
                <View style={styles.langSelectInner}>
                  <Text style={styles.langSelectText}>
                    {sourceLang === '自動認識' && detectedLang
                      ? `${LANGUAGES.find(l => l.name === detectedLang)?.flag || '🌐'} ${detectedLang}（自動検出）`
                      : `${LANGUAGES.find(l => l.name === sourceLang)?.flag || '🌐'} ${sourceLang}`}
                  </Text>
                  <ChevronDown size={12} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
              <Text style={styles.langArrowCompact}>→</Text>
              <TouchableOpacity
                style={styles.langSelectCompact}
                onPress={() => { setLangModalTarget('target'); setLangModalVisible(true); }}
              >
                <View style={styles.langSelectInner}>
                  <Text style={styles.langSelectText}>
                    {LANGUAGES.find(l => l.name === targetLang)?.flag} {targetLang}
                  </Text>
                  <ChevronDown size={12} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          {/* テキスト入力行（selfモードと同じ配置: InputWrapper内にペースト、外に翻訳） */}
          <View style={styles.inputRow}>
            <View style={styles.translateInputWrapper}>
              <TextInput
                style={styles.inputInWrapper}
                placeholder="相手のメッセージを貼り付け..."
                placeholderTextColor="#9CA3AF"
                value={inputText}
                onChangeText={(text) => { setInputText(text); setShowPreview(false); }}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                onPress={handlePaste}
                style={{ alignSelf: 'flex-end', marginBottom: 4 }}
              >
                <LinearGradient
                  colors={['#FFB7B2', '#FFDAC1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.convertBtn}
                >
                  <Text style={styles.convertBtnText}>ペースト</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handlePartnerTranslate}
              disabled={loading || !inputText.trim()}
              style={(loading || !inputText.trim()) ? styles.btnDisabled : undefined}
            >
              <LinearGradient
                colors={['#B5EAD7', '#C7CEEA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendBtn}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#333" />
                ) : (
                  <Text style={styles.sendBtnText}>翻訳</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          {/* フッター行（検出言語 + モード切替） */}
          <View style={styles.inputFooterRow}>
            <TouchableOpacity
              onPress={() => setActiveMode('send')}
              style={styles.modeSwitchBtn}
            >
              <Text style={styles.modeSwitchBtnText}>✍️ 送る文章へ</Text>
            </TouchableOpacity>
            {detectedLang && sourceLang === '自動認識' && (
              <Text style={styles.detectedLangText}>検出: {detectedLang}</Text>
            )}
          </View>
        </View>
      ) : (
        <View style={[styles.inputArea, styles.inputAreaSelf]}>
          {/* selfモード: セクションヘッダー（←🏠 + 言語セレクター） */}
          <View style={styles.sectionHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.collapseBtn}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <ArrowLeft size={18} color="#333" strokeWidth={2.5} />
                <Home size={14} color="#333" strokeWidth={2.5} />
              </View>
            </TouchableOpacity>
            <View style={styles.langSelectorsCompact}>
              <TouchableOpacity
                style={styles.langSelectCompact}
                onPress={() => { setLangModalTarget('source'); setLangModalVisible(true); }}
              >
                <View style={styles.langSelectInner}>
                  <Text style={styles.langSelectText}>
                    {sourceLang === '自動認識' && detectedLang
                      ? `${LANGUAGES.find(l => l.name === detectedLang)?.flag || '🌐'} ${detectedLang}（自動検出）`
                      : `${LANGUAGES.find(l => l.name === sourceLang)?.flag || '🌐'} ${sourceLang}`}
                  </Text>
                  <ChevronDown size={12} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
              <Text style={styles.langArrowCompact}>→</Text>
              <TouchableOpacity
                style={styles.langSelectCompact}
                onPress={() => { setLangModalTarget('target'); setLangModalVisible(true); }}
              >
                <View style={styles.langSelectInner}>
                  <Text style={styles.langSelectText}>
                    {LANGUAGES.find(l => l.name === targetLang)?.flag} {targetLang}
                  </Text>
                  <ChevronDown size={12} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* selfモード: 大きいtextarea + 翻訳ボタン + 確定ボタン（Web版と同じ配置） */}
          <View style={styles.inputRow}>
            <View style={styles.translateInputWrapper}>
              <TextInput
                style={styles.inputInWrapper}
                placeholder="メッセージを入力..."
                placeholderTextColor="#9CA3AF"
                value={inputText}
                onChangeText={(text) => { setInputText(text); setShowPreview(false); }}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                onPress={handleSelfTranslate}
                disabled={loading || !inputText.trim()}
                style={[(loading || !inputText.trim()) ? styles.btnDisabled : undefined, { alignSelf: 'flex-end', marginBottom: 4 }]}
              >
                <LinearGradient
                  colors={['#E2F0CB', '#B5EAD7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.convertBtn}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#333" />
                  ) : (
                    <Text style={styles.convertBtnText}>翻訳</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleSelfSend}
              disabled={!showPreview}
              style={!showPreview ? styles.btnDisabled : undefined}
            >
              <LinearGradient
                colors={['#d4a5c9', '#b8c4e0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendBtn}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Copy size={14} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.sendBtnText}>確定</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* selfモード: フッター行（モード切替 + 検出言語） */}
          <View style={styles.selfFooterRow}>
            <TouchableOpacity
              onPress={() => {
                setActiveMode('receive');
                setShowPreview(false);
                setToneAdjusted(false);
                setIsCustomActive(false);
              }}
              style={styles.modeSwitchBtn}
            >
              <Text style={styles.modeSwitchBtnText}>📨 翻訳へ</Text>
            </TouchableOpacity>
            {detectedLang && sourceLang === '自動認識' && (
              <Text style={styles.detectedLangText}>検出: {detectedLang}</Text>
            )}
          </View>
        </View>
      )}

      {/* ═══ selfモード: ニュアンス調整エリア（翻訳結果が出た後に表示） ═══ */}
      {isSelfMode && showPreview && (
        <View style={styles.nuanceContainer}>
          {/* スライダー（ニュアンス調整がアクティブな時のみ） */}
          {toneAdjusted && !isCustomActive && (
            <View style={styles.sliderContainer}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderTitle}>ニュアンス調整</Text>
                <View style={[styles.badge, { backgroundColor: getBadgeColor(sliderBucket) }]}>
                  <Text style={styles.badgeText}>{getBadgeText(sliderBucket)}</Text>
                </View>
                <View style={{ flex: 1 }} />
              </View>

              <View style={styles.sliderRow}>
                <Text style={styles.sliderEmoji}>😎</Text>
                <View style={styles.sliderTrack}>
                  <Slider
                    style={styles.slider}
                    minimumValue={-100}
                    maximumValue={100}
                    step={1}
                    value={sliderValue}
                    onValueChange={handleSliderChange}
                    onSlidingComplete={handleSliderComplete}
                    minimumTrackTintColor={getSliderTrackColor(sliderValue)}
                    maximumTrackTintColor="#e8eaef"
                    thumbTintColor="#FFFFFF"
                    disabled={loading || toneLoading}
                  />
                </View>
                <Text style={styles.sliderEmoji}>🎩</Text>
              </View>

              <View style={styles.dotsRow}>
                {[-100, -50, 0, 50, 100].map((point) => (
                  <View
                    key={point}
                    style={[
                      styles.dot,
                      sliderBucket === point && { backgroundColor: getBadgeColor(point) },
                    ]}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ニュアンス調整 / カスタム / ロック ボタン行 */}
          <View style={styles.toneActionsRow}>
            <TouchableOpacity
              onPress={handleToneAdjust}
              disabled={!hasTranslationResult || loading || toneLoading}
              style={[styles.toneBtnOuter, (!hasTranslationResult || loading || toneLoading) && styles.btnDisabled]}
            >
              <LinearGradient
                colors={toneAdjusted && !isCustomActive ? ['#667eea', '#764ba2'] : ['#B5EAD7', '#C7CEEA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.toneBtn, toneAdjusted && !isCustomActive && styles.toneBtnActive]}
              >
                <Text style={[styles.toneBtnText, toneAdjusted && !isCustomActive && styles.toneBtnTextActive]}>
                  🎨 ニュアンス調整
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCustomToggle}
              disabled={!hasTranslationResult || loading || toneLoading}
              style={[styles.toneBtnOuter, (!hasTranslationResult || loading || toneLoading) && styles.btnDisabled]}
            >
              <LinearGradient
                colors={['#fdf2f8', '#fce7f3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.customBtn, isCustomActive && styles.customBtnActive]}
              >
                <Text style={styles.customBtnText}>
                  カスタム
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.lockBtn, lockedSliderPosition !== null && styles.lockBtnActive]}
              onPress={handleLockToggle}
              disabled={!toneAdjusted && lockedSliderPosition === null}
            >
              <Text style={styles.lockBtnText}>
                {lockedSliderPosition !== null ? '🔒' : '🔓'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* カスタムトーン入力 */}
          {showCustomInput && (
            <View style={styles.customContainer}>
              {/* プリセット */}
              <View style={styles.presetRow}>
                {CUSTOM_PRESETS.map(preset => (
                  <TouchableOpacity
                    key={preset.value}
                    style={styles.presetBtn}
                    onPress={() => {
                      setCustomTone(preset.value);
                      handleCustomTranslate(preset.value);
                    }}
                  >
                    <Text style={styles.presetBtnText}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 自由入力 */}
              <View style={styles.customInputRow}>
                <TextInput
                  style={styles.customInput}
                  placeholder="例：ラッパー風、ジャイアンっぽく"
                  placeholderTextColor="#9CA3AF"
                  value={customTone}
                  onChangeText={setCustomTone}
                />
                <TouchableOpacity
                  style={[styles.customTranslateBtn, (!customTone.trim() || toneLoading) && styles.btnDisabled]}
                  onPress={() => handleCustomTranslate(customTone)}
                  disabled={!customTone.trim() || toneLoading}
                >
                  {toneLoading ? (
                    <ActivityIndicator size="small" color="#333" />
                  ) : (
                    <Text style={styles.customTranslateBtnText}>翻訳</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── コピー完了トースト ── */}
      {showCopiedToast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>✓ クリップボードにコピーしました</Text>
        </View>
      )}

      {/* ── 言語選択モーダル ── */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {langModalTarget === 'source' ? '翻訳元の言語' : '翻訳先の言語'}
            </Text>
            <FlatList
              data={langModalTarget === 'source' ? SOURCE_LANGUAGES : TARGET_LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => {
                const currentValue = langModalTarget === 'source' ? sourceLang : targetLang;
                const isSelected = item.name === currentValue;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                    onPress={() => {
                      if (langModalTarget === 'source') {
                        setSourceLang(item.name);
                      } else {
                        setTargetLang(item.name);
                        selfTargetLangManuallySet.current = true;
                      }
                      setLangModalVisible(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>
                      {item.flag}  {item.name}
                    </Text>
                    {isSelected && <Text style={styles.modalCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setLangModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════
// スタイル
// ══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F7F2',
  },
  // ── ロゴヘッダー ──
  logoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  appTitle: {
    fontFamily: 'Quicksand_700Bold',
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    letterSpacing: -0.5,
  },
  rainbowDot: {
    fontFamily: 'Quicksand_700Bold',
    fontSize: 24,
    fontWeight: '700',
    color: '#B5EAD7',
  },

  // ── アクション行（Web版translate-action-row） ──
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    zIndex: 10,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'Quicksand_600SemiBold',
  },
  settingsBtn: {
    marginLeft: 'auto',
    padding: 8,
  },
  talkMenuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9,
  },
  talkMenuDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    minWidth: 140,
    zIndex: 100,
  },
  talkMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  talkMenuItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    fontFamily: 'Quicksand_500Medium',
  },
  talkMenuDanger: {
    color: '#e74c3c',
  },

  // ── メッセージボード ──
  messagesArea: {
    flex: 1,
    backgroundColor: '#F9F7F2',
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messagesEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    fontFamily: 'Quicksand_400Regular',
  },

  // ── メッセージ行 ──
  messageRow: {
    flexDirection: 'row',
  },
  messageRowSelf: {
    justifyContent: 'flex-end',
  },
  messageRowPartner: {
    justifyContent: 'flex-start',
  },

  // ── バブル ──
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 18,
    padding: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  bubbleSelf: {
    backgroundColor: '#E3FDFD',
    borderBottomRightRadius: 6,
    shadowColor: '#4A5568',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  bubblePartner: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
    shadowColor: '#4A5568',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  messageText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
    lineHeight: 21,
    marginBottom: 2,
    fontFamily: 'Quicksand_600SemiBold',
  },
  messageSubText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
    marginTop: 2,
    fontFamily: 'Quicksand_500Medium',
  },

  // ── バブルアクション行 ──
  bubbleActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  bubbleCopyBtn: {
    padding: 4,
    borderRadius: 6,
    opacity: 0.6,
  },

  // ── 解説 ──
  explanationToggle: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  explanationToggleText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Quicksand_600SemiBold',
  },
  toggleSelf: {
    color: '#6366f1',
  },
  togglePartner: {
    color: '#9CA3AF',
  },
  explanationBox: {
    marginTop: 10,
    borderRadius: 12,
    padding: 12,
  },
  explanationSelf: {
    backgroundColor: 'rgba(99,102,241,0.1)',
  },
  explanationPartner: {
    backgroundColor: '#F3F4F6',
  },
  explanationPointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  pointIcon: {
    fontSize: 14,
    fontFamily: 'Quicksand_400Regular',
  },
  pointText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#333333',
    lineHeight: 20,
    fontFamily: 'Quicksand_700Bold',
  },
  pointTextPartner: {
    color: '#2D5A7B',
  },
  explanationDetailText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 24,
    fontFamily: 'Quicksand_400Regular',
  },
  nuanceTipBox: {
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  grammarTipBox: {
    backgroundColor: '#f8f9fc',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#7B8EC2',
  },
  grammarTipLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginBottom: 6,
    backgroundColor: '#7B8EC2',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    fontFamily: 'Quicksand_700Bold',
  },
  grammarTipText: {
    fontSize: 13,
    color: '#4A5578',
    lineHeight: 20,
    fontFamily: 'Quicksand_400Regular',
  },
  grammarHighlight: {
    backgroundColor: 'rgba(255, 200, 87, 0.35)',
    fontWeight: '600' as const,
    color: '#3D4F7C',
    fontFamily: 'Quicksand_600SemiBold',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'Quicksand_400Regular',
  },

  // ── エラー ──
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    color: '#CC0000',
    fontSize: 13,
    fontFamily: 'Quicksand_400Regular',
  },
  errorDismiss: {
    color: '#CC0000',
    fontSize: 16,
    fontWeight: '700',
    paddingLeft: 12,
    fontFamily: 'Quicksand_700Bold',
  },

  // ── プレビュー（selfモード） ──
  previewContainer: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderTopWidth: 2,
    borderTopColor: '#B5EAD7',
  },
  previewContainerExpanded: {
    maxHeight: Dimensions.get('window').height * 0.35,
  },
  previewLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Quicksand_700Bold',
  },
  previewTranslation: {
    color: '#333333',
    fontWeight: '700',
    fontSize: 17,
    marginTop: 8,
    lineHeight: 24,
    fontFamily: 'Quicksand_700Bold',
  },
  previewReverse: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 6,
    fontWeight: '500',
    fontFamily: 'Quicksand_500Medium',
  },
  toneDiffSection: {
    marginTop: 8,
  },

  // ── ニュアンス調整エリア ──
  nuanceContainer: {
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },

  // ── スライダー ──
  sliderContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    paddingHorizontal: 20,
    shadowColor: 'rgba(100,100,255,0.1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(200,200,255,0.3)',
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sliderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    fontFamily: 'Quicksand_600SemiBold',
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Quicksand_700Bold',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderEmoji: {
    fontSize: 20,
    fontFamily: 'Quicksand_400Regular',
  },
  sliderTrack: {
    flex: 1,
  },
  slider: {
    width: '100%',
    height: 26,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ddd',
  },

  // ── トーンアクション行 ──
  toneActionsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  toneBtnOuter: {
  },
  toneBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toneBtnActive: {
    borderColor: '#667eea',
  },
  toneBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'Quicksand_600SemiBold',
  },
  toneBtnTextActive: {
    color: '#FFFFFF',
  },
  customBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  customBtnActive: {
    borderColor: '#ec4899',
  },
  customBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#db2777',
    fontFamily: 'Quicksand_600SemiBold',
  },
  lockBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  lockBtnActive: {
    backgroundColor: '#FFF3CD',
    borderColor: '#F0A050',
  },
  lockBtnText: {
    fontSize: 18,
    fontFamily: 'Quicksand_400Regular',
  },

  // ── カスタムトーン ──
  customContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
  },
  presetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'Quicksand_600SemiBold',
  },
  customInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customInput: {
    flex: 1,
    backgroundColor: '#F9F7F2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#333',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    fontFamily: 'Quicksand_400Regular',
  },
  customTranslateBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customTranslateBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Quicksand_600SemiBold',
  },

  // ── 入力エリア ──
  inputArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  // セクションヘッダー（← + 言語セレクター）
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  collapseBtn: {
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  langSelectorsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  langSelectCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  langSelectInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  langSelectText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    fontFamily: 'Quicksand_500Medium',
  },
  langArrowCompact: {
    color: '#9CA3AF',
    fontSize: 14,
    fontFamily: 'Quicksand_400Regular',
  },
  // パートナーモード用テキストエリア（Web版と同じ大きさ）
  partnerTextarea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
    minHeight: 100,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    fontFamily: 'Quicksand_500Medium',
  },
  // フッター行
  inputFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  modeSwitchBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: '#f0f4ff',
    borderRadius: 6,
  },
  modeSwitchBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b6abf',
    fontFamily: 'Quicksand_600SemiBold',
  },
  inputAreaPartner: {
    backgroundColor: 'rgba(255,219,193,0.2)',
  },
  inputAreaSelf: {
    backgroundColor: 'rgba(181,234,215,0.2)',
  },
  detectedLangText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    fontFamily: 'Quicksand_400Regular',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  translateInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingRight: 4,
    paddingBottom: 4,
    minHeight: 100,
  },
  inputInWrapper: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
    maxHeight: 200,
    minHeight: 80,
    fontFamily: 'Quicksand_500Medium',
  },
  selfFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  btnStack: {
    gap: 6,
    justifyContent: 'center',
    flexShrink: 0,
  },

  // partner ボタン
  pasteBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'Quicksand_600SemiBold',
  },
  translateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translateBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'Quicksand_600SemiBold',
  },

  // self ボタン
  convertBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  convertBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'Quicksand_600SemiBold',
  },
  sendBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Quicksand_600SemiBold',
  },

  btnDisabled: {
    opacity: 0.5,
  },

  // ── トースト ──
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 40,
    right: 40,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Quicksand_600SemiBold',
  },

  // ── モーダル ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333333',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: 'Quicksand_700Bold',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  modalItemSelected: {
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  modalItemText: {
    fontSize: 15,
    color: '#333333',
    fontFamily: 'Quicksand_400Regular',
  },
  modalCheck: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '700',
    fontFamily: 'Quicksand_700Bold',
  },
  modalClose: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  modalCloseText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontFamily: 'Quicksand_400Regular',
  },
});
