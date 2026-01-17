import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Users, Trophy, Wallet, Plus } from 'lucide-react-native';

// Screens
import HomeScreen from '@/screens/home/HomeScreen';
import RosterScreen from '@/screens/roster/RosterScreen';
import MatchesScreen from '@/screens/matches/MatchesScreen';
import FinanceScreen from '@/screens/finance/FinanceScreen';

// Placeholders
const ActionsPlaceholder = ({ navigation }: any) => (
    <View className="flex-1 bg-[#F8FAFC] items-center justify-center p-6">
        <Text className="text-2xl font-black italic text-slate-900 mb-8 uppercase tracking-tighter">Ações Rápidas</Text>
        <View className="flex-row flex-wrap gap-4 justify-center">
            <TouchableOpacity
                className="w-32 h-32 bg-white rounded-3xl items-center justify-center shadow-sm border border-slate-100"
                onPress={() => navigation.navigate('Elenco', { screen: 'PlayerDetails', params: { mode: 'create' } })}
            >
                <Users size={32} color="#006400" />
                <Text className="mt-2 font-black italic text-[10px] uppercase text-slate-500 tracking-widest">Novo Atleta</Text>
            </TouchableOpacity>
            <TouchableOpacity
                className="w-32 h-32 bg-white rounded-3xl items-center justify-center shadow-sm border border-slate-100"
                onPress={() => navigation.navigate('Partidas')}
            >
                <Trophy size={32} color="#00BFFF" />
                <Text className="mt-2 font-black italic text-[10px] uppercase text-slate-500 tracking-widest">Novo Jogo</Text>
            </TouchableOpacity>
        </View>
    </View>
);

const Tab = createBottomTabNavigator();

function CustomTabBar({ state, descriptors, navigation }: any) {
    return (
        <View className="absolute bottom-8 left-6 right-6 bg-white rounded-[2.5rem] h-20 shadow-xl shadow-slate-300 flex-row items-center justify-around border border-slate-100/50">
            {state.routes.map((route: any, index: number) => {
                const { options } = descriptors[route.key];
                const isFocused = state.index === index;

                const onPress = () => {
                    const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                    });

                    if (!isFocused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                    }
                };

                if (route.name === 'Actions') {
                    return (
                        <TouchableOpacity
                            key={index}
                            onPress={onPress}
                            className="-top-10 items-center justify-center p-2"
                            activeOpacity={0.9}
                        >
                            <View className="w-16 h-16 bg-[#006400] rounded-2xl transform rotate-45 items-center justify-center shadow-lg shadow-green-900/40 border-[6px] border-[#F8FAFC]">
                                <View className="transform -rotate-45">
                                    <Plus size={32} color="white" strokeWidth={3} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    );
                }

                let IconComponent = Home;
                if (route.name === 'Dashboard') IconComponent = Home;
                else if (route.name === 'Elenco') IconComponent = Users;
                else if (route.name === 'Partidas') IconComponent = Trophy;
                else if (route.name === 'Financeiro') IconComponent = Wallet;

                const color = isFocused ? '#0F172A' : '#94A3B8';

                return (
                    <TouchableOpacity
                        key={index}
                        onPress={onPress}
                        className="items-center justify-center h-full flex-1"
                        activeOpacity={0.6}
                    >
                        <IconComponent size={24} color={color} strokeWidth={isFocused ? 2.5 : 2} />
                        {isFocused && <View className="w-1.5 h-1.5 bg-[#006400] rounded-full mt-1 absolute bottom-3" />}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

export default function MainTabNavigator() {
    return (
        <Tab.Navigator
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{ headerShown: false }}
            initialRouteName="Dashboard"
        >
            <Tab.Screen name="Dashboard" component={HomeScreen} />
            <Tab.Screen name="Elenco" component={RosterScreen} />
            <Tab.Screen name="Actions" component={ActionsPlaceholder} />
            <Tab.Screen name="Partidas" component={MatchesScreen} />
            <Tab.Screen name="Financeiro" component={FinanceScreen} />
        </Tab.Navigator>
    );
}
