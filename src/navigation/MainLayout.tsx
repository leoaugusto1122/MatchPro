import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, Text, Animated, StyleSheet } from 'react-native';
import { Home, Users, Trophy, Wallet, Plus, UserPlus, TrendingUp, TrendingDown } from 'lucide-react-native';
import { useTeamStore } from '@/stores/teamStore'; // Import Store

// Screens
import HomeScreen from '@/screens/home/HomeScreen';
import RosterScreen from '@/screens/roster/RosterScreen';
import MatchesScreen from '@/screens/matches/MatchesScreen';
import FinanceScreen from '@/screens/finance/FinanceScreen';

interface MainLayoutProps {
    onNavigate: (screen: string, params?: any) => void;
}

export default function MainLayout({ onNavigate }: MainLayoutProps) {
    const { currentRole } = useTeamStore(state => state);
    const isAdmin = currentRole === 'owner' || currentRole === 'staff'; // Check Permissions

    const [currentTab, setCurrentTab] = useState<'Dashboard' | 'Elenco' | 'Partidas' | 'Financeiro'>('Dashboard');
    const [financeParams, setFinanceParams] = useState<any>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const animation = useRef(new Animated.Value(0)).current;

    // Reset finance params when leaving tab or after use (handled by FinanceScreen reset loop maybe? 
    // Actually, FinanceScreen resets its internal state, but prop params persist. 
    // Let's clear them when switching away from Financeiro.
    useEffect(() => {
        if (currentTab !== 'Financeiro') {
            setFinanceParams(null);
        }
    }, [currentTab]);

    const toggleMenu = () => {
        const toValue = isMenuOpen ? 0 : 1;
        Animated.spring(animation, { toValue, useNativeDriver: true, friction: 5 }).start();
        setIsMenuOpen(!isMenuOpen);
    };

    const rotation = animation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

    // Animations for FAB Items
    // 1. Nova Saída (Red) - Top Left
    const expenseTransY = animation.interpolate({ inputRange: [0, 1], outputRange: [0, -150] });
    const expenseTransX = animation.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });

    // 2. Nova Entrada (Green) - Top Right
    const incomeTransY = animation.interpolate({ inputRange: [0, 1], outputRange: [0, -150] });
    const incomeTransX = animation.interpolate({ inputRange: [0, 1], outputRange: [0, 50] });

    // 3. Novo Jogo (Blue) - Mid Left
    const matchTransY = animation.interpolate({ inputRange: [0, 1], outputRange: [0, -90] });
    const matchTransX = animation.interpolate({ inputRange: [0, 1], outputRange: [0, -100] });

    // 4. Novo Jogador (Green) - Mid Right
    const ghostTransY = animation.interpolate({ inputRange: [0, 1], outputRange: [0, -90] });
    const ghostTransX = animation.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });

    const opacity = animation;

    // Helper to switch tab and set params
    const goToFinance = (action: 'new_income' | 'new_expense') => {
        setFinanceParams({ action });
        setCurrentTab('Financeiro');
        toggleMenu();
    };

    const renderContent = () => {
        switch (currentTab) {
            case 'Dashboard': return <HomeScreen navigation={{ navigate: onNavigate }} onTabChange={setCurrentTab} />;
            case 'Elenco': return <RosterScreen navigation={{ navigate: onNavigate }} />;
            case 'Partidas': return <MatchesScreen navigation={{ navigate: onNavigate }} />;
            case 'Financeiro': return <FinanceScreen route={{ params: financeParams }} />;
            default: return <HomeScreen navigation={{ navigate: onNavigate }} onTabChange={setCurrentTab} />;
        }
    };

    return (
        <View className="flex-1 bg-[#F8FAFC]">
            <View className="flex-1">
                {renderContent()}
            </View>

            {/* Menu Overlay */}
            {isMenuOpen && (
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    className="bg-black/40 z-40 absolute bottom-0 top-0 left-0 right-0"
                    activeOpacity={1}
                    onPress={toggleMenu}
                />
            )}

            {/* Tab Bar Container */}
            <View className="absolute bottom-8 left-6 right-6 z-50">
                {/* Speed Dial Buttons - ONLY FOR ADMIN */}
                {isAdmin && (
                    <View
                        className="absolute bottom-10 left-0 right-0 items-center justify-center"
                        pointerEvents={isMenuOpen ? 'box-none' : 'none'}
                    >

                        {/* 1. Nova Saída */}
                        <Animated.View style={{ opacity, transform: [{ translateY: expenseTransY }, { translateX: expenseTransX }], position: 'absolute', zIndex: 60 }}>
                            <TouchableOpacity onPress={() => goToFinance('new_expense')} className="items-center">
                                <View className="w-12 h-12 bg-red-500 rounded-full items-center justify-center shadow-lg border border-white mb-1">
                                    <TrendingDown size={20} color="white" />
                                </View>
                                <Text className="text-white font-bold text-[10px] bg-slate-900/80 px-2 py-1 rounded-md overflow-hidden">SAÍDA</Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* 2. Nova Entrada */}
                        <Animated.View style={{ opacity, transform: [{ translateY: incomeTransY }, { translateX: incomeTransX }], position: 'absolute', zIndex: 60 }}>
                            <TouchableOpacity onPress={() => goToFinance('new_income')} className="items-center">
                                <View className="w-12 h-12 bg-emerald-500 rounded-full items-center justify-center shadow-lg border border-white mb-1">
                                    <TrendingUp size={20} color="white" />
                                </View>
                                <Text className="text-white font-bold text-[10px] bg-slate-900/80 px-2 py-1 rounded-md overflow-hidden">ENTRADA</Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* 3. Create Match */}
                        <Animated.View style={{ opacity, transform: [{ translateY: matchTransY }, { translateX: matchTransX }], position: 'absolute', zIndex: 60 }}>
                            <TouchableOpacity onPress={() => { toggleMenu(); onNavigate('MatchDetails', { mode: 'create' }); }} className="items-center">
                                <View className="w-14 h-14 bg-white rounded-full items-center justify-center shadow-lg border border-slate-100 mb-1">
                                    <Trophy size={24} color="#00BFFF" />
                                </View>
                                <Text className="text-white font-bold text-[10px] bg-slate-900/80 px-2 py-1 rounded-md overflow-hidden">NOVO JOGO</Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* 4. Create Player */}
                        <Animated.View style={{ opacity, transform: [{ translateY: ghostTransY }, { translateX: ghostTransX }], position: 'absolute', zIndex: 60 }}>
                            <TouchableOpacity onPress={() => { toggleMenu(); onNavigate('PlayerDetails', { mode: 'create' }); }} className="items-center">
                                <View className="w-14 h-14 bg-white rounded-full items-center justify-center shadow-lg border border-slate-100 mb-1">
                                    <UserPlus size={24} color="#006400" />
                                </View>
                                <Text className="text-white font-bold text-[10px] bg-slate-900/80 px-2 py-1 rounded-md overflow-hidden">ADD JOGADOR</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </View>
                )}

                {/* Tab Bar */}
                <View className="bg-white rounded-[2.5rem] h-20 shadow-xl shadow-slate-300 flex-row items-center justify-around border border-slate-100/50">
                    <TabButton icon={Home} label="Dashboard" active={currentTab === 'Dashboard'} onPress={() => setCurrentTab('Dashboard')} />
                    <TabButton icon={Users} label="Elenco" active={currentTab === 'Elenco'} onPress={() => setCurrentTab('Elenco')} />

                    {/* FAB Trigger - ONLY FOR ADMIN */}
                    <View className="-top-10 items-center justify-center p-2 z-50">
                        {isAdmin ? (
                            <TouchableOpacity onPress={toggleMenu} activeOpacity={0.9}>
                                <Animated.View style={{ transform: [{ rotate: rotation }] }} className="w-16 h-16 bg-[#006400] rounded-2xl items-center justify-center shadow-lg shadow-green-900/40 border-[6px] border-[#F8FAFC]">
                                    <Plus size={32} color="white" strokeWidth={3} />
                                </Animated.View>
                            </TouchableOpacity>
                        ) : (
                            <View className="w-16 h-16 bg-slate-200 rounded-2xl items-center justify-center border-[6px] border-[#F8FAFC] opacity-20">
                                {/* Disabled State for Non-Admins: Just empty or icon */}
                            </View>
                        )}
                    </View>

                    <TabButton icon={Trophy} label="Partidas" active={currentTab === 'Partidas'} onPress={() => setCurrentTab('Partidas')} />
                    <TabButton icon={Wallet} label="Financeiro" active={currentTab === 'Financeiro'} onPress={() => setCurrentTab('Financeiro')} />
                </View>
            </View>
        </View>
    );
}

const TabButton = ({ icon: Icon, active, onPress }: any) => (
    <TouchableOpacity onPress={onPress} className="items-center justify-center h-full flex-1" activeOpacity={0.6}>
        <Icon size={24} color={active ? '#0F172A' : '#94A3B8'} strokeWidth={active ? 2.5 : 2} />
        {active && <View className="w-1.5 h-1.5 bg-[#006400] rounded-full mt-1 absolute bottom-3" />}
    </TouchableOpacity>
);
