import { AnekLatin_400Regular, AnekLatin_500Medium, AnekLatin_600SemiBold, AnekLatin_700Bold, useFonts } from '@expo-google-fonts/anek-latin';
import { AnekTamil_400Regular, AnekTamil_500Medium, AnekTamil_600SemiBold, AnekTamil_700Bold } from '@expo-google-fonts/anek-tamil';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../lib/i18n';
import { AppProvider, useApp } from '../lib/store';
import { colors, layout } from '../theme';

void SplashScreen.preventAutoHideAsync();

function Frame() {
  const { ready } = useApp();
  if (!ready) return null;
  return (
    // On a phone this fills the screen; in a wide browser the app stays phone-width, centred.
    <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: layout.maxWidth, backgroundColor: colors.appCanvas, overflow: 'hidden' }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.appCanvas } }} />
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    AnekLatin_400Regular,
    AnekLatin_500Medium,
    AnekLatin_600SemiBold,
    AnekLatin_700Bold,
    AnekTamil_400Regular,
    AnekTamil_500Medium,
    AnekTamil_600SemiBold,
    AnekTamil_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <AppProvider>
          <StatusBar style="light" />
          <Frame />
        </AppProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
