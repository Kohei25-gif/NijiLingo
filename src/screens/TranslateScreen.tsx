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
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { translateFull, generateExplanation, generateToneDifferenceExplanation } from '../services/groq';
import type { TranslationResult, ExplanationResult } from '../services/types';

type RootStackParamList = {
  Home: undefined;
  Translate: { mode: 'receive' | 'send' };
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
  const snapPoints = [-100, -50, 0, 50, 100];
  let closest = snapPoints[0];
  let minDist = Math.abs(value - snapPoints[0]);
  for (const sp of snapPoints) {
    const dist = Math.abs(value - sp);
    if (dist < minDist) { minDist = dist; closest = sp; }
  }
  return closest;
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

function getCacheKey(tone: string, bucket: number): string {
  return `${tone}_${bucket}`;
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
  { code: 'pt', name: 'ポルトガル語', flag: '🇵🇹' },
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

export default function TranslateScreen({ route }: Props) {
  const { mode } = route.params;
  const isPartnerMode = mode === 'receive';
  const isSelfMode = mode === 'send';

  // ── メッセージボード ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // ── 言語選択 ──
  const [sourceLang, setSourceLang] = useState(isPartnerMode ? '自動認識' : '自動認識');
  const [targetLang, setTargetLang] = useState(isPartnerMode ? '日本語' : '英語');
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [langModalTarget, setLangModalTarget] = useState<'source' | 'target'>('source');
  const [detectedLang, setDetectedLang] = useState('');

  // ── 入力 ──
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── プレビュー（selfモードのみ） ──
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<Preview>({
    translation: '', reverseTranslation: '', explanation: null,
  });

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

  // ── コピーフィードバック ──
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);

  // ── Refs ──
  const activeSourceText = useRef('');
  const translationCache = useRef<Record<string, TranslationResult>>({});
  const prevBucketRef = useRef(0);

  // ── コピー関数 ──
  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setShowCopiedToast(true);
    setTimeout(() => setShowCopiedToast(false), 2000);
  };

  // ── ペースト関数 ──
  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setInputText(prev => prev + text);
  };

  // ══════════════════════════════════════════════
  // partnerモード: 翻訳 → メッセージボードに直接追加
  // ══════════════════════════════════════════════

  const handlePartnerTranslate = async () => {
    if (!inputText.trim()) return;

    setLoading(true);
    setError(null);
    const sourceText = inputText;

    try {
      const result = await translateFull({
        sourceText,
        sourceLang: sourceLang === '自動認識' ? '自動認識' : sourceLang,
        targetLang,
        isNative: false,
      });

      // 検出言語を表示
      if (result.detected_language) {
        setDetectedLang(result.detected_language);
      }

      const msgId = Date.now();
      const newMsg: ChatMessage = {
        id: msgId,
        type: 'partner',
        original: sourceText,
        translation: result.translation,
        reverseTranslation: result.reverse_translation || '',
        explanation: null,
        detectedLanguage: result.detected_language,
      };

      setMessages(prev => [...prev, newMsg]);
      setInputText('');

      // 自動スクロール
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      // バックグラウンドで解説取得
      const srcCode = getLangCodeForExplanation(sourceLang === '自動認識' ? (result.detected_language || '英語') : sourceLang);
      const tgtCode = getLangCodeForExplanation(targetLang);
      generateExplanation(result.translation, srcCode, tgtCode, tgtCode)
        .then(exp => {
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, explanation: exp } : m
          ));
        })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻訳に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // selfモード: 翻訳 → プレビュー表示
  // ══════════════════════════════════════════════

  const handleSelfTranslate = async () => {
    if (!inputText.trim()) return;

    setLoading(true);
    setError(null);
    setShowPreview(false);
    setToneAdjusted(false);
    setShowCustomInput(false);
    setIsCustomActive(false);
    setSliderValue(0);
    setSliderBucket(0);
    prevBucketRef.current = 0;
    translationCache.current = {};
    setToneDiffExplanation(null);
    setToneDiffExpanded(false);
    activeSourceText.current = inputText;

    try {
      const result = await translateFull({
        sourceText: inputText,
        sourceLang: sourceLang === '自動認識' ? '自動認識' : sourceLang,
        targetLang,
        isNative: false,
      });

      if (result.detected_language) {
        setDetectedLang(result.detected_language);
      }

      translationCache.current[getCacheKey('_base', 0)] = result;

      setPreview({
        translation: result.translation,
        reverseTranslation: result.reverse_translation || '',
        explanation: null,
      });
      setShowPreview(true);

      // バックグラウンドで解説取得
      const srcCode = getLangCodeForExplanation(sourceLang === '自動認識' ? (result.detected_language || '日本語') : sourceLang);
      const tgtCode = getLangCodeForExplanation(targetLang);
      generateExplanation(result.translation, srcCode, tgtCode, srcCode)
        .then(exp => {
          setPreview(prev => ({ ...prev, explanation: exp }));
        })
        .catch(() => {});

      // ロック中 → 即座にロック位置のトーンを取得
      if (lockedSliderPosition !== null && lockedSliderPosition !== 0) {
        const { tone, bucket } = sliderToToneBucket(lockedSliderPosition);
        const cacheKey = getCacheKey(tone, bucket);

        setToneAdjusted(true);
        setSliderValue(lockedSliderPosition);
        setSliderBucket(lockedSliderPosition);
        prevBucketRef.current = lockedSliderPosition;

        if (!translationCache.current[cacheKey]) {
          setToneLoading(true);
          try {
            const toneResult = await translateFull({
              sourceText: inputText,
              sourceLang: sourceLang === '自動認識' ? '自動認識' : sourceLang,
              targetLang,
              isNative: false,
              tone,
              toneLevel: bucket,
            });
            translationCache.current[cacheKey] = toneResult;
            setPreview({
              translation: toneResult.translation,
              reverseTranslation: toneResult.reverse_translation || '',
              explanation: null,
            });
          } catch {
            // ロック位置のトーン取得失敗、ベースを維持
          } finally {
            setToneLoading(false);
          }
        } else {
          const cached = translationCache.current[cacheKey];
          setPreview({
            translation: cached.translation,
            reverseTranslation: cached.reverse_translation || '',
            explanation: null,
          });
        }
      }

      // スクロール
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
      original: inputText || activeSourceText.current,
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
    const srcCode = getLangCodeForExplanation(sourceLang === '自動認識' ? '日本語' : sourceLang);
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
  // トーン調整ボタン
  // ══════════════════════════════════════════════

  const handleToneAdjust = async () => {
    if (toneAdjusted) {
      // トグルオフ
      setToneAdjusted(false);
      // ベースに戻す
      const baseResult = translationCache.current[getCacheKey('_base', 0)];
      if (baseResult) {
        setPreview({
          translation: baseResult.translation,
          reverseTranslation: baseResult.reverse_translation || '',
          explanation: preview.explanation,
        });
      }
      setSliderValue(0);
      setSliderBucket(0);
      prevBucketRef.current = 0;
      setToneDiffExplanation(null);
      setToneDiffExpanded(false);
      return;
    }

    setIsCustomActive(false);
    setShowCustomInput(false);
    setToneAdjusted(true);
    setSliderValue(0);
    setSliderBucket(0);
    prevBucketRef.current = 0;
    setToneDiffExplanation(null);
    setToneDiffExpanded(false);
  };

  // ══════════════════════════════════════════════
  // スライダー操作
  // ══════════════════════════════════════════════

  const handleSliderChange = (value: number) => {
    setSliderValue(value);
  };

  const handleSliderComplete = async (value: number) => {
    const bucket = getSliderBucket(value);
    setSliderValue(bucket);
    setSliderBucket(bucket);

    const { tone, bucket: toneBucket } = sliderToToneBucket(bucket);
    const cacheKey = getCacheKey(tone, toneBucket);

    const prevBucket = prevBucketRef.current;
    prevBucketRef.current = bucket;

    // キャッシュヒット
    if (translationCache.current[cacheKey]) {
      const cached = translationCache.current[cacheKey];
      setPreview(prev => ({
        ...prev,
        translation: cached.translation,
        reverseTranslation: cached.reverse_translation || '',
      }));

      // 差分解説
      const prevTone = sliderToToneBucket(prevBucket);
      const prevCacheKey = getCacheKey(prevTone.tone, prevTone.bucket);
      const prevResult = translationCache.current[prevCacheKey];
      if (prevResult && prevResult.translation !== cached.translation) {
        fetchDiffExplanation(prevResult, cached, prevBucket, bucket, tone);
      }
      return;
    }

    // ベースの場合
    if (tone === '_base') {
      const baseResult = translationCache.current[getCacheKey('_base', 0)];
      if (baseResult) {
        setPreview(prev => ({
          ...prev,
          translation: baseResult.translation,
          reverseTranslation: baseResult.reverse_translation || '',
        }));
      }
      return;
    }

    // API呼び出し
    setToneLoading(true);
    try {
      const result = await translateFull({
        sourceText: activeSourceText.current,
        sourceLang: sourceLang === '自動認識' ? '自動認識' : sourceLang,
        targetLang,
        isNative: false,
        tone,
        toneLevel: toneBucket,
      });
      translationCache.current[cacheKey] = result;
      setPreview(prev => ({
        ...prev,
        translation: result.translation,
        reverseTranslation: result.reverse_translation || '',
      }));

      // 差分解説
      const prevTone = sliderToToneBucket(prevBucket);
      const prevCacheKey = getCacheKey(prevTone.tone, prevTone.bucket);
      const prevResult = translationCache.current[prevCacheKey];
      if (prevResult) {
        fetchDiffExplanation(prevResult, result, prevBucket, bucket, tone);
      }
    } catch {
      setError('トーン調整に失敗しました');
    } finally {
      setToneLoading(false);
    }
  };

  // ── 差分解説取得 ──
  const fetchDiffExplanation = (prev: TranslationResult, curr: TranslationResult, prevBucket: number, currBucket: number, tone: string) => {
    if (prev.translation === curr.translation) return;
    setToneDiffLoading(true);
    setToneDiffExplanation(null);
    setToneDiffExpanded(true);
    const srcCode = sourceLang === '日本語' ? 'ja' : getLangCodeForExplanation(sourceLang);
    generateToneDifferenceExplanation(
      prev.translation, curr.translation,
      prevBucket, currBucket,
      tone === '_base' ? 'business' : tone,
      srcCode,
    )
      .then(exp => setToneDiffExplanation(exp))
      .catch(() => {})
      .finally(() => setToneDiffLoading(false));
  };

  // ══════════════════════════════════════════════
  // カスタムトーン
  // ══════════════════════════════════════════════

  const handleCustomToggle = () => {
    if (isCustomActive) {
      setIsCustomActive(false);
      setShowCustomInput(false);
      // ベースに戻す
      const baseResult = translationCache.current[getCacheKey('_base', 0)];
      if (baseResult) {
        setPreview(prev => ({
          ...prev,
          translation: baseResult.translation,
          reverseTranslation: baseResult.reverse_translation || '',
        }));
      }
    } else {
      setIsCustomActive(true);
      setShowCustomInput(true);
      setToneAdjusted(false);
      setToneDiffExplanation(null);
      setToneDiffExpanded(false);
    }
  };

  const handleCustomTranslate = async (toneText: string) => {
    if (!toneText.trim() || !activeSourceText.current) return;

    setToneLoading(true);
    try {
      const result = await translateFull({
        sourceText: activeSourceText.current,
        sourceLang: sourceLang === '自動認識' ? '自動認識' : sourceLang,
        targetLang,
        isNative: false,
        customTone: toneText,
      });
      setPreview(prev => ({
        ...prev,
        translation: result.translation,
        reverseTranslation: result.reverse_translation || '',
      }));
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
    } else {
      setLockedSliderPosition(sliderBucket);
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
          <Text style={styles.messageSubText}>
            （{isSelf ? msg.reverseTranslation : msg.translation}）
          </Text>

          {/* 解説トグル */}
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

          {/* 展開された解説 */}
          {isExpanded && (
            <View style={[styles.explanationBox, isSelf ? styles.explanationSelf : styles.explanationPartner]}>
              {msg.explanation ? (
                <>
                  {msg.explanation.point ? (
                    <View style={styles.explanationPointRow}>
                      <Text style={styles.pointIcon}>💡</Text>
                      <Text style={styles.pointText}>{msg.explanation.point}</Text>
                    </View>
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

  // ══════════════════════════════════════════════
  // 描画
  // ══════════════════════════════════════════════

  const hasTranslationResult = showPreview || translationCache.current[getCacheKey('_base', 0)] !== undefined;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ── 言語選択バー ── */}
      <View style={[styles.langBar, isPartnerMode ? styles.langBarPartner : styles.langBarSelf]}>
        <TouchableOpacity
          style={styles.langButton}
          onPress={() => { setLangModalTarget('source'); setLangModalVisible(true); }}
        >
          <Text style={styles.langButtonText}>
            {LANGUAGES.find(l => l.name === sourceLang)?.flag} {sourceLang}
          </Text>
        </TouchableOpacity>

        <Text style={styles.langArrow}>→</Text>

        <TouchableOpacity
          style={styles.langButton}
          onPress={() => { setLangModalTarget('target'); setLangModalVisible(true); }}
        >
          <Text style={styles.langButtonText}>
            {LANGUAGES.find(l => l.name === targetLang)?.flag} {targetLang}
          </Text>
        </TouchableOpacity>
      </View>

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
        <View style={styles.previewContainer}>
          <View style={styles.previewLabelRow}>
            <Text style={styles.previewLabel}>翻訳プレビュー</Text>
            {toneLoading && <ActivityIndicator size="small" color="#4A90D9" style={{ marginLeft: 8 }} />}
          </View>
          <Text selectable style={styles.previewTranslation}>{preview.translation}</Text>
          <Text style={styles.previewReverse}>（{preview.reverseTranslation}）</Text>

          {/* トーン差分解説トグル */}
          {(toneDiffExplanation || toneDiffLoading || preview.explanation) && (
            <View style={styles.toneDiffSection}>
              <TouchableOpacity
                onPress={() => setToneDiffExpanded(!toneDiffExpanded)}
                style={styles.explanationToggle}
              >
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
                        <View style={styles.explanationPointRow}>
                          <Text style={styles.pointIcon}>💡</Text>
                          <Text style={styles.pointText}>{toneDiffExplanation.point}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.explanationDetailText}>{toneDiffExplanation.explanation}</Text>
                    </>
                  ) : preview.explanation ? (
                    <>
                      {preview.explanation.point ? (
                        <View style={styles.explanationPointRow}>
                          <Text style={styles.pointIcon}>💡</Text>
                          <Text style={styles.pointText}>{preview.explanation.point}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.explanationDetailText}>{preview.explanation.explanation}</Text>
                    </>
                  ) : null}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* ═══ selfモード: ニュアンス調整エリア ═══ */}
      {isSelfMode && showPreview && (
        <View style={styles.nuanceContainer}>
          {/* スライダー（トーン調整がアクティブな時のみ） */}
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
                    onValueChange={handleSliderChange}
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

          {/* トーン調整 / カスタム / ロック ボタン行 */}
          <View style={styles.toneActionsRow}>
            <TouchableOpacity
              style={[styles.toneBtn, toneAdjusted && !isCustomActive && styles.toneBtnActive]}
              onPress={handleToneAdjust}
              disabled={!hasTranslationResult || loading}
            >
              <Text style={[styles.toneBtnText, toneAdjusted && !isCustomActive && styles.toneBtnTextActive]}>
                🎨 トーン調整
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toneBtn, isCustomActive && styles.toneBtnActive]}
              onPress={handleCustomToggle}
              disabled={!hasTranslationResult || loading}
            >
              <Text style={[styles.toneBtnText, isCustomActive && styles.toneBtnTextActive]}>
                カスタム
              </Text>
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

      {/* ═══ 入力エリア ═══ */}
      <View style={[styles.inputArea, isPartnerMode ? styles.inputAreaPartner : styles.inputAreaSelf]}>
        {/* 検出言語 */}
        {detectedLang && sourceLang === '自動認識' && (
          <Text style={styles.detectedLangText}>検出: {detectedLang}</Text>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={isPartnerMode ? '相手のメッセージを貼り付け...' : 'メッセージを入力...'}
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={setInputText}
            multiline
            numberOfLines={2}
          />

          <View style={styles.btnStack}>
            {isPartnerMode ? (
              <>
                <TouchableOpacity style={styles.pasteBtn} onPress={handlePaste}>
                  <Text style={styles.pasteBtnText}>ペースト</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.translateBtn, (loading || !inputText.trim()) && styles.btnDisabled]}
                  onPress={handlePartnerTranslate}
                  disabled={loading || !inputText.trim()}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#333" />
                  ) : (
                    <Text style={styles.translateBtnText}>翻訳</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.convertBtn, (loading || !inputText.trim()) && styles.btnDisabled]}
                  onPress={handleSelfTranslate}
                  disabled={loading || !inputText.trim()}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#333" />
                  ) : (
                    <Text style={styles.convertBtnText}>翻訳</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendBtn, !showPreview && styles.btnDisabled]}
                  onPress={handleSelfSend}
                  disabled={!showPreview}
                >
                  <Text style={styles.sendBtnText}>📋 コピー</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>

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

  // ── 言語バー ──
  langBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  langBarPartner: {
    backgroundColor: 'rgba(255,219,193,0.2)',
  },
  langBarSelf: {
    backgroundColor: 'rgba(181,234,215,0.2)',
  },
  langButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  langButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333333',
  },
  langArrow: {
    color: '#9CA3AF',
    fontSize: 14,
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
  },

  // ── メッセージ行 ──
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
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
  },
  messageSubText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
    marginTop: 2,
  },

  // ── 解説 ──
  explanationToggle: {
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  explanationToggleText: {
    fontSize: 12,
    fontWeight: '600',
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
    backgroundColor: 'rgba(255,249,230,0.8)',
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  pointIcon: {
    fontSize: 14,
  },
  pointText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#333333',
    lineHeight: 20,
  },
  explanationDetailText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 24,
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
  },
  errorDismiss: {
    color: '#CC0000',
    fontSize: 16,
    fontWeight: '700',
    paddingLeft: 12,
  },

  // ── プレビュー（selfモード） ──
  previewContainer: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderTopWidth: 2,
    borderTopColor: '#B5EAD7',
    maxHeight: 250,
  },
  previewLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewTranslation: {
    color: '#333333',
    fontWeight: '700',
    fontSize: 16,
    marginTop: 8,
    lineHeight: 24,
  },
  previewReverse: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 6,
    fontWeight: '500',
  },
  toneDiffSection: {
    marginTop: 8,
  },

  // ── ニュアンス調整エリア ──
  nuanceContainer: {
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 12,
    paddingVertical: 12,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sliderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderEmoji: {
    fontSize: 20,
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
  },
  toneBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  toneBtnActive: {
    backgroundColor: '#F0F2F5',
    borderColor: '#6366f1',
  },
  toneBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  toneBtnTextActive: {
    color: '#6366f1',
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
  },
  customTranslateBtn: {
    backgroundColor: '#B5EAD7',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customTranslateBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },

  // ── 入力エリア ──
  inputArea: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  inputAreaPartner: {
    backgroundColor: 'rgba(255,219,193,0.2)',
  },
  inputAreaSelf: {
    backgroundColor: 'rgba(181,234,215,0.2)',
  },
  detectedLangText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  btnStack: {
    gap: 6,
    justifyContent: 'center',
  },

  // partner ボタン
  pasteBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#FFB7B2',
    alignItems: 'center',
  },
  pasteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  translateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#B5EAD7',
    alignItems: 'center',
  },
  translateBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },

  // self ボタン
  convertBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#B5EAD7',
    alignItems: 'center',
  },
  convertBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  sendBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#d4a5c9',
    alignItems: 'center',
  },
  sendBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
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
  },
  modalCheck: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '700',
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
  },
});
