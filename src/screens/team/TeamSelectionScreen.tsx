import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { useAuthStore } from '@/stores/authStore';
import { Crown, Shield, Plus, ArrowRight, LogOut } from 'lucide-react-native';
import { db } from '@/services/firebase';
import { collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore';
import { Player, Team } from '@/types/models';

import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TeamSelectionScreen({ navigation }: any) {
    const { user, authUser, signOut } = useAuthStore();
    const { setTeamContext } = useTeamStore();
    const [teams, setTeams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [checkingIntent, setCheckingIntent] = useState(true);

    useEffect(() => {
        const checkPendingActions = async () => {
            try {
                // 1. Check for Pending Invites (Deep Link or stored invite)
                const pending = await AsyncStorage.getItem('pendingInvite');
                if (pending) {
                    const { team, token } = JSON.parse(pending);
                    await AsyncStorage.removeItem('pendingInvite');
                    navigation.navigate('JoinTeam', { teamId: team, token });
                    return;
                }

                // 2. Check for User Intent (Selection from Welcome Screen)
                const intent = await AsyncStorage.getItem('@matchpro:user_intent');
                if (intent === 'CREATE_TEAM') {
                    await AsyncStorage.removeItem('@matchpro:user_intent');
                    navigation.navigate('CreateTeam', { initialMode: 'create' });
                    return;
                } else if (intent === 'JOIN_TEAM') {
                    await AsyncStorage.removeItem('@matchpro:user_intent');
                    navigation.navigate('JoinTeam'); // Defaults to input-code view
                    return;
                }

            } catch (e) {
                console.error(e);
            } finally {
                setCheckingIntent(false);
            }
        };
        checkPendingActions();
    }, []);

    useEffect(() => {
        const userId = user?.id || authUser?.uid;
        if (!userId) return;

        // Query teams where user is owner OR member
        // Using memberIds array is the most scalable way to query "my teams"
        // We will listen to changes in real-time
        const q = query(
            collection(db, 'teams'),
            where('memberIds', 'array-contains', userId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const teamList = snapshot.docs.map(doc => {
                const data = doc.data() as Team;
                // Destructure id to avoid 'duplicate property' warnings when spreading
                const { id: _, ...teamData } = data;

                // Determine role based on members map or ownerId
                let role = 'player';
                if (teamData.ownerId === userId) {
                    role = 'owner';
                } else if (teamData.members && teamData.members[userId]) {
                    role = teamData.members[userId];
                }

                return {
                    id: doc.id,
                    ...teamData,
                    role
                };
            });
            setTeams(teamList);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching teams:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, authUser]);

    const handleSelectTeam = async (team: any) => {
        setLoading(true);
        try {
            // Fetch the user's player profile for this specific team
            // Players are stored in a subcollection: teams/{teamId}/players
            const playersRef = collection(db, 'teams', team.id, 'players');
            const qPlayer = query(playersRef, where('userId', '==', user?.id), limit(1));
            const playerSnap = await getDocs(qPlayer);

            let playerProfile: Player | null = null;
            if (!playerSnap.empty) {
                const doc = playerSnap.docs[0];
                playerProfile = { id: doc.id, ...doc.data() } as Player;
            } else {
                // If it's the owner but no player profile exists (rare edge case), create a mock one or handle appropriately?
                // For now, allow null, but logic might require it. 
                // Usually TeamSetup creates it.
            }

            setTeamContext(
                team.id,
                team.name,
                team.role,
                playerProfile
            );
            // Navigation to Main is handled by AppNavigator listening to teamId

        } catch (error) {
            console.error("Error selecting team:", error);
            Alert.alert("Erro", "Não foi possível selecionar o time.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        signOut();
        // Navigation handled by auth state change
    };

    const ownerTeams = teams.filter(t => t.role === 'owner');
    const playerTeams = teams.filter(t => t.role !== 'owner');

    if (loading || checkingIntent) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#F8FAFC]">
            {/* Header Customizado */}
            <View className="pt-16 pb-6 px-6 bg-[#0F172A] flex-row justify-between items-center">
                <View>
                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">
                        Bem-vindo, {user?.displayName?.split(' ')[0]}
                    </Text>
                    <Text className="text-white text-2xl font-black italic">
                        SELECIONE SEU TIME
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={handleLogout}
                    className="w-10 h-10 bg-slate-800 rounded-xl justify-center items-center"
                >
                    <LogOut size={18} color="#EF4444" />
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 50 }}>

                {/* Owner Section */}
                <View className="mb-8">
                    <View className="flex-row items-center mb-4 space-x-2">
                        <Crown size={20} color="#F59E0B" />
                        <Text className="text-slate-900 font-black italic text-lg tracking-tighter">
                            GESTÃO (DONO)
                        </Text>
                    </View>

                    {ownerTeams.length === 0 && (
                        <Text className="text-slate-400 italic text-sm mb-4">Você ainda não possui times.</Text>
                    )}

                    {ownerTeams.map((team) => (
                        <TouchableOpacity
                            key={team.id}
                            onPress={() => handleSelectTeam(team)}
                            activeOpacity={0.9}
                            className="bg-white rounded-[2rem] p-4 mb-4 shadow-sm border border-slate-100 flex-row items-center"
                        >
                            <View className="w-16 h-16 rounded-2xl bg-slate-50 items-center justify-center mr-4 relative overflow-hidden">
                                {team.badgeURL ? (
                                    <Image source={{ uri: team.badgeURL }} className="w-12 h-12" resizeMode="contain" />
                                ) : (
                                    <View className="w-12 h-12 bg-slate-200 rounded-full items-center justify-center">
                                        <Text className="text-slate-400 font-black text-xs">{team.name.substring(0, 2).toUpperCase()}</Text>
                                    </View>
                                )}
                                <View className="absolute bottom-0 right-0 bg-amber-500 p-1 rounded-tl-lg">
                                    <Crown size={10} color="white" />
                                </View>
                            </View>

                            <View className="flex-1">
                                <Text className="text-slate-900 font-black italic text-xl mb-1" numberOfLines={1}>{team.name}</Text>
                                <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                                    {team.members ? Object.keys(team.members).length : 1} Membros
                                </Text>
                            </View>

                            <View className="bg-slate-50 p-2 rounded-full">
                                <ArrowRight size={20} color="#cbd5e1" />
                            </View>
                        </TouchableOpacity>
                    ))}

                    <TouchableOpacity
                        className="bg-[#006400]/10 border border-[#006400] border-dashed rounded-[2rem] p-4 flex-row items-center justify-center space-x-2"
                        onPress={() => navigation.navigate('CreateTeam', { forceAction: true, initialMode: 'create' })}
                    >
                        <Plus size={20} color="#006400" />
                        <Text className="text-[#006400] font-black italic text-sm uppercase tracking-widest">Criar Novo Time</Text>
                    </TouchableOpacity>
                </View>

                {/* Player Section */}
                <View className="mb-8">
                    <View className="flex-row items-center mb-4 space-x-2">
                        <Shield size={20} color="#3B82F6" />
                        <Text className="text-slate-900 font-black italic text-lg tracking-tighter">
                            ATUANDO COMO JOGADOR
                        </Text>
                    </View>

                    {playerTeams.length === 0 && (
                        <Text className="text-slate-400 italic text-sm mb-4">Você não participa de outros times.</Text>
                    )}

                    {playerTeams.map((team) => (
                        <TouchableOpacity
                            key={team.id}
                            onPress={() => handleSelectTeam(team)}
                            activeOpacity={0.9}
                            className="bg-white rounded-[2rem] p-4 mb-4 shadow-sm border border-slate-100 flex-row items-center"
                        >
                            <View className="w-16 h-16 rounded-2xl bg-slate-50 items-center justify-center mr-4 overflow-hidden">
                                {team.badgeURL ? (
                                    <Image source={{ uri: team.badgeURL }} className="w-12 h-12" resizeMode="contain" />
                                ) : (
                                    <View className="w-12 h-12 bg-slate-200 rounded-full items-center justify-center">
                                        <Text className="text-slate-400 font-black text-xs">{team.name.substring(0, 2).toUpperCase()}</Text>
                                    </View>
                                )}
                            </View>

                            <View className="flex-1">
                                <Text className="text-slate-900 font-black italic text-xl mb-1" numberOfLines={1}>{team.name}</Text>
                                <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                                    {team.members ? Object.keys(team.members).length : 1} Membros
                                </Text>
                            </View>

                            <View className="bg-slate-50 p-2 rounded-full">
                                <ArrowRight size={20} color="#cbd5e1" />
                            </View>
                        </TouchableOpacity>
                    ))}

                    <TouchableOpacity
                        className="bg-slate-100 border border-slate-200 border-dashed rounded-[2rem] p-4 flex-row items-center justify-center space-x-2"
                        onPress={() => navigation.navigate('JoinTeam')}
                    >
                        <Plus size={20} color="#94A3B8" />
                        <Text className="text-slate-500 font-black italic text-sm uppercase tracking-widest">Entrar com Código</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </View>
    );
}
