import './global.css';
import React from 'react';
import { useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from '@/navigation/AppNavigator';
import { lightTheme, darkTheme } from '@/constants/theme';

function AppContent() {
  // Auth listener is handled in AppNavigator
  return <AppNavigator />;
}

import * as Linking from 'expo-linking';

const linking = {
  prefixes: [Linking.createURL('/'), 'https://matchpro.app'],
  config: {
    screens: {
      JoinTeam: {
        path: 'convite/:teamId?',
        parse: {
          teamId: (teamId: string) => teamId,
        },
      },
      JoinTeamInvite: {
        path: 'invite',
        parse: {
          id: (id: string) => id,
        },
      },
    },
  },
};

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NavigationContainer linking={linking}>
          <AppContent />
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
