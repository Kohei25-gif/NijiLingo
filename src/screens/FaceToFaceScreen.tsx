import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import * as Speech from 'expo-speech';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic, Volume2, Globe } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { translateFull } from '../services/groq';
import { LANG_CODE_MAP, LANGUAGE_OPTIONS } from '../constants/languages';
import { useAppData } from '../context/AppDataContext';

type RootStackParamList = {
  FaceToFace: { partnerId?: number };
};

type Props = NativeStackScreenProps<RootStackParamList, 'FaceToFace'>;

type FaceToFaceResult = {
  original: string;
  translation: string;
};

export default function FaceToFaceScreen({ route }: Props) {
  const { partners, currentPartnerId, setCurrentPartnerId } = useAppData();
  const routePartnerId = route.params?.partnerId ?? null;
  const partnerId = routePartnerId ?? currentPartnerId;
  const partner = partners.find(p => p.id === partnerId);

  const [faceToFaceMode, setFaceToFaceMode] = useState<'idle' | 'self' | 'partner'>('idle');
  const [faceToFaceInput, setFaceToFaceInput] = useState('');
  const [faceToFaceResult, setFaceToFaceResult] = useState<FaceToFaceResult | null>(null);
  const [f2fMyLanguage, setF2fMyLanguage] = useState('日本語');
  const [f2fPartnerLanguage, setF2fPartnerLanguage] = useState(partner?.language || '英語');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    if (partnerId) setCurrentPartnerId(partnerId);
  }, [partnerId, setCurrentPartnerId]);

  useEffect(() => {
    if (partner?.language) setF2fPartnerLanguage(partner.language);
  }, [partner?.language]);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const handleFaceToFaceTranslate = async (mode: 'self' | 'partner') => {
    setFaceToFaceMode(mode);
    const inputText = faceToFaceInput.trim();
    if (!inputText) return;

    const sourceLang = mode === 'self' ? f2fMyLanguage : f2fPartnerLanguage;
    const targetLang = mode === 'self' ? f2fPartnerLanguage : f2fMyLanguage;

    try {
      setIsTranslating(true);
      const result = await translateFull({
        sourceText: inputText,
        sourceLang,
        targetLang,
        isNative: false,
      });
      setFaceToFaceResult({ original: inputText, translation: result.translation });
    } catch {
      setFaceToFaceResult({ original: inputText, translation: '翻訳エラーが発生しました' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSpeak = (text: string) => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    const targetLang = faceToFaceMode === 'self' ? f2fPartnerLanguage : f2fMyLanguage;
    const langCode = LANG_CODE_MAP[targetLang] || 'en-US';
    setIsSpeaking(true);
    Speech.speak(text, {
      language: langCode,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleMicPress = () => {
    Alert.alert(
      '音声入力',
      '音声入力はDev Clientビルドが必要です。\nテキスト入力をお使いください。',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          {partner?.avatarImage ? (
            <Image source={{ uri: partner.avatarImage }} style={styles.partnerAvatarImage} />
          ) : (
            <LinearGradient
              colors={['#FFDAC1', '#E2F0CB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.partnerAvatarContainer}
            >
              <Text style={styles.partnerAvatar}>{partner?.avatar ?? '👤'}</Text>
            </LinearGradient>
          )}
          <View>
            <Text style={styles.partnerName}>{partner?.name ?? '対面モード'}</Text>
            <Text style={styles.modeLabel}>対面モード</Text>
          </View>
        </View>
        <View style={styles.languageBadge}>
          <Text style={styles.languageBadgeText}>{f2fPartnerLanguage}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* 会話カード */}
        <View style={styles.card}>
          <View style={styles.inputArea}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textArea}
                placeholder="ここにテキストを入力、または音声入力..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                value={faceToFaceInput}
                onChangeText={setFaceToFaceInput}
              />
              <TouchableOpacity onPress={handleMicPress}>
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.micButton}
                >
                  <Mic size={24} color="white" strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {faceToFaceResult && (
            <LinearGradient
              colors={['#f0f9ff', '#e0f2fe']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.resultArea}
            >
              <View style={styles.resultHeader}>
                <Text style={styles.resultLang}>
                  {faceToFaceMode === 'self' ? f2fPartnerLanguage : f2fMyLanguage}
                </Text>
                <TouchableOpacity onPress={() => handleSpeak(faceToFaceResult.translation)}>
                  <LinearGradient
                    colors={isSpeaking ? ['#ef4444', '#dc2626'] : ['#667eea', '#764ba2']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.speakButton}
                  >
                    <Volume2 size={20} color="white" strokeWidth={2.5} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
              <Text style={styles.resultText}>{faceToFaceResult.translation}</Text>
            </LinearGradient>
          )}
        </View>

        {/* 翻訳ボタン */}
        <View style={styles.translateButtons}>
          <TouchableOpacity
            onPress={() => handleFaceToFaceTranslate('self')}
            style={styles.translateButtonTouchable}
            activeOpacity={0.8}
          >
            {faceToFaceMode === 'self' ? (
              <LinearGradient
                colors={['#FFB7B2', '#FFDAC1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.translateButton}
              >
                <View style={styles.translateButtonIconBgActive}>
                  <Text style={styles.translateButtonIcon}>🇯🇵</Text>
                </View>
                <View style={styles.translateButtonTextContainer}>
                  <Text style={[styles.translateButtonLabel, styles.translateButtonLabelActive]}>自分が話す</Text>
                  <Text style={[styles.translateButtonSub, styles.translateButtonSubActive]}>{f2fMyLanguage} → {f2fPartnerLanguage}</Text>
                </View>
              </LinearGradient>
            ) : (
              <View style={styles.translateButton}>
                <View style={styles.translateButtonIconBg}>
                  <Text style={styles.translateButtonIcon}>🇯🇵</Text>
                </View>
                <View style={styles.translateButtonTextContainer}>
                  <Text style={styles.translateButtonLabel}>自分が話す</Text>
                  <Text style={styles.translateButtonSub}>{f2fMyLanguage} → {f2fPartnerLanguage}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleFaceToFaceTranslate('partner')}
            style={styles.translateButtonTouchable}
            activeOpacity={0.8}
          >
            {faceToFaceMode === 'partner' ? (
              <LinearGradient
                colors={['#B5EAD7', '#C7CEEA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.translateButton}
              >
                <View style={styles.translateButtonIconBgActive}>
                  <Globe size={24} color="#333" strokeWidth={2} />
                </View>
                <View style={styles.translateButtonTextContainer}>
                  <Text style={[styles.translateButtonLabel, styles.translateButtonLabelActive]}>相手が話す</Text>
                  <Text style={[styles.translateButtonSub, styles.translateButtonSubActive]}>{f2fPartnerLanguage} → {f2fMyLanguage}</Text>
                </View>
              </LinearGradient>
            ) : (
              <View style={styles.translateButton}>
                <View style={styles.translateButtonIconBg}>
                  <Globe size={24} color="#333" strokeWidth={2} />
                </View>
                <View style={styles.translateButtonTextContainer}>
                  <Text style={styles.translateButtonLabel}>相手が話す</Text>
                  <Text style={styles.translateButtonSub}>{f2fPartnerLanguage} → {f2fMyLanguage}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {isTranslating && (
          <View style={styles.translatingRow}>
            <ActivityIndicator size="small" color="#4A90D9" />
            <Text style={styles.translatingText}>翻訳中...</Text>
          </View>
        )}

        {/* 言語セレクター */}
        <View style={styles.languageSelectors}>
          <View style={styles.languageSelect}>
            <Text style={styles.languageLabel}>自分</Text>
            <View style={styles.languageList}>
              {LANGUAGE_OPTIONS.map(lang => (
                <TouchableOpacity
                  key={lang.name}
                  onPress={() => setF2fMyLanguage(lang.name)}
                  style={[styles.languageChip, f2fMyLanguage === lang.name && styles.languageChipActive]}
                >
                  <Text style={[styles.languageChipText, f2fMyLanguage === lang.name && styles.languageChipTextActive]}>
                    {lang.flag} {lang.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.languageSelect}>
            <Text style={styles.languageLabel}>相手</Text>
            <View style={styles.languageList}>
              {LANGUAGE_OPTIONS.map(lang => (
                <TouchableOpacity
                  key={lang.name}
                  onPress={() => setF2fPartnerLanguage(lang.name)}
                  style={[styles.languageChip, f2fPartnerLanguage === lang.name && styles.languageChipActive]}
                >
                  <Text style={[styles.languageChipText, f2fPartnerLanguage === lang.name && styles.languageChipTextActive]}>
                    {lang.flag} {lang.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F7F2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(255, 183, 178, 0.2)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 4,
    zIndex: 10,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  partnerAvatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatar: {
    fontSize: 24,
    fontFamily: 'Quicksand_400Regular',
  },
  partnerAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    fontFamily: 'Quicksand_700Bold',
  },
  modeLabel: {
    fontSize: 12,
    color: '#C7CEEA',
    fontWeight: '600',
    fontFamily: 'Quicksand_600SemiBold',
  },
  languageBadge: {
    backgroundColor: '#F0F2F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  languageBadgeText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    fontFamily: 'Quicksand_600SemiBold',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    gap: 16,
  },
  // 会話カード
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  inputArea: {
    padding: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  textArea: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    borderRadius: 16,
    padding: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    lineHeight: 26,
    fontFamily: 'Quicksand_500Medium',
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(102, 126, 234, 0.4)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 4,
  },
  micIcon: {
    fontSize: 24,
    fontFamily: 'Quicksand_400Regular',
  },
  // 翻訳結果エリア
  resultArea: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e7ef',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultLang: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Quicksand_600SemiBold',
  },
  speakButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakIcon: {
    fontSize: 20,
    color: 'white',
    fontFamily: 'Quicksand_400Regular',
  },
  resultText: {
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 32,
    color: '#1e3a5f',
    fontFamily: 'Quicksand_500Medium',
  },
  // 翻訳ボタン
  translateButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  translateButtonTouchable: {
    flex: 1,
    borderRadius: 20,
    shadowColor: 'rgba(74, 85, 104, 0.05)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  translateButtonIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  translateButtonIconBgActive: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  translateButtonIcon: {
    fontSize: 24,
    fontFamily: 'Quicksand_400Regular',
  },
  translateButtonTextContainer: {
    flex: 1,
  },
  translateButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    fontFamily: 'Quicksand_700Bold',
  },
  translateButtonLabelActive: {
    color: '#FFFFFF',
  },
  translateButtonSub: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 2,
    fontFamily: 'Quicksand_500Medium',
  },
  translateButtonSubActive: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  translatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  translatingText: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'Quicksand_400Regular',
  },
  // 言語セレクター
  languageSelectors: {
    gap: 12,
  },
  languageSelect: {
    gap: 6,
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    fontFamily: 'Quicksand_600SemiBold',
  },
  languageList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  languageChipActive: {
    backgroundColor: '#B5EAD7',
  },
  languageChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'Quicksand_600SemiBold',
  },
  languageChipTextActive: {
    color: '#333',
  },
});
