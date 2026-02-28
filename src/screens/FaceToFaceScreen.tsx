import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import * as Speech from 'expo-speech';
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
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          {partner?.avatarImage ? (
            <Image source={{ uri: partner.avatarImage }} style={styles.partnerAvatarImage} />
          ) : (
            <Text style={styles.partnerAvatar}>{partner?.avatar ?? '👤'}</Text>
          )}
          <View>
            <Text style={styles.partnerName}>{partner?.name ?? '対面モード'}</Text>
            <Text style={styles.modeLabel}>対面モード</Text>
          </View>
        </View>
        <Text style={styles.languageBadge}>{f2fPartnerLanguage}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.inputArea}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textArea}
              placeholder="ここにテキストを入力、または🎤で音声入力..."
              placeholderTextColor="#9CA3AF"
              multiline
              value={faceToFaceInput}
              onChangeText={setFaceToFaceInput}
            />
            <TouchableOpacity
              onPress={handleMicPress}
              style={styles.micButton}
            >
              <Text style={styles.micIcon}>🎤</Text>
            </TouchableOpacity>
          </View>
        </View>

        {faceToFaceResult && (
          <View style={styles.resultArea}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultLang}>
                {faceToFaceMode === 'self' ? f2fPartnerLanguage : f2fMyLanguage}
              </Text>
              <TouchableOpacity onPress={() => handleSpeak(faceToFaceResult.translation)}>
                <Text style={[styles.speakButton, isSpeaking && styles.speakButtonActive]}>
                  🔊
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.resultText}>{faceToFaceResult.translation}</Text>
          </View>
        )}
      </View>

      <View style={styles.translateButtons}>
        <TouchableOpacity
          onPress={() => handleFaceToFaceTranslate('self')}
          style={[styles.translateButton, styles.selfButton, faceToFaceMode === 'self' && styles.translateButtonActive]}
        >
          <Text style={styles.translateButtonIcon}>🇯🇵</Text>
          <View>
            <Text style={styles.translateButtonLabel}>自分が話す</Text>
            <Text style={styles.translateButtonSub}>{f2fMyLanguage} → {f2fPartnerLanguage}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleFaceToFaceTranslate('partner')}
          style={[styles.translateButton, styles.partnerButton, faceToFaceMode === 'partner' && styles.translateButtonActive]}
        >
          <Text style={styles.translateButtonIcon}>🌍</Text>
          <View>
            <Text style={styles.translateButtonLabel}>相手が話す</Text>
            <Text style={styles.translateButtonSub}>{f2fPartnerLanguage} → {f2fMyLanguage}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {isTranslating && (
        <View style={styles.translatingRow}>
          <ActivityIndicator size="small" color="#4A90D9" />
          <Text style={styles.translatingText}>翻訳中...</Text>
        </View>
      )}

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
                <Text style={styles.languageChipText}>{lang.flag} {lang.name}</Text>
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
                <Text style={styles.languageChipText}>{lang.flag} {lang.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F7F2', padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partnerAvatar: { fontSize: 26 },
  partnerAvatarImage: { width: 32, height: 32, borderRadius: 16 },
  partnerName: { fontSize: 16, fontWeight: '700', color: '#333' },
  modeLabel: { fontSize: 12, color: '#9CA3AF' },
  languageBadge: { backgroundColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#eee' },
  inputArea: { marginBottom: 12 },
  inputWrapper: { flexDirection: 'row', gap: 10 },
  textArea: { flex: 1, backgroundColor: '#F9F7F2', borderRadius: 10, padding: 12, minHeight: 90, textAlignVertical: 'top', borderWidth: 1, borderColor: '#eee' },
  micButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 20 },
  resultArea: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultLang: { fontSize: 12, color: '#6B7280' },
  speakButton: { fontSize: 20 },
  speakButtonActive: { color: '#4A90D9' },
  resultText: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 8, lineHeight: 24 },
  translateButtons: { marginTop: 16, gap: 10 },
  translateButton: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  translateButtonActive: { borderColor: '#4A90D9', backgroundColor: '#EEF6FF' },
  selfButton: { backgroundColor: '#FFF7ED' },
  partnerButton: { backgroundColor: '#F0F9FF' },
  translateButtonIcon: { fontSize: 22 },
  translateButtonLabel: { fontWeight: '700', color: '#333' },
  translateButtonSub: { fontSize: 12, color: '#6B7280' },
  translatingRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  translatingText: { fontSize: 12, color: '#6B7280' },
  languageSelectors: { marginTop: 16, gap: 12 },
  languageSelect: { gap: 6 },
  languageLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  languageList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  languageChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#F3F4F6' },
  languageChipActive: { backgroundColor: '#B5EAD7' },
  languageChipText: { fontSize: 12, fontWeight: '600', color: '#333' },
});
