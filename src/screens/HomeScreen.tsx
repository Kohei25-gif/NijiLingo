import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Translate: { mode: 'receive' | 'send' };
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>NijiLingo</Text>
          <Text style={styles.titleDot}>.</Text>
        </View>

        {/* メインボタン */}
        <View style={styles.mainButtons}>
          <TouchableOpacity
            style={[styles.mainButton, styles.partnerButton]}
            onPress={() => navigation.navigate('Translate', { mode: 'receive' })}
            activeOpacity={0.8}
          >
            <Text style={styles.mainButtonIcon}>📨</Text>
            <Text style={styles.mainButtonLabel}>相手のメッセージを{'\n'}翻訳</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainButton, styles.selfButton]}
            onPress={() => navigation.navigate('Translate', { mode: 'send' })}
            activeOpacity={0.8}
          >
            <Text style={styles.mainButtonIcon}>✍️</Text>
            <Text style={styles.mainButtonLabel}>自分の文章を{'\n'}送る</Text>
          </TouchableOpacity>
        </View>

        {/* サブボタン */}
        <View style={styles.subButtons}>
          <TouchableOpacity style={styles.subButton} activeOpacity={0.7}>
            <Text style={styles.subButtonIcon}>💬</Text>
            <Text style={styles.subButtonText}>トークルーム</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.subButton} activeOpacity={0.7}>
            <Text style={styles.subButtonIcon}>🎤</Text>
            <Text style={styles.subButtonText}>対面モード</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.subButton} activeOpacity={0.7}>
            <Text style={styles.subButtonIcon}>⚙️</Text>
            <Text style={styles.subButtonText}>設定</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9F7F2',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#333333',
    letterSpacing: -0.5,
  },
  titleDot: {
    fontSize: 32,
    fontWeight: '700',
    color: '#B5EAD7',
  },
  mainButtons: {
    gap: 16,
    marginBottom: 40,
  },
  mainButton: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    gap: 12,
  },
  partnerButton: {
    backgroundColor: '#FFB7B2',
  },
  selfButton: {
    backgroundColor: '#B5EAD7',
  },
  mainButtonIcon: {
    fontSize: 40,
  },
  mainButtonLabel: {
    color: '#333333',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  subButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  subButton: {
    alignItems: 'center',
    padding: 12,
    gap: 6,
  },
  subButtonIcon: {
    fontSize: 28,
  },
  subButtonText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});
