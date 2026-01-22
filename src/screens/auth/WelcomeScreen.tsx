import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Trophy, Users, ArrowRight } from 'lucide-react-native';

export default function WelcomeScreen({ navigation }: any) {

    // Clean any previous intent on mount, just in case
    useEffect(() => {
        AsyncStorage.removeItem('@matchpro:user_intent');
    }, []);

    const handleChoice = async (intent: 'CREATE_TEAM' | 'JOIN_TEAM') => {
        try {
            await AsyncStorage.setItem('@matchpro:user_intent', intent);

            // Navigate to Login (or Register if you prefer default, but Login is standard)
            // The AuthStack has 'Login' and 'Register'
            navigation.navigate('Login');
        } catch (error) {
            console.error("Failed to save intent", error);
            // Fallback
            navigation.navigate('Login');
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-[#F8FAFC]">
            <View className="flex-1 px-6 justify-center">

                {/* Header / Logo Area */}
                <View className="items-center mb-12">
                    {/* Placeholder for Logo if image exists, else Text */}
                    <View className="w-20 h-20 bg-[#006400] rounded-3xl items-center justify-center mb-6 shadow-xl shadow-green-900/20 rotate-3">
                        <Trophy size={40} color="white" />
                    </View>

                    <Text className="text-4xl font-black italic text-slate-900 tracking-tighter text-center mb-2">
                        MATCHPRO
                    </Text>
                    <Text className="text-slate-400 font-bold uppercase tracking-widest text-xs text-center">
                        Elite Sports Management
                    </Text>
                </View>

                {/* Main Question */}
                <Text className="text-2xl font-black italic text-slate-900 mb-8 text-center">
                    Como você quer começar?
                </Text>

                {/* Options */}
                <View className="gap-4">

                    {/* Option 1: Create Team */}
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => handleChoice('CREATE_TEAM')}
                        className="bg-slate-900 p-6 rounded-3xl shadow-lg shadow-slate-300 relative overflow-hidden group"
                    >
                        <View className="absolute top-0 right-0 -mr-4 -mt-4 opacity-10">
                            <Trophy size={100} color="white" />
                        </View>

                        <View className="flex-row items-center justify-between z-10">
                            <View className="flex-1 mr-4">
                                <View className="bg-white/10 w-12 h-12 rounded-2xl items-center justify-center mb-4">
                                    <Trophy size={24} color="#4ade80" />
                                </View>
                                <Text className="text-white font-black italic text-xl mb-1">
                                    Criar um time
                                </Text>
                                <Text className="text-slate-400 font-medium text-sm">
                                    Sou organizador, quero gerenciar jogos e financeiro.
                                </Text>
                            </View>
                            <View className="bg-white/10 p-3 rounded-full">
                                <ArrowRight size={20} color="white" />
                            </View>
                        </View>
                    </TouchableOpacity>

                    {/* Option 2: Join Team */}
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => handleChoice('JOIN_TEAM')}
                        className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden"
                    >
                        <View className="absolute top-0 right-0 -mr-4 -mt-4 opacity-5">
                            <Users size={100} color="black" />
                        </View>

                        <View className="flex-row items-center justify-between z-10">
                            <View className="flex-1 mr-4">
                                <View className="bg-slate-100 w-12 h-12 rounded-2xl items-center justify-center mb-4">
                                    <Users size={24} color="#0F172A" />
                                </View>
                                <Text className="text-slate-900 font-black italic text-xl mb-1">
                                    Entrar em um time
                                </Text>
                                <Text className="text-slate-500 font-medium text-sm">
                                    Já tenho um convite ou código de acesso.
                                </Text>
                            </View>
                            <View className="bg-slate-50 p-3 rounded-full">
                                <ArrowRight size={20} color="#0F172A" />
                            </View>
                        </View>
                    </TouchableOpacity>

                </View>

                {/* Footer Login Link */}
                <View className="mt-12 flex-row justify-center items-center">
                    <Text className="text-slate-400 font-medium">Já tem uma conta?</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                        <Text className="text-[#006400] font-black uppercase text-xs tracking-widest ml-2">
                            Fazer Login
                        </Text>
                    </TouchableOpacity>
                </View>

            </View>
        </SafeAreaView>
    );
}
