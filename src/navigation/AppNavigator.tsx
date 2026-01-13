import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { useAuthStore } from '@/stores/authStore';

import { useTeamStore } from '@/stores/teamStore';

// Screens / Stacks
import LoginScreen from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import TeamSetupScreen from '@/screens/team/TeamSetupScreen';
import MainTabNavigator from '@/navigation/MainTabNavigator';
import PlayerDetailsScreen from '@/screens/roster/PlayerDetailsScreen';
import MatchDetailsScreen from '@/screens/matches/MatchDetailsScreen';
import TeamSettingsScreen from '@/screens/team/TeamSettingsScreen';

const Stack = createNativeStackNavigator();

function AuthStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
        </Stack.Navigator>
    );
}

export default function AppNavigator() {
    const user = useAuthStore((state: any) => state.user);
    const teamId = useTeamStore((state: any) => state.teamId);
    const isLoading = useAuthStore((state: any) => state.isLoading);

    if (isLoading) {
        // Ideally use splash screen
        return null;
    }

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!user ? (
                    <Stack.Screen name="Auth" component={AuthStack} />
                ) : !teamId ? (
                    <Stack.Screen name="TeamSetup" component={TeamSetupScreen} />
                ) : (
                    <>
                        <Stack.Screen name="Main" component={MainTabNavigator} />
                        <Stack.Screen
                            name="PlayerDetails"
                            component={PlayerDetailsScreen}
                            options={{ headerShown: true, title: 'Jogador', presentation: 'modal' }}
                        />
                        <Stack.Screen
                            name="MatchDetails"
                            component={MatchDetailsScreen}
                            options={{ headerShown: true, title: 'Partida', presentation: 'card' }}
                        />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
