import React from 'react';
import { View, TouchableOpacity, Text, Animated, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Users, Trophy, Wallet, Plus, UserPlus } from 'lucide-react-native';

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



function CustomTabBar({ state, navigation }: any) {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const animation = React.useRef(new Animated.Value(0)).current;

    const toggleMenu = () => {
        const toValue = isMenuOpen ? 0 : 1;

        Animated.spring(animation, {
            toValue,
            useNativeDriver: true,
            friction: 5,
        }).start();

        setIsMenuOpen(!isMenuOpen);
    };

    const rotation = animation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '45deg']
    });

    // Sub-buttons animations
    const matchButtonTransY = animation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -120]
    });

    const ghostButtonTransY = animation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -120]
    });

    const matchButtonTransX = animation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -70]
    });

    const ghostButtonTransX = animation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 70]
    });

    const buttonOpacity = animation;

    return (
        <>
            {/* Overlay when menu is open */}
            {isMenuOpen && (
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    className="bg-black/40 z-40 absolute bottom-0 top-[-1000px] left-0 right-0 h-[2000px]"
                    activeOpacity={1}
                    onPress={toggleMenu}
                />
            )}

            <View className="absolute bottom-8 left-6 right-6 z-50">

                {/* Floating Action Buttons (Speed Dial) */}
                <View className="absolute bottom-10 left-0 right-0 items-center justify-center" pointerEvents="box-none">
                    {/* Create Match Button (Left) */}
                    <Animated.View style={{
                        opacity: buttonOpacity,
                        transform: [{ translateY: matchButtonTransY }, { translateX: matchButtonTransX }],
                        position: 'absolute'
                    }}>
                        <TouchableOpacity
                            onPress={() => {
                                toggleMenu();
                                navigation.navigate('Partidas');
                                setTimeout(() => navigation.navigate('MatchDetails', { mode: 'create' }), 100);
                            }}
                            className="items-center"
                        >
                            <View className="w-14 h-14 bg-white rounded-full items-center justify-center shadow-lg border border-slate-100 mb-1">
                                <Trophy size={24} color="#00BFFF" />
                            </View>
                            <Text className="text-white font-bold text-[10px] bg-slate-900/80 px-2 py-1 rounded-md overflow-hidden">NOVO JOGO</Text>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Ghost Player Button (Right) */}
                    <Animated.View style={{
                        opacity: buttonOpacity,
                        transform: [{ translateY: ghostButtonTransY }, { translateX: ghostButtonTransX }],
                        position: 'absolute'
                    }}>
                        <TouchableOpacity
                            onPress={() => {
                                toggleMenu();
                                navigation.navigate('Elenco', { screen: 'PlayerDetails', params: { mode: 'create' } });
                            }}
                            className="items-center"
                        >
                            <View className="w-14 h-14 bg-white rounded-full items-center justify-center shadow-lg border border-slate-100 mb-1">
                                <UserPlus size={24} color="#006400" />
                            </View>
                            <Text className="text-white font-bold text-[10px] bg-slate-900/80 px-2 py-1 rounded-md overflow-hidden">ADD JOGADOR</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>

                {/* Main Tab Bar */}
                <View className="bg-white rounded-[2.5rem] h-20 shadow-xl shadow-slate-300 flex-row items-center justify-around border border-slate-100/50">
                    {state.routes.map((route: any, index: number) => {
                        // Removed unused options variable
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
                                <View key={index} className="-top-10 items-center justify-center p-2 z-50">
                                    <TouchableOpacity
                                        onPress={toggleMenu}
                                        activeOpacity={0.9}
                                    >
                                        <Animated.View style={{ transform: [{ rotate: rotation }] }} className="w-16 h-16 bg-[#006400] rounded-2xl items-center justify-center shadow-lg shadow-green-900/40 border-[6px] border-[#F8FAFC]">
                                            <Plus size={32} color="white" strokeWidth={3} />
                                        </Animated.View>
                                    </TouchableOpacity>
                                </View>
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
            </View>
        </>
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
