import React from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from '@/navigation/AppNavigator';
import { useAuth } from '@/hooks/useAuth';
import { lightTheme, darkTheme } from '@/constants/theme';

function AppContent() {
  // Initialize auth listener globally
  useAuth();
  return <AppNavigator />;
}

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <AppContent />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
