import './global.css';
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, BackHandler } from 'react-native';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { lightTheme, darkTheme } from '@/constants/theme';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, firebaseConfig } from '@/services/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';

// Screens
import LoginScreen from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import ProfileSetupScreen from '@/screens/auth/ProfileSetupScreen';
import CreateTeamScreen from '@/screens/team/CreateTeamScreen';
import JoinTeamScreen from '@/screens/team/JoinTeamScreen';
import TeamSelectionScreen from '@/screens/team/TeamSelectionScreen';
import TeamSettingsScreen from '@/screens/team/TeamSettingsScreen';
import PlayerDetailsScreen from '@/screens/roster/PlayerDetailsScreen';
import MatchDetailsScreen from '@/screens/matches/MatchDetailsScreen';
import MatchSummaryScreen from '@/screens/matches/MatchSummaryScreen';
import MatchVotingScreen from '@/screens/matches/MatchVotingScreen';
import MainLayout from '@/navigation/MainLayout';

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  // Stores
  const { setAuthUser, setUserData, setLoading, isLoading, authUser, user: userProfile } = useAuthStore((state: any) => state);
  const teamId = useTeamStore((state: any) => state.teamId);

  // Navigation State
  const [currentScreen, setCurrentScreen] = useState('Loading');
  const [navParams, setNavParams] = useState<any>({});
  const [screenHistory, setScreenHistory] = useState<string[]>([]);

  // Auth Listener
  useEffect(() => {
    setLoading(true);
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setAuthUser(currentUser);
        if (currentUser.isAnonymous) {
          setUserData(null);
          setLoading(false);
          return;
        }
        // Fetch Profile
        try {
          const appId = firebaseConfig.appId;
          const profilePath = `artifacts/${appId}/users/${currentUser.uid}/profile/data`;
          let userDoc = await getDoc(doc(db, profilePath));

          if (userDoc.exists()) {
            setUserData({ id: userDoc.id, ...userDoc.data() });
          } else {
            const legacyDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (legacyDoc.exists()) setUserData({ id: legacyDoc.id, ...legacyDoc.data() });
            else setUserData(null);
          }
        } catch (e) { console.error(e); }
      } else {
        setAuthUser(null);
        setUserData(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Route Logic
  useEffect(() => {
    if (isLoading) {
      setCurrentScreen('Loading');
      return;
    }
    if (!authUser) {
      if (currentScreen !== 'Register') setCurrentScreen('Login');
    } else if (!userProfile && !authUser.isAnonymous) {
      setCurrentScreen('ProfileSetup');
    } else if (!teamId) {
      // If in Join/Create flow, stay there, else TeamSelection
      if (!['TeamSelection', 'CreateTeam', 'JoinTeam', 'JoinTeamInvite'].includes(currentScreen)) {
        setCurrentScreen('TeamSelection');
      }
    } else {
      // Default to Main if newly authenticated
      if (['Login', 'Loading', 'TeamSelection'].includes(currentScreen)) {
        setCurrentScreen('Main');
      }
    }
  }, [authUser, userProfile, teamId, isLoading]);

  // Back Button Handler
  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [screenHistory, currentScreen]);


  // Navigation Handlers
  const handleNavigate = (screen: string, params: any = {}) => {
    setScreenHistory(prev => [...prev, currentScreen]);
    setCurrentScreen(screen);
    setNavParams(params);
  };

  const handleBack = () => {
    if (screenHistory.length > 0) {
      const prev = screenHistory[screenHistory.length - 1];
      setScreenHistory(prevHist => prevHist.slice(0, -1));
      setCurrentScreen(prev);
    } else {
      // If no history, intelligent fallback
      if (['PlayerDetails', 'MatchDetails', 'MatchSummary', 'TeamSettings'].includes(currentScreen)) {
        setCurrentScreen('Main');
      }
    }
  };

  // Mock Navigation Prop for Screens
  const navigationProp = {
    navigate: handleNavigate,
    goBack: handleBack,
    reset: (state: any) => {
      const target = state?.routes?.[0]?.name || 'Main';
      setCurrentScreen(target);
      setScreenHistory([]);
    },
    setOptions: () => { },
    addListener: () => () => { },
  };

  const routeProp = { params: navParams };

  // Render Content
  const renderContent = () => {
    switch (currentScreen) {
      case 'Loading': return <View className="flex-1 justify-center items-center"><ActivityIndicator size="large" color="#006400" /></View>;
      case 'Login': return <LoginScreen navigation={navigationProp} />;
      case 'Register': return <RegisterScreen navigation={navigationProp} />;
      case 'ProfileSetup': return <ProfileSetupScreen />;
      case 'TeamSelection': return <TeamSelectionScreen navigation={navigationProp} />;
      case 'CreateTeam': return <CreateTeamScreen navigation={navigationProp} />;
      case 'JoinTeam': return <JoinTeamScreen route={routeProp} navigation={navigationProp} />;
      case 'JoinTeamInvite': return <JoinTeamScreen route={routeProp} navigation={navigationProp} />;

      // Modals / Detail Screens
      case 'PlayerDetails': return <PlayerDetailsScreen route={routeProp} navigation={navigationProp} />;
      case 'MatchDetails': return <MatchDetailsScreen route={routeProp} navigation={navigationProp} />;
      case 'MatchSummary': return <MatchSummaryScreen route={routeProp} navigation={navigationProp} />;
      case 'MatchVoting': return <MatchVotingScreen route={routeProp} navigation={navigationProp} />;
      case 'TeamSettings': return <TeamSettingsScreen navigation={navigationProp} />;

      case 'Main':
      default:
        return <MainLayout onNavigate={handleNavigate} />;
    }
  };

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <PaperProvider theme={theme}>
        {renderContent()}
      </PaperProvider>
    </SafeAreaProvider>
  );
}
