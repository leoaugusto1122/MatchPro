import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Screens
import HomeScreen from '@/screens/home/HomeScreen';
import RosterScreen from '@/screens/roster/RosterScreen';
import MatchesScreen from '@/screens/matches/MatchesScreen';

// Placeholders
import { View, Text } from 'react-native';
function ProfileScreen() { return <View><Text>Perfil (WIP)</Text></View>; }

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
    const theme = useTheme();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: theme.colors.primary,
                tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
                tabBarStyle: {
                    backgroundColor: theme.colors.surface,
                    borderTopColor: theme.colors.outline,
                },
                tabBarIcon: ({ color, size, focused }) => {
                    let iconName = 'circle';

                    if (route.name === 'Dashboard') {
                        iconName = focused ? 'view-dashboard' : 'view-dashboard-outline';
                    } else if (route.name === 'Elenco') {
                        iconName = focused ? 'account-group' : 'account-group-outline';
                    } else if (route.name === 'Partidas') {
                        iconName = focused ? 'soccer' : 'soccer';
                    } else if (route.name === 'Perfil') {
                        iconName = focused ? 'account' : 'account-outline';
                    }

                    return <Icon name={iconName} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="Dashboard" component={HomeScreen} />
            <Tab.Screen name="Elenco" component={RosterScreen} />
            <Tab.Screen name="Partidas" component={MatchesScreen} />
            <Tab.Screen name="Perfil" component={ProfileScreen} />
        </Tab.Navigator>
    );
}
