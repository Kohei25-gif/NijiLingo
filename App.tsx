import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import { AppDataProvider } from './src/context/AppDataContext';
import HomeScreen from './src/screens/HomeScreen';
import TranslateScreen from './src/screens/TranslateScreen';
import ListScreen from './src/screens/ListScreen';
import ChatScreen from './src/screens/ChatScreen';
import FaceToFaceScreen from './src/screens/FaceToFaceScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import Onboarding from './src/components/Onboarding';

const ONBOARDING_DONE_KEY = 'nijilingo_onboarding_done';

SplashScreen.preventAutoHideAsync();

type RootStackParamList = {
  Home: undefined;
  Translate: { mode: 'receive' | 'send' };
  List: undefined;
  Chat: { partnerId: number };
  FaceToFace: { partnerId?: number };
  Settings: { partnerId: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // P24: フォント読込失敗(error)を無視すると永久ハングするため、fontError時も先に進める
  const [fontsLoaded, fontError] = useFonts({
    Quicksand_400Regular,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
  });
  const fontsReady = fontsLoaded || fontError;

  // P24: オンボーディング。null=判定中, true=表示, false=非表示
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DONE_KEY)
      .then(val => setShowOnboarding(val === null))
      .catch(() => setShowOnboarding(false)); // getItem失敗時は表示しない（安全側）
  }, []);

  const handleOnboardingDone = useCallback(() => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1').catch(() => {});
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady || showOnboarding === null) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <AppDataProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Translate"
              component={TranslateScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="List"
              component={ListScreen}
              options={{ title: '📋 トークルーム', headerShadowVisible: false, headerTitleStyle: { fontFamily: 'Quicksand_600SemiBold' } }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ title: 'チャット', headerShadowVisible: false, headerTitleStyle: { fontFamily: 'Quicksand_600SemiBold' } }}
            />
            <Stack.Screen
              name="FaceToFace"
              component={FaceToFaceScreen}
              options={{ title: '🎤 対面モード', headerShadowVisible: false, headerTitleStyle: { fontFamily: 'Quicksand_600SemiBold' } }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: '⚙️ 設定', headerShadowVisible: false, headerTitleStyle: { fontFamily: 'Quicksand_600SemiBold' } }}
            />
          </Stack.Navigator>
          <StatusBar style="auto" />
        </NavigationContainer>
      </AppDataProvider>
      {/* P24: 初回起動時のみオンボーディングをオーバーレイ表示 */}
      {showOnboarding && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Onboarding onDone={handleOnboardingDone} />
        </View>
      )}
    </View>
  );
}
