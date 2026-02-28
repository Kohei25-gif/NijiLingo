import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AppDataProvider } from './src/context/AppDataContext';
import HomeScreen from './src/screens/HomeScreen';
import TranslateScreen from './src/screens/TranslateScreen';
import ListScreen from './src/screens/ListScreen';
import ChatScreen from './src/screens/ChatScreen';
import FaceToFaceScreen from './src/screens/FaceToFaceScreen';
import SettingsScreen from './src/screens/SettingsScreen';

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
  return (
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
            options={({ route }) => ({
              title: route.params.mode === 'receive' ? '📨 相手のメッセージを翻訳' : '✍️ 自分の文章を送る',
              headerBackTitle: 'ホーム',
              headerStyle: {
                backgroundColor: route.params.mode === 'receive'
                  ? 'rgba(255,219,193,0.3)'
                  : 'rgba(181,234,215,0.3)',
              },
              headerTintColor: '#333333',
              headerTitleStyle: { fontWeight: '600', fontSize: 14 },
              headerShadowVisible: false,
            })}
          />
          <Stack.Screen
            name="List"
            component={ListScreen}
            options={{ title: '📋 トークルーム', headerShadowVisible: false }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ title: 'チャット', headerShadowVisible: false }}
          />
          <Stack.Screen
            name="FaceToFace"
            component={FaceToFaceScreen}
            options={{ title: '🎤 対面モード', headerShadowVisible: false }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: '⚙️ 設定', headerShadowVisible: false }}
          />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </AppDataProvider>
  );
}
