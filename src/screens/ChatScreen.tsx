import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, Mic, Clipboard as ClipboardIcon, Check } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  translateFull,
  translateFullSimple,
  translatePartialSpacy,
  extractStructureSpacy,
  translatePartnerMessage,
  generateExplanation,
  generateToneDifferenceExplanation,
  generateMeaningDefinitions,
  verifyTranslation,
  fixMeaningIssues,
  fixNaturalness,
  getLangCodeFromName,
} from '../services/groq';
import {
  structureToPromptTextSpacy,
  extractContentWordsForFullGen,
  extractFlexibleWords,
  buildMeaningConstraintText,
} from '../services/prompts';
import type { TranslationResult, ExplanationResult } from '../services/types';
import {
  getVerifyingText,
  getFixingText,
  getNaturalnessCheckLabel,
  getDifferenceFromText,
  getNotYetGeneratedText,
  getFailedToGenerateText,
  getGrammarLabel,
} from '../services/i18n';
import { useAppData, type Message } from '../context/AppDataContext';

type RootStackParamList = {
  Chat: { partnerId: number };
  List: undefined;
  FaceToFace: { partnerId?: number };
  Settings: { partnerId: number };
};

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

interface Preview {
  translation: string;
  reverseTranslation: string;
  explanation: { point: string; explanation: string } | null;
  noChange?: boolean;
}

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
    case -100: return 'もっとカジュアル 😎😎';
    case -50: return 'カジュアル 😎';
    case 0: return 'ベース';
    case 50: return 'ていねい 🎩';
    case 100: return 'もっとていねい 🎩🎩';
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

const PROMPT_VERSION = '2026-02-11-phase2d-fix3';
const UI_TONE_LEVELS = [0, 50, 100];

function getCacheKey(
  tone: string | null,
  toneBucket: number,
  sourceText: string,
  customToneText?: string,
  sourceLang?: string,
  targetLang?: string,
  isNative?: boolean,
): string {
  const normalizedTone = tone || 'none';
  const customPart = tone === 'custom' && customToneText ? `_${customToneText}` : '';
  const langPart = `${sourceLang || 'auto'}->${targetLang || 'unknown'}`;
  const nativePart = isNative ? '_native' : '';
  return `${PROMPT_VERSION}|${langPart}|${sourceText}|${normalizedTone}_${toneBucket}${customPart}${nativePart}`;
}

const CUSTOM_PRESETS = [
  { label: '限界オタク', value: '限界オタク' },
  { label: '赤ちゃん言葉', value: '赤ちゃん言葉' },
  { label: 'オジサン構文', value: 'オジサン構文' },
  { label: 'ギャル', value: 'ギャル' },
];

export default function ChatScreen({ route, navigation }: Props) {
  const { partners, updatePartner, setCurrentPartnerId } = useAppData();
  const partnersRef = useRef(partners);
  useEffect(() => { partnersRef.current = partners; }, [partners]);

  const partner = useMemo(() => partners.find(p => p.id === route.params.partnerId), [partners, route.params.partnerId]);
  const messages = partner?.messages ?? [];

  // ★ isNative: Web版と同じパラメータ（チャット画面では常にfalse）
  const isNative = false;

  useEffect(() => {
    setCurrentPartnerId(route.params.partnerId);
  }, [route.params.partnerId, setCurrentPartnerId]);

  useEffect(() => {
    setInputText('');
    setPreviewSourceText('');
    setToneAdjusted(false);
    setIsCustomActive(false);
    setShowCustomInput(false);
    setSliderValue(0);
    setSliderBucket(0);
    prevBucketRef.current = 0;
    setShowPreview(false);
    setPreview({ translation: '', reverseTranslation: '', explanation: null });
    setTranslationError(null);
    // キャッシュクリア（前のパートナーのキャッシュが残らないように）
    translationCacheRef.current = {};
    setTranslationCacheState({});
    setCustomTone('');
    setPartnerInputText('');
    setShowPartnerInput(false);
    setToneDiffExplanation(null);
    setToneDiffExpanded(false);
  }, [partner?.id]);

  // ── メッセージ ──
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // ── パートナー入力 ──
  const [showPartnerInput, setShowPartnerInput] = useState(false);
  const [partnerInputText, setPartnerInputText] = useState('');

  // ── 自分の入力 ──
  const [inputText, setInputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // ── プレビュー ──
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<Preview>({ translation: '', reverseTranslation: '', explanation: null });
  const [previewSourceText, setPreviewSourceText] = useState('');

  // ── スライダー ──
  const [sliderValue, setSliderValue] = useState(0);
  const [sliderBucket, setSliderBucket] = useState(0);
  const [toneAdjusted, setToneAdjusted] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);

  // ── トーン差分解説 ──
  const [toneDiffExplanation, setToneDiffExplanation] = useState<ExplanationResult | null>(null);
  const [toneDiffLoading, setToneDiffLoading] = useState(false);
  const [toneDiffExpanded, setToneDiffExpanded] = useState(false);

  // ── カスタムトーン ──
  const [customTone, setCustomTone] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isCustomActive, setIsCustomActive] = useState(false);

  // ── ロック ──
  const [lockedSliderPosition, setLockedSliderPosition] = useState<number | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('nijilingo_locked_slider_position')
      .then(val => { if (val !== null) setLockedSliderPosition(JSON.parse(val)); })
      .catch(() => {});
  }, []);

  // ── 検証API状態 ──
  const [verificationStatus, setVerificationStatus] = useState<Record<string, 'verifying' | 'fixing' | 'passed' | null>>({});

  // ── キャッシュ ──
  const [translationCache, setTranslationCacheState] = useState<Record<string, { translation: string; reverseTranslation: string; noChange?: boolean }>>({});
  const translationCacheRef = useRef<Record<string, { translation: string; reverseTranslation: string; noChange?: boolean }>>({});

  const prevBucketRef = useRef(0);

  const updateTranslationCache = (updates: Record<string, { translation: string; reverseTranslation: string; noChange?: boolean }>) => {
    Object.assign(translationCacheRef.current, updates);
    setTranslationCacheState(prev => ({ ...prev, ...updates }));
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setShowCopiedToast(true);
    setTimeout(() => setShowCopiedToast(false), 2000);
  };

  const getCurrentPartner = () => partnersRef.current.find(p => p.id === route.params.partnerId);

  const updatePartnerMessages = (nextMessages: Message[], lastMessage?: string) => {
    const current = getCurrentPartner();
    if (!current) return;
    updatePartner(current.id, {
      messages: nextMessages,
      ...(lastMessage ? { lastMessage, lastTime: '今' } : null),
    });
  };

  // ── キャッシュ到着時の自動プレビュー更新 ──
  useEffect(() => {
    if (!previewSourceText.trim() || !partner) return;
    const { tone, bucket } = sliderToToneBucket(sliderBucket);
    if (isCustomActive) return;
    const key = getCacheKey(tone, bucket, previewSourceText, undefined, '日本語', partner.language, isNative);
    const cached = translationCacheRef.current[key];
    if (!cached) return;
    if (cached.translation === preview.translation && cached.reverseTranslation === preview.reverseTranslation && cached.noChange === preview.noChange) return;
    setPreview(prev => ({ ...prev, translation: cached.translation, reverseTranslation: cached.reverseTranslation, noChange: cached.noChange }));
  }, [sliderBucket, isCustomActive, previewSourceText, translationCache, partner, preview]);

  useEffect(() => {
    setToneDiffExplanation(null);
    setToneDiffExpanded(false);
  }, [sliderBucket, isCustomActive, previewSourceText]);

  const verifyAndFixOneBand = (params: {
    bandKey: string;
    tone: string;
    bucket: number;
    isNative: boolean;
    originalText: string;
    translation: string;
    reverseTranslation?: string;
    meaningDefinitions: Record<string, string>;
    sourceText: string;
    sourceLang: string;
    targetLang: string;
  }) => {
    const { bandKey, tone, bucket, isNative: isNativeParam, originalText, translation, reverseTranslation, meaningDefinitions, sourceText, sourceLang, targetLang } = params;

    const applyFix = (fixed: { translation: string; reverse_translation: string }) => {
      const cacheKey = getCacheKey(tone, bucket, sourceText, undefined, sourceLang, targetLang, isNativeParam);
      updateTranslationCache({ [cacheKey]: { translation: fixed.translation, reverseTranslation: fixed.reverse_translation } });
      const currentToneBucket = sliderToToneBucket(sliderValue);
      if (currentToneBucket.tone === tone && currentToneBucket.bucket === bucket) {
        setPreview(prev => ({ ...prev, translation: fixed.translation, reverseTranslation: fixed.reverse_translation }));
      }
      const otherBucket = bucket === 50 ? 100 : 50;
      const otherKey = getCacheKey(tone, otherBucket, sourceText, undefined, sourceLang, targetLang, isNativeParam);
      const cachedOther = translationCacheRef.current[otherKey];
      if (cachedOther && cachedOther.translation === fixed.translation) {
        const updates: Record<string, { translation: string; reverseTranslation: string; noChange: boolean }> = {};
        updates[otherKey] = { translation: cachedOther.translation, reverseTranslation: fixed.reverse_translation, noChange: true };
        updates[cacheKey] = { translation: fixed.translation, reverseTranslation: fixed.reverse_translation, noChange: true };
        updateTranslationCache(updates);
      } else if (bucket === 50 && cachedOther) {
        const newNoChange = cachedOther.translation === fixed.translation;
        if (cachedOther.noChange !== newNoChange) {
          updateTranslationCache({ [otherKey]: { ...cachedOther, noChange: newNoChange } });
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

  const generateAndCacheUiBuckets = async (params: {
    tone: string;
    isNative: boolean;
    sourceText: string;
    targetLang: string;
    sourceLang: string;
    customToneOverride?: string;
    skipPartial?: boolean;
  }) => {
    const { tone, isNative: isNativeParam, sourceText, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang, customToneOverride, skipPartial } = params;
    const customToneValue = typeof customToneOverride === 'string' ? customToneOverride : tone === 'custom' ? customTone : undefined;

    const allCached = UI_TONE_LEVELS.every((bucket) => {
      const key = getCacheKey(tone, bucket, sourceText, customToneValue, effectiveSourceLang, effectiveTargetLang, isNativeParam);
      return Boolean(translationCacheRef.current[key]);
    });
    if (allCached) return;

    const cacheBucket = (bucket: number, result: TranslationResult, noChange?: boolean) => {
      const cacheKey = getCacheKey(tone, bucket, sourceText, customToneValue, effectiveSourceLang, effectiveTargetLang, isNativeParam);
      updateTranslationCache({ [cacheKey]: { translation: result.translation, reverseTranslation: result.reverse_translation, noChange } });
    };

    if (tone === 'custom') {
      const result = await translateFull({ sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, isNative: isNativeParam, customTone: customToneValue });
      UI_TONE_LEVELS.forEach((b) => cacheBucket(b, result));
      return;
    }

    const baseCacheKey = getCacheKey('_base', 0, sourceText, undefined, effectiveSourceLang, effectiveTargetLang, isNativeParam);
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

    const targetLangCode = getLangCodeFromName(effectiveTargetLang);
    const spacyResult = await extractStructureSpacy(fullResult.translation, targetLangCode);
    const baseStructureText = structureToPromptTextSpacy(spacyResult);

    const flexWords = extractFlexibleWords(spacyResult);
    const definitions = await generateMeaningDefinitions(sourceText, fullResult.translation, flexWords, effectiveSourceLang);
    const meaningConstraint = buildMeaningConstraintText(definitions);

    const partial50 = await translatePartialSpacy({
      baseTranslation: fullResult.translation,
      structureText: baseStructureText,
      tone,
      toneLevel: 50,
      targetLang: effectiveTargetLang,
      sourceLang: effectiveSourceLang,
      originalText: sourceText,
      meaningConstraint,
    });

    const partial100 = await translatePartialSpacy({
      baseTranslation: fullResult.translation,
      structureText: baseStructureText,
      tone,
      toneLevel: 100,
      targetLang: effectiveTargetLang,
      sourceLang: effectiveSourceLang,
      originalText: sourceText,
      referenceTranslation: partial50.translation,
      meaningConstraint,
    });

    const noChange50 = partial50.translation === fullResult.translation;
    const noChange100 = partial100.translation === (noChange50 ? fullResult.translation : partial50.translation);
    const result50 = noChange50 ? { ...partial50, reverse_translation: sourceText } as TranslationResult : partial50 as TranslationResult;
    const result100 = noChange100 ? { ...partial100, reverse_translation: noChange50 ? sourceText : partial50.reverse_translation } as TranslationResult : partial100 as TranslationResult;
    cacheBucket(50, result50, noChange50);
    cacheBucket(100, result100, noChange100);

    if (!noChange50) {
      verifyAndFixOneBand({ bandKey: `${tone}_50`, tone, bucket: 50, isNative: isNativeParam, originalText: sourceText, translation: partial50.translation, reverseTranslation: partial50.reverse_translation, meaningDefinitions: definitions, sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang });
    }
    if (!noChange100) {
      verifyAndFixOneBand({ bandKey: `${tone}_100`, tone, bucket: 100, isNative: isNativeParam, originalText: sourceText, translation: partial100.translation, reverseTranslation: partial100.reverse_translation, meaningDefinitions: definitions, sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang });
    }
  };

  const generateAllToneAdjustments = async (params: { isNative: boolean; sourceText: string; targetLang: string; sourceLang: string }) => {
    const { isNative: isNativeParam, sourceText } = params;
    const effectiveTargetLang = params.targetLang;
    const effectiveSourceLang = params.sourceLang;

    const makeCacheKey = (tone: string, bucket: number) =>
      getCacheKey(tone, bucket, sourceText, undefined, effectiveSourceLang, effectiveTargetLang, isNativeParam);

    const cacheResult = (tone: string, bucket: number, result: TranslationResult, noChange?: boolean) => {
      updateTranslationCache({ [makeCacheKey(tone, bucket)]: { translation: result.translation, reverseTranslation: result.reverse_translation, noChange } });
    };

    const requiredKeys = [makeCacheKey('casual', 50), makeCacheKey('casual', 100), makeCacheKey('business', 50), makeCacheKey('business', 100)];
    if (requiredKeys.every(key => Boolean(translationCacheRef.current[key]))) return;

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

    const targetLangCode = getLangCodeFromName(effectiveTargetLang);
    const spacyResult = await extractStructureSpacy(fullResult.translation, targetLangCode);
    const baseStructureText = structureToPromptTextSpacy(spacyResult);

    const flexWords = extractFlexibleWords(spacyResult);
    const definitions = await generateMeaningDefinitions(sourceText, fullResult.translation, flexWords, effectiveSourceLang);
    const meaningConstraint = buildMeaningConstraintText(definitions);

    const [casual50, business50] = await Promise.all([
      translatePartialSpacy({ baseTranslation: fullResult.translation, structureText: baseStructureText, tone: 'casual', toneLevel: 50, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang, originalText: sourceText, meaningConstraint }),
      translatePartialSpacy({ baseTranslation: fullResult.translation, structureText: baseStructureText, tone: 'business', toneLevel: 50, targetLang: effectiveTargetLang, sourceLang: effectiveSourceLang, originalText: sourceText, meaningConstraint }),
    ]);

    let finalCasual50 = casual50;
    let finalBusiness50 = business50;
    const retryPromises: Promise<void>[] = [];

    if (casual50.translation === fullResult.translation) {
      retryPromises.push(
        translateFullSimple({
          sourceText,
          sourceLang: effectiveSourceLang,
          targetLang: effectiveTargetLang,
          meaningConstraint,
          toneInstruction: `Rewrite as if writing a casual email to a friend.\nHere is the base translation for reference — make yours more casual than this:\n"${fullResult.translation}"\nKeep the same meaning, but you are free to use completely different words and phrasing.`,
          tone: 'casual',
        }).then(result => { finalCasual50 = result; })
      );
    }
    if (business50.translation === fullResult.translation) {
      retryPromises.push(
        translateFullSimple({
          sourceText,
          sourceLang: effectiveSourceLang,
          targetLang: effectiveTargetLang,
          meaningConstraint,
          toneInstruction: `Write in a polite and respectful tone. Use courteous expressions appropriate for the target language. Do not replace everyday vocabulary with literary or archaic words.\nHere is the base translation for reference — make yours more formal than this:\n"${fullResult.translation}"`,
          tone: 'business',
        }).then(result => { finalBusiness50 = result; })
      );
    }
    if (retryPromises.length > 0) await Promise.all(retryPromises);

    const [casual100Full, business100] = await Promise.all([
      translateFullSimple({
        sourceText,
        sourceLang: effectiveSourceLang,
        targetLang: effectiveTargetLang,
        meaningConstraint,
        toneInstruction: `Translate as if texting a close friend. Be more casual than the 50% version below — use slang, abbreviations, and a relaxed tone.\nHere is the 50% casual version — make yours noticeably more casual:\n"${finalCasual50.translation}"\nKeep the same meaning, but you are free to use completely different words and phrasing.`,
        tone: 'casual',
      }),
      translatePartialSpacy({
        baseTranslation: fullResult.translation,
        structureText: baseStructureText,
        tone: 'business',
        toneLevel: 100,
        targetLang: effectiveTargetLang,
        sourceLang: effectiveSourceLang,
        originalText: sourceText,
        referenceTranslation: finalBusiness50.translation,
        fallbackToPreviousLevel: finalBusiness50,
        meaningConstraint,
      }),
    ]);

    let finalBusiness100 = business100;
    const bus100Ref = finalBusiness50.translation === fullResult.translation ? fullResult.translation : finalBusiness50.translation;
    if (business100.translation === bus100Ref) {
      finalBusiness100 = await translateFullSimple({
        sourceText,
        sourceLang: effectiveSourceLang,
        targetLang: effectiveTargetLang,
        meaningConstraint,
        toneInstruction: `Write in a highly polite and formal tone. Use courteous expressions, honorifics, and refined sentence structure appropriate for the target language. Do not replace everyday vocabulary with literary or archaic words.\nHere is the 50% business version for reference — make yours more formal than this:\n"${finalBusiness50.translation}"`,
        tone: 'business',
      });
    }

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

    const verifyParams = { sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang, isNative: isNativeParam };
    if (!noChangeCas50) verifyAndFixOneBand({ bandKey: 'casual_50', tone: 'casual', bucket: 50, originalText: sourceText, translation: finalCasual50.translation, reverseTranslation: finalCasual50.reverse_translation, meaningDefinitions: definitions, ...verifyParams });
    if (!noChangeCas100) verifyAndFixOneBand({ bandKey: 'casual_100', tone: 'casual', bucket: 100, originalText: sourceText, translation: casual100Full.translation, reverseTranslation: casual100Full.reverse_translation, meaningDefinitions: definitions, ...verifyParams });
    if (!noChangeBus50) verifyAndFixOneBand({ bandKey: 'business_50', tone: 'business', bucket: 50, originalText: sourceText, translation: finalBusiness50.translation, reverseTranslation: finalBusiness50.reverse_translation, meaningDefinitions: definitions, ...verifyParams });
    if (!noChangeBus100) verifyAndFixOneBand({ bandKey: 'business_100', tone: 'business', bucket: 100, originalText: sourceText, translation: finalBusiness100.translation, reverseTranslation: finalBusiness100.reverse_translation, meaningDefinitions: definitions, ...verifyParams });
  };

  const preGenerateToneAdjustments = (params: { isNative: boolean; sourceText: string; targetLang: string; sourceLang: string }) => {
    generateAllToneAdjustments(params).catch(() => {});
  };

  const handleConvert = async () => {
    if (!inputText.trim() || !partner) return;

    const sourceText = inputText.trim();
    setPreviewSourceText(sourceText);

    const sourceLang = '日本語';
    const targetLang = partner.language;
    const isLocked = lockedSliderPosition !== null;

    const baseCacheKey = getCacheKey('_base', 0, sourceText, undefined, sourceLang, targetLang, isNative);
    const baseCached = translationCacheRef.current[baseCacheKey];

    if (baseCached && !isLocked) {
      setPreview(prev => ({ ...prev, translation: baseCached.translation, reverseTranslation: baseCached.reverseTranslation, noChange: baseCached.noChange }));
      setShowPreview(true);
      setToneAdjusted(false);
      setSliderValue(0);
      setSliderBucket(0);
      prevBucketRef.current = 0;
      preGenerateToneAdjustments({ isNative, sourceText, targetLang, sourceLang });
      return;
    }

    setIsTranslating(true);
    setTranslationError(null);
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
        await generateAllToneAdjustments({ isNative, sourceText, targetLang, sourceLang });
        setToneAdjusted(true);
        const { tone, bucket } = sliderToToneBucket(lockedSliderPosition!);
        const lockedBucket = getSliderBucket(lockedSliderPosition!);
        setSliderValue(lockedSliderPosition!);
        setSliderBucket(lockedBucket);
        prevBucketRef.current = lockedBucket;
        const lockKey = getCacheKey(tone, bucket, sourceText, undefined, sourceLang, targetLang, isNative);
        const lockCached = translationCacheRef.current[lockKey];
        if (lockCached) {
          setPreview(prev => ({ ...prev, translation: lockCached.translation, reverseTranslation: lockCached.reverseTranslation, noChange: lockCached.noChange }));
        }
      } else {
        await generateAndCacheUiBuckets({ tone: '_base', isNative, sourceText, targetLang, sourceLang, skipPartial: true });
        const newBaseCached = translationCacheRef.current[baseCacheKey];
        if (newBaseCached) {
          setPreview(prev => ({ ...prev, translation: newBaseCached.translation, reverseTranslation: newBaseCached.reverseTranslation, noChange: newBaseCached.noChange }));
        }
        preGenerateToneAdjustments({ isNative, sourceText, targetLang, sourceLang });
      }
      setShowPreview(true);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setTranslationError(err instanceof Error ? err.message : '翻訳に失敗しました');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !partner || !showPreview) return;

    await copyToClipboard(preview.translation);

    const messageId = Date.now();
    const newMessage: Message = {
      id: messageId,
      type: 'self',
      original: inputText,
      translation: preview.translation,
      reverseTranslation: preview.reverseTranslation,
      explanation: { point: '', explanation: '' },
    };

    updatePartnerMessages([...messages, newMessage], preview.translation);
    setInputText('');
    setShowPreview(false);
    setToneAdjusted(false);
    setShowCustomInput(false);
    setIsCustomActive(false);

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    const partnerLangCode = getLangCodeFromName(partner.language);
    generateExplanation(preview.translation, 'ja', partnerLangCode, 'ja')
      .then(explanation => {
        const current = getCurrentPartner();
        if (!current) return;
        updatePartner(current.id, {
          messages: current.messages.map(m => m.id === messageId ? { ...m, explanation } : m),
        });
      })
      .catch(() => {});
  };

  const handlePartnerMessageAdd = async () => {
    if (!partnerInputText.trim() || !partner) return;

    const messageId = Date.now();
    const newMessage: Message = {
      id: messageId,
      type: 'partner',
      original: partnerInputText,
      translation: '（翻訳中...）',
      reverseTranslation: '',
      explanation: { point: '', explanation: '' },
    };

    updatePartnerMessages([...messages, newMessage], partnerInputText);
    setPartnerInputText('');
    setShowPartnerInput(false);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // Web版と同じ: translatePartnerMessage で翻訳+解説を一括取得
      const result = await translatePartnerMessage(partnerInputText, partner.language);

      const current = getCurrentPartner();
      if (current) {
        updatePartner(current.id, {
          messages: current.messages.map(m =>
            m.id === messageId
              ? { ...m, translation: result.translation, explanation: result.explanation }
              : m
          ),
        });
      }
    } catch {
      const current = getCurrentPartner();
      if (!current) return;
      updatePartner(current.id, {
        messages: current.messages.map(m =>
          m.id === messageId
            ? { ...m, translation: '（翻訳エラー）', explanation: { point: '', explanation: 'エラーが発生しました' } }
            : m
        ),
      });
    }
  };

  const handleToneAdjust = async () => {
    if (!previewSourceText.trim() || !showPreview || !partner) return;

    // カスタムモードを解除してスライダー表示に切り替え
    setIsCustomActive(false);
    setShowCustomInput(false);

    const sourceText = previewSourceText;
    const sourceLang = '日本語';
    const targetLang = partner.language;

    // ★ 全4帯キャッシュ済みチェック（バックグラウンド生成完了時は即座にスライダー表示）
    const allCached = [
      getCacheKey('casual', 50, sourceText, undefined, sourceLang, targetLang, isNative),
      getCacheKey('casual', 100, sourceText, undefined, sourceLang, targetLang, isNative),
      getCacheKey('business', 50, sourceText, undefined, sourceLang, targetLang, isNative),
      getCacheKey('business', 100, sourceText, undefined, sourceLang, targetLang, isNative),
    ].every(key => Boolean(translationCacheRef.current[key]));

    if (allCached) {
      setToneAdjusted(true);
      setSliderValue(0);
      setSliderBucket(0);
      prevBucketRef.current = 0;
      return;
    }

    setIsTranslating(true);
    setTranslationError(null);
    try {
      await generateAllToneAdjustments({ isNative, sourceText, targetLang, sourceLang });
      setToneAdjusted(true);
      setSliderValue(0);
      setSliderBucket(0);
      prevBucketRef.current = 0;
    } catch {
      setTranslationError('ニュアンス調整中にエラーが発生しました');
    } finally {
      setIsTranslating(false);
    }
  };

  const updatePreviewFromSlider = (sliderPosition: number) => {
    if (!previewSourceText.trim() || !partner) return;
    const { tone, bucket } = sliderToToneBucket(sliderPosition);
    const cacheKey = getCacheKey(tone, bucket, previewSourceText, undefined, '日本語', partner.language, isNative);
    const cached = translationCacheRef.current[cacheKey];
    if (cached) {
      setPreview(prev => ({ ...prev, translation: cached.translation, reverseTranslation: cached.reverseTranslation, noChange: cached.noChange }));
    }
  };

  const handleSliderComplete = (value: number) => {
    const bucket = getSliderBucket(value);
    setSliderValue(bucket);
    setSliderBucket(bucket);
    prevBucketRef.current = bucket;
    updatePreviewFromSlider(bucket);
  };

  const handleToneDiffExplanation = async () => {
    if (!partner) return;
    if (toneDiffExpanded) {
      setToneDiffExpanded(false);
      return;
    }

    const { tone: currentTone, bucket: currentInternalBucket } = sliderToToneBucket(sliderBucket);
    const sourceLang = '日本語';
    const targetLang = partner.language;

    if (sliderBucket === 0) {
      if (!preview.translation) {
        setToneDiffExplanation({ point: 'この文の伝わり方', explanation: '翻訳がまだ生成されていません。' });
        setToneDiffExpanded(true);
        return;
      }
      setToneDiffLoading(true);
      setToneDiffExpanded(true);
      try {
        const explanation = await generateExplanation(preview.translation, getLangCodeFromName(sourceLang), getLangCodeFromName(targetLang), getLangCodeFromName(sourceLang));
        setToneDiffExplanation({ point: explanation.point || getDifferenceFromText(getLangCodeFromName(sourceLang), 0), explanation: explanation.explanation });
      } catch {
        setToneDiffExplanation({ point: getDifferenceFromText(getLangCodeFromName(sourceLang), 0), explanation: getFailedToGenerateText(getLangCodeFromName(sourceLang)) });
      } finally {
        setToneDiffLoading(false);
      }
      return;
    }

    const getPreviousTone = (tone: string, bucket: number): { tone: string; bucket: number } => {
      if (tone === 'casual' && bucket === 100) return { tone: 'casual', bucket: 50 };
      if (tone === 'casual' && bucket === 50) return { tone: '_base', bucket: 0 };
      if (tone === 'business' && bucket === 50) return { tone: '_base', bucket: 0 };
      if (tone === 'business' && bucket === 100) return { tone: 'business', bucket: 50 };
      return { tone: '_base', bucket: 0 };
    };

    const prev = getPreviousTone(currentTone, currentInternalBucket);
    const prevKey = getCacheKey(prev.tone, prev.bucket, previewSourceText, undefined, sourceLang, targetLang, isNative);
    const currKey = getCacheKey(currentTone, currentInternalBucket, previewSourceText, undefined, sourceLang, targetLang, isNative);
    const prevCached = translationCacheRef.current[prevKey];
    const currCached = translationCacheRef.current[currKey];
    const sourceLangCode = getLangCodeFromName(sourceLang);
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
        prevCached.translation,
        currCached.translation,
        prevUiBucket,
        currentInternalBucket,
        currentTone,
        sourceLangCode,
        keywords ?? undefined
      );
      setToneDiffExplanation(explanation);
    } catch {
      setToneDiffExplanation({ point: getDifferenceFromText(sourceLangCode, prevUiBucket), explanation: getFailedToGenerateText(sourceLangCode) });
    } finally {
      setToneDiffLoading(false);
    }
  };

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
    const langCode = getLangCodeFromName('日本語');
    return (
      <>
        {nuance ? (
          <View style={styles.nuanceTipBox}>
            <Text style={styles.explanationDetailText}>{renderWithHighlight(nuance)}</Text>
          </View>
        ) : null}
        {grammar ? (
          <View style={styles.grammarTipBox}>
            <Text style={styles.grammarTipLabel}>{getGrammarLabel(langCode)}</Text>
            <Text style={styles.grammarTipText}>{renderWithHighlight(grammar)}</Text>
          </View>
        ) : null}
      </>
    );
  };

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

  const handleCustomToggle = () => {
    if (isCustomActive) {
      setIsCustomActive(false);
      setShowCustomInput(false);
      // スライダー位置はそのまま維持
    } else {
      setIsCustomActive(true);
      setShowCustomInput(true);
    }
  };

  const handleCustomTranslate = async (toneText: string) => {
    if (!toneText.trim() || !previewSourceText.trim() || !partner) return;
    setToneLoading(true);
    try {
      await generateAndCacheUiBuckets({
        tone: 'custom',
        isNative,
        sourceText: previewSourceText,
        targetLang: partner.language,
        sourceLang: '日本語',
        customToneOverride: toneText,
      });
      const cacheKey = getCacheKey('custom', 0, previewSourceText, toneText, '日本語', partner.language, isNative);
      const cached = translationCacheRef.current[cacheKey];
      if (cached) {
        setPreview(prev => ({ ...prev, translation: cached.translation, reverseTranslation: cached.reverseTranslation }));
      }
    } catch {
      setTranslationError('カスタムトーン翻訳に失敗しました');
    } finally {
      setToneLoading(false);
    }
  };

  const handleLockToggle = () => {
    if (lockedSliderPosition !== null) {
      setLockedSliderPosition(null);
      AsyncStorage.removeItem('nijilingo_locked_slider_position').catch(() => {});
    } else if (toneAdjusted) {
      setLockedSliderPosition(sliderBucket);
      AsyncStorage.setItem('nijilingo_locked_slider_position', JSON.stringify(sliderBucket)).catch(() => {});
    }
  };

  const renderMessage = (msg: Message) => {
    const isSelf = msg.type === 'self';
    const isExpanded = expandedId === msg.id;
    return (
      <View key={msg.id} style={[styles.messageRow, isSelf ? styles.messageRowSelf : styles.messageRowPartner]}>
        <View style={[styles.messageBubble, isSelf ? styles.bubbleSelf : styles.bubblePartner]}>
          <Text selectable style={styles.messageText}>
            {isSelf ? msg.translation : msg.original}
          </Text>
          <Text style={styles.messageSubText}>
            （{isSelf ? msg.reverseTranslation : msg.translation}）
          </Text>
          <View style={styles.bubbleActionsRow}>
            <TouchableOpacity
              onPress={() => {
                const textToCopy = isSelf ? msg.translation : msg.original;
                copyToClipboard(textToCopy);
                setCopiedMessageId(msg.id);
                setTimeout(() => setCopiedMessageId(null), 2000);
              }}
              style={styles.bubbleCopyBtn}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {copiedMessageId === msg.id ? (
                  <Text style={[styles.bubbleCopyText, isSelf ? styles.toggleSelf : styles.togglePartner]}>✓ コピー済み</Text>
                ) : (
                  <>
                    <ClipboardIcon size={14} color={isSelf ? '#6366f1' : '#9CA3AF'} strokeWidth={2} />
                    <Text style={[styles.bubbleCopyText, isSelf ? styles.toggleSelf : styles.togglePartner]}>コピー</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>

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
          </View>

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
                  <Text style={styles.explanationDetailText}>{msg.explanation.explanation}</Text>
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

  const hasTranslationResult = showPreview && Boolean(preview.translation.trim());

  if (!partner) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>相手が選択されていません。</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={styles.chatHeader}>
        <View style={styles.chatHeaderLeft}>
          <TouchableOpacity onPress={() => navigation.navigate('List')} style={styles.backBtn}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          {partner.avatarImage ? (
            <Image source={{ uri: partner.avatarImage }} style={styles.chatAvatarImage} />
          ) : (
            <LinearGradient
              colors={['#FFDAC1', '#E2F0CB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.chatAvatarContainer}
            >
              <Text style={styles.chatAvatar}>{partner.avatar}</Text>
            </LinearGradient>
          )}
          <Text style={styles.chatPartnerName}>{partner.name}</Text>
          <Text style={styles.chatLanguageBadge}>{partner.language}</Text>
        </View>
        <View style={styles.chatHeaderRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Settings', { partnerId: partner.id })} style={styles.settingsBtn}>
            <Settings size={20} color="#333" strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('FaceToFace', { partnerId: partner.id })} style={styles.faceToFaceBtn}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.faceToFaceText}>対面</Text>
              <Mic size={14} color="#0369A1" strokeWidth={2} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollViewRef} style={styles.messagesArea} contentContainerStyle={styles.messagesContent}>
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>メッセージがまだありません</Text>
          </View>
        ) : (
          messages.map(renderMessage)
        )}

        {showPartnerInput ? (
          <View style={styles.partnerInputBox}>
            <TextInput
              style={styles.partnerInput}
              placeholder="相手のメッセージを貼り付け..."
              placeholderTextColor="#9CA3AF"
              value={partnerInputText}
              onChangeText={setPartnerInputText}
              multiline
            />
            <View style={styles.partnerInputButtons}>
              <TouchableOpacity onPress={handlePartnerMessageAdd} style={styles.partnerAddBtn}>
                <Text style={styles.partnerAddBtnText}>追加</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowPartnerInput(false)} style={styles.partnerCancelBtn}>
                <Text style={styles.partnerCancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowPartnerInput(true)} style={styles.partnerInputTrigger}>
            <Text style={styles.partnerInputTriggerText}>＋ 入力する（翻訳）</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {translationError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{translationError}</Text>
        </View>
      )}

      {showPreview && (
        <View style={styles.previewContainer}>
          <View style={styles.previewLabelRow}>
            <Text style={styles.previewLabel}>翻訳プレビュー</Text>
            {preview.noChange && <Text style={{ color: '#888', fontSize: 12, marginLeft: 8, fontFamily: 'Quicksand_400Regular' }}>（変化なし）</Text>}
            {(() => {
              const tb = sliderToToneBucket(sliderBucket);
              const bk = `${tb.tone}_${tb.bucket}`;
              const vs = verificationStatus[bk];
              const lc = getLangCodeFromName('日本語');
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
          <Text style={styles.previewReverse}>逆翻訳：{preview.reverseTranslation}</Text>

          {!isCustomActive && (
            <View style={styles.toneDiffSection}>
              <TouchableOpacity onPress={handleToneDiffExplanation} style={styles.explanationToggle}>
                <Text style={[styles.explanationToggleText, styles.toggleSelf]}>
                  {toneDiffExpanded ? '▲ 解説を閉じる' : '▼ 解説'}
                </Text>
              </TouchableOpacity>

              {toneDiffExpanded && (
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
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.inputArea}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="メッセージを入力..."
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={(text) => { setInputText(text); setShowPreview(false); }}
            multiline
            numberOfLines={2}
          />
          <View style={styles.btnStack}>
            <TouchableOpacity onPress={handleConvert} disabled={isTranslating || !inputText.trim()} style={(isTranslating || !inputText.trim()) ? styles.btnDisabled : undefined}>
              <LinearGradient colors={['#E2F0CB', '#B5EAD7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.convertBtn}>
                {isTranslating ? <ActivityIndicator size="small" color="#333" /> : <Text style={styles.convertBtnText}>翻訳</Text>}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSend} disabled={!showPreview} style={!showPreview ? styles.btnDisabled : undefined}>
              <LinearGradient colors={['#d4a5c9', '#b8c4e0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendBtn}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.sendBtnText}>確定</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showPreview && (
        <View style={styles.nuanceContainer}>
          {toneAdjusted && !isCustomActive && (
            <View style={styles.sliderContainer}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderTitle}>ニュアンス調整</Text>
                <View style={[styles.badge, { backgroundColor: getBadgeColor(sliderBucket) }]}>
                  <Text style={styles.badgeText}>{getBadgeText(sliderBucket)}</Text>
                </View>
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
                    onValueChange={setSliderValue}
                    onSlidingComplete={handleSliderComplete}
                    minimumTrackTintColor={getSliderTrackColor(sliderValue)}
                    maximumTrackTintColor="#e8eaef"
                    thumbTintColor="#FFFFFF"
                    disabled={toneLoading}
                  />
                </View>
                <Text style={styles.sliderEmoji}>🎩</Text>
              </View>
              <View style={styles.dotsRow}>
                {[-100, -50, 0, 50, 100].map((point) => (
                  <View key={point} style={[styles.dot, sliderBucket === point && { backgroundColor: getBadgeColor(point) }]} />
                ))}
              </View>
            </View>
          )}

          <View style={styles.toneActionsRow}>
            <TouchableOpacity onPress={handleToneAdjust} disabled={!hasTranslationResult || isTranslating} style={[styles.toneBtnOuter, (!hasTranslationResult || isTranslating) && styles.btnDisabled]}>
              <LinearGradient colors={toneAdjusted && !isCustomActive ? ['#667eea', '#764ba2'] : ['#B5EAD7', '#C7CEEA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.toneBtn, toneAdjusted && !isCustomActive && styles.toneBtnActive]}>
                <Text style={[styles.toneBtnText, toneAdjusted && !isCustomActive && styles.toneBtnTextActive]}>🎨 ニュアンス調整</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCustomToggle} disabled={!hasTranslationResult || isTranslating} style={[styles.toneBtnOuter, (!hasTranslationResult || isTranslating) && styles.btnDisabled]}>
              <LinearGradient colors={['#fdf2f8', '#fce7f3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.customBtn, isCustomActive && styles.customBtnActive]}>
                <Text style={styles.customBtnText}>カスタム</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.lockBtn, lockedSliderPosition !== null && styles.lockBtnActive]} onPress={handleLockToggle} disabled={!toneAdjusted && lockedSliderPosition === null}>
              <Text style={styles.lockBtnText}>{lockedSliderPosition !== null ? '🔒' : '🔓'}</Text>
            </TouchableOpacity>
          </View>

          {showCustomInput && (
            <View style={styles.customContainer}>
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
                  {toneLoading ? <ActivityIndicator size="small" color="#333" /> : <Text style={styles.customTranslateBtnText}>翻訳</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {showCopiedToast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>✓ クリップボードにコピーしました</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F7F2' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#FFFFFF', shadowColor: 'rgba(255, 183, 178, 0.2)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 15, elevation: 4, zIndex: 10 },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  backBtn: { padding: 8, borderRadius: 12 },
  backBtnText: { fontSize: 14, color: '#333', fontFamily: 'Quicksand_400Regular' },
  chatAvatarContainer: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chatAvatar: { fontSize: 24, fontFamily: 'Quicksand_400Regular' },
  chatAvatarImage: { width: 44, height: 44, borderRadius: 22 },
  chatPartnerName: { fontSize: 16, fontWeight: '700', color: '#333', fontFamily: 'Quicksand_700Bold' },
  chatLanguageBadge: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, color: '#9CA3AF', fontWeight: '600', fontFamily: 'Quicksand_600SemiBold' },
  chatHeaderRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  settingsBtn: { padding: 6 },
  settingsBtnText: { fontSize: 18, fontFamily: 'Quicksand_400Regular' },
  faceToFaceBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#E0F2FE' },
  faceToFaceText: { fontSize: 12, fontWeight: '600', color: '#0369A1', fontFamily: 'Quicksand_600SemiBold' },
  messagesArea: { flex: 1 },
  messagesContent: { padding: 12, paddingBottom: 20 },
  emptyState: { alignItems: 'center', marginTop: 24 },
  emptyText: { fontSize: 13, color: '#9CA3AF', fontFamily: 'Quicksand_400Regular' },
  messageRow: { flexDirection: 'row', marginBottom: 12 },
  messageRowSelf: { justifyContent: 'flex-end' },
  messageRowPartner: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '80%', borderRadius: 18, padding: 8, paddingHorizontal: 12 },
  bubbleSelf: { backgroundColor: '#E3FDFD', borderBottomRightRadius: 6, shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  bubblePartner: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 6, shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  messageText: { fontSize: 15, fontWeight: '600', color: '#111827', lineHeight: 21, fontFamily: 'Quicksand_600SemiBold' },
  messageSubText: { fontSize: 12, color: '#888', fontWeight: '500', marginTop: 2, fontFamily: 'Quicksand_500Medium' },
  bubbleActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  bubbleCopyBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  bubbleCopyText: { fontSize: 12, fontWeight: '600', fontFamily: 'Quicksand_600SemiBold' },
  explanationToggle: { paddingVertical: 4, paddingHorizontal: 8 },
  explanationToggleText: { fontSize: 12, fontWeight: '600', fontFamily: 'Quicksand_600SemiBold' },
  toggleSelf: { color: '#6366f1' },
  togglePartner: { color: '#9CA3AF' },
  explanationBox: { marginTop: 10, borderRadius: 12, padding: 12 },
  explanationSelf: { backgroundColor: 'rgba(99,102,241,0.1)' },
  explanationPartner: { backgroundColor: '#F3F4F6' },
  explanationPointRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10, paddingHorizontal: 14, marginBottom: 12 },
  pointIcon: { fontSize: 14, fontFamily: 'Quicksand_400Regular' },
  pointText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#333', lineHeight: 20, fontFamily: 'Quicksand_700Bold' },
  pointTextPartner: { color: '#2D5A7B' },
  explanationDetailText: { fontSize: 14, color: '#444', lineHeight: 24, fontFamily: 'Quicksand_400Regular' },
  nuanceTipBox: { backgroundColor: '#f0f7ff', borderRadius: 8, padding: 10, marginBottom: 6 },
  grammarTipBox: { borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#7B8EC2' },
  grammarTipLabel: { fontSize: 11, fontWeight: '700', color: '#fff', marginBottom: 6, backgroundColor: '#7B8EC2', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden', fontFamily: 'Quicksand_700Bold' },
  grammarTipText: { fontSize: 13, color: '#4A5578', lineHeight: 20, fontFamily: 'Quicksand_400Regular' },
  grammarHighlight: { backgroundColor: '#fff3cd', fontWeight: '600', color: '#333', fontFamily: 'Quicksand_600SemiBold' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  loadingText: { fontSize: 14, color: '#666', fontFamily: 'Quicksand_400Regular' },
  partnerInputBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#eee', marginTop: 8 },
  partnerInput: { minHeight: 80, backgroundColor: '#F9F7F2', borderRadius: 8, padding: 10, textAlignVertical: 'top', borderWidth: 1, borderColor: '#eee' },
  partnerInputButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  partnerAddBtn: { backgroundColor: '#B5EAD7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  partnerAddBtnText: { fontWeight: '600', color: '#333' },
  partnerCancelBtn: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  partnerCancelBtnText: { fontWeight: '600', color: '#666' },
  partnerInputTrigger: { padding: 10, alignItems: 'center' },
  partnerInputTriggerText: { fontSize: 13, color: '#6B7280', fontWeight: '600', fontFamily: 'Quicksand_600SemiBold' },
  errorBox: { backgroundColor: '#FFE5E5', paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 16, borderRadius: 10, marginBottom: 6 },
  errorText: { color: '#CC0000', fontSize: 13, fontFamily: 'Quicksand_400Regular' },
  previewContainer: { backgroundColor: '#FFFFFF', padding: 12, borderTopWidth: 2, borderTopColor: '#B5EAD7', maxHeight: 260 },
  previewLabelRow: { flexDirection: 'row', alignItems: 'center' },
  previewLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Quicksand_700Bold' },
  previewTranslation: { color: '#333', fontWeight: '700', fontSize: 16, marginTop: 8, lineHeight: 24, fontFamily: 'Quicksand_700Bold' },
  previewReverse: { fontSize: 13, color: '#9CA3AF', marginTop: 6, fontWeight: '500', fontFamily: 'Quicksand_500Medium' },
  toneDiffSection: { marginTop: 8 },
  inputArea: { paddingHorizontal: 12, paddingVertical: 14, backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: 'rgba(74, 85, 104, 0.05)', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 1, shadowRadius: 15, elevation: 5, zIndex: 5 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  input: { flex: 1, backgroundColor: '#F0F2F5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, fontWeight: '500', color: '#333', maxHeight: 100, fontFamily: 'Quicksand_500Medium' },
  btnStack: { gap: 6, justifyContent: 'center' },
  convertBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center' },
  convertBtnText: { fontSize: 13, fontWeight: '600', color: '#333', fontFamily: 'Quicksand_600SemiBold' },
  sendBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center' },
  sendBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF', fontFamily: 'Quicksand_600SemiBold' },
  btnDisabled: { opacity: 0.5 },
  nuanceContainer: { backgroundColor: '#F0F2F5', paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
  sliderContainer: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, paddingHorizontal: 20, borderWidth: 1, borderColor: 'rgba(200,200,255,0.3)' },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sliderTitle: { fontSize: 14, fontWeight: '600', color: '#555', fontFamily: 'Quicksand_600SemiBold' },
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'Quicksand_700Bold' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderEmoji: { fontSize: 20, fontFamily: 'Quicksand_400Regular' },
  sliderTrack: { flex: 1 },
  slider: { width: '100%', height: 26 },
  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ddd' },
  toneActionsRow: { flexDirection: 'row', gap: 8 },
  toneBtnOuter: { flex: 1 },
  toneBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  toneBtnActive: { borderColor: '#667eea' },
  toneBtnText: { fontSize: 13, fontWeight: '600', color: '#333', fontFamily: 'Quicksand_600SemiBold' },
  toneBtnTextActive: { color: '#FFFFFF' },
  customBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  customBtnActive: { borderColor: '#ec4899' },
  customBtnText: { fontSize: 13, fontWeight: '600', color: '#db2777', fontFamily: 'Quicksand_600SemiBold' },
  lockBtn: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#FFFFFF', borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  lockBtnActive: { backgroundColor: '#FFF3CD', borderColor: '#F0A050' },
  lockBtnText: { fontSize: 18, fontFamily: 'Quicksand_400Regular' },
  customContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, gap: 10 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#F3F4F6', borderRadius: 16 },
  presetBtnText: { fontSize: 13, fontWeight: '600', color: '#333', fontFamily: 'Quicksand_600SemiBold' },
  customInputRow: { flexDirection: 'row', gap: 8 },
  customInput: { flex: 1, backgroundColor: '#F9F7F2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#333', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', fontFamily: 'Quicksand_400Regular' },
  customTranslateBtn: { backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  customTranslateBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: 'Quicksand_600SemiBold' },
  toast: { position: 'absolute', bottom: 100, left: 40, right: 40, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center' },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', fontFamily: 'Quicksand_600SemiBold' },
});
