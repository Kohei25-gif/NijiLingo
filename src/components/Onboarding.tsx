// 初回起動オンボーディング（4枚スライド）
// AsyncStorageのフラグで初回のみ表示。App.tsxからオーバーレイとして描画する
import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Slide = {
  key: string;
  emoji: string;
  title: string;
  body: string;
  accent: string;
};

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    emoji: '🌈',
    title: 'ようこそ NijiLingo へ',
    body: '意味はそのまま、気持ちまで伝わる翻訳アプリ。\n10言語に対応しています。',
    accent: '#7C83FD',
  },
  {
    key: 'nuance',
    emoji: '😎🎩',
    title: 'ニュアンス調整',
    body: 'スライダーを動かすと、同じ意味のまま\nカジュアル⇔ていねいに口調が変わります。',
    accent: '#F0A35E',
  },
  {
    key: 'reverse',
    emoji: '🔁',
    title: '逆翻訳で安心',
    body: '翻訳文が相手にどう伝わるかを\n日本語で確認してから送れます。',
    accent: '#5EC2B7',
  },
  {
    key: 'modes',
    emoji: '🎤',
    title: '対面モード & トークルーム',
    body: '目の前の相手とその場で会話したり、\n相手ごとに翻訳の履歴を管理できます。',
    accent: '#E58BB9',
  },
];

type Props = {
  onDone: () => void;
};

export default function Onboarding({ onDone }: Props) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const isLast = index === SLIDES.length - 1;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (newIndex !== index && newIndex >= 0 && newIndex < SLIDES.length) {
      setIndex(newIndex);
    }
  };

  const goNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.skipButton} onPress={onDone} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={styles.skipText}>スキップ</Text>
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={[styles.emojiCircle, { backgroundColor: `${item.accent}22` }]}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[styles.dot, i === index && { backgroundColor: SLIDES[index].accent, width: 20 }]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: SLIDES[index].accent }]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextText}>{isLast ? 'はじめる' : 'つぎへ'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FDFCF9',
    zIndex: 100,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
  },
  skipText: {
    color: '#9A9A9A',
    fontSize: 14,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 40,
  },
  emojiCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  emoji: {
    fontSize: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3A3A3A',
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: '#6E6E6E',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 56,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DDD8D0',
  },
  nextButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
