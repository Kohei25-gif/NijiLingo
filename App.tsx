import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import TranslateScreen from './src/screens/TranslateScreen';

type RootStackParamList = {
  Home: undefined;
  Translate: { mode: 'receive' | 'send' };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
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
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
