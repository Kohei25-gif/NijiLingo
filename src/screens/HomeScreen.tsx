import { Alert, StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, Mic, Settings } from 'lucide-react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppData } from '../context/AppDataContext';

type RootStackParamList = {
  Home: undefined;
  Translate: { mode: 'receive' | 'send' };
  List: undefined;
  FaceToFace: { partnerId?: number };
  Settings: { partnerId: number };
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  const { currentPartnerId } = useAppData();
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
            onPress={() => navigation.navigate('Translate', { mode: 'receive' })}
            activeOpacity={0.8}
            style={styles.mainButtonTouchable}
          >
            <LinearGradient
              colors={['rgba(255, 219, 193, 0.5)', 'rgba(255, 219, 193, 0.3)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mainButton}
            >
              <Text style={styles.mainButtonIcon}>📨</Text>
              <Text style={styles.mainButtonLabel}>相手のメッセージを翻訳</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Translate', { mode: 'send' })}
            activeOpacity={0.8}
            style={styles.mainButtonTouchable}
          >
            <LinearGradient
              colors={['rgba(181, 234, 215, 0.5)', 'rgba(181, 234, 215, 0.3)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mainButton}
            >
              <Text style={styles.mainButtonIcon}>✍️</Text>
              <Text style={styles.mainButtonLabel}>自分の文章を送る</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* サブボタン */}
        <View style={styles.subButtons}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('List')}
          >
            <LinearGradient
              colors={['#B5EAD7', '#C7CEEA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.subButton}
            >
              <MessageCircle size={14} color="#333" strokeWidth={2} />
              <Text style={styles.subButtonText}>トークルーム</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('FaceToFace', { partnerId: currentPartnerId ?? undefined })}
          >
            <LinearGradient
              colors={['#B5EAD7', '#C7CEEA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.subButton}
            >
              <Mic size={14} color="#333" strokeWidth={2} />
              <Text style={styles.subButtonText}>対面モード</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (!currentPartnerId) {
                Alert.alert('設定', '設定する相手がいません。\nトークルームから相手を追加してください。');
                return;
              }
              navigation.navigate('Settings', { partnerId: currentPartnerId });
            }}
          >
            <LinearGradient
              colors={['#B5EAD7', '#C7CEEA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.subButton}
            >
              <Settings size={14} color="#333" strokeWidth={2} />
              <Text style={styles.subButtonText}>設定</Text>
            </LinearGradient>
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
    fontFamily: 'Quicksand_700Bold',
  },
  titleDot: {
    fontSize: 32,
    fontWeight: '700',
    color: '#B5EAD7',
    fontFamily: 'Quicksand_700Bold',
  },
  mainButtons: {
    gap: 16,
    marginBottom: 40,
    paddingHorizontal: 0,
  },
  mainButtonTouchable: {
    borderRadius: 16,
    // shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    // shadow for Android
    elevation: 2,
  },
  mainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    gap: 16,
  },
  mainButtonIcon: {
    fontSize: 26,
    fontFamily: 'Quicksand_400Regular',
  },
  mainButtonLabel: {
    color: '#333333',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    flex: 1,
    fontFamily: 'Quicksand_600SemiBold',
  },
  subButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  subButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 4,
  },
  subButtonIcon: {
    fontSize: 14,
    fontFamily: 'Quicksand_400Regular',
  },
  subButtonText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
    fontFamily: 'Quicksand_600SemiBold',
  },
});
