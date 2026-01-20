import React, { useEffect, useState } from 'react';
import { View, FlatList, ActivityIndicator, Text } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Player } from '@/types/models';
import { User, Target, Activity, Star, Shield, AlertTriangle } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TransactionService } from '@/services/transactionService';

export default function RosterScreen({ navigation }: any) {
    const teamId = useTeamStore(state => state.teamId);
    // const { canManageRoster } = usePermissions(); // Unused currently

    const myPlayerProfile = useTeamStore(state => state.myPlayerProfile);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!teamId) return;

        const q = query(collection(db, 'teams', teamId, 'players'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Player[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() } as Player);
            });
            // Sort by name for better presentation
            list.sort((a, b) => a.name.localeCompare(b.name));
            setPlayers(list);
            setLoading(false);
        }, (error) => {
            console.error(error);
            setLoading(false);
        });

        // Subscribe to Pending Finance
        const unsubFinance = TransactionService.subscribeToPendingTransactions(teamId, (txs) => {
            const map: Record<string, boolean> = {};
            txs.forEach(t => {
                if (t.playerId && t.status === 'pending') {
                    map[t.playerId] = true;
                }
            });
            setPendingMap(map);
        });

        return () => {
            unsubscribe();
            unsubFinance();
        }
    }, [teamId]);

    const handleAddPlayer = () => {
        navigation.navigate('PlayerDetails', { mode: 'create' });
    };

    const getPositionAbbr = (pos?: string) => {
        switch (pos) {
            case 'GK': return 'GOL';
            case 'DEF': return 'DEF';
            case 'MID': return 'MEI';
            case 'FWD': return 'ATA';
            default: return '???';
        }
    };

    const renderItem = ({ item }: { item: Player }) => (
        <Card className="mb-3 border-0 shadow-sm" onTouchEnd={() => {
            navigation.navigate('PlayerDetails', { playerId: item.id, mode: 'view' });
        }}>
            <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                    {/* Avatar */}
                    <View className={`w-12 h-12 rounded-2xl items-center justify-center mr-4 ${item.status === 'active' ? 'bg-slate-900' : 'bg-slate-100'}`}>
                        <Text className={`font-black italic ${item.status === 'active' ? 'text-white' : 'text-slate-400'}`}>
                            {item.name.substring(0, 2).toUpperCase()}
                        </Text>
                    </View>

                    <View className="flex-1">
                        <View className="flex-row items-center">
                            <Text className="font-bold text-slate-800 text-lg" numberOfLines={1}>{item.name}</Text>
                            {/* YOU Indicator */}
                            {myPlayerProfile && item.id === myPlayerProfile.id && (
                                <View className="bg-slate-200 px-2 py-0.5 rounded-full ml-2">
                                    <Text className="text-[10px] font-bold text-slate-600 uppercase">Você</Text>
                                </View>
                            )}
                        </View>

                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <Badge
                                label={getPositionAbbr(item.position)}
                                color="bg-slate-100"
                                textColor="text-slate-500"
                            />

                            {/* Pending Finance Warning */}
                            {pendingMap[item.id] && (
                                <View className="flex-row items-center bg-red-50 px-2 py-1 rounded-md border border-red-100">
                                    <AlertTriangle size={10} color="#EF4444" />
                                    <Text className="ml-1 text-[10px] font-bold text-red-500">PENDÊNCIA</Text>
                                </View>
                            )}

                            {/* Mini Stats */}
                            <View className="flex-row items-center bg-slate-50 px-2 py-1 rounded-md">
                                <Target size={10} color="#64748B" />
                                <Text className="ml-1 text-[10px] font-bold text-slate-600">{item.goals || 0}</Text>
                            </View>
                            <View className="flex-row items-center bg-slate-50 px-2 py-1 rounded-md">
                                <Activity size={10} color="#64748B" />
                                <Text className="ml-1 text-[10px] font-bold text-slate-600">{item.matchesPlayed || 0}J</Text>
                            </View>
                            {(item.fanRating || 0) > 0 && (
                                <View className="flex-row items-center bg-yellow-50 px-2 py-1 rounded-md">
                                    <Star size={10} color="#CA8A04" fill="#CA8A04" />
                                    <Text className="ml-1 text-[10px] font-bold text-yellow-700">{item.fanRating?.toFixed(1)}</Text>
                                </View>
                            )}
                            {(item.coachRating || 0) > 0 && (
                                <View className="flex-row items-center bg-blue-50 px-2 py-1 rounded-md">
                                    <Shield size={10} color="#2563EB" fill="#2563EB" />
                                    <Text className="ml-1 text-[10px] font-bold text-blue-700">{item.coachRating?.toFixed(1)}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Overall - requested */}
                <View className="items-end ml-4">
                    <Text className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">OVR</Text>
                    <Text className="text-xl font-black italic text-[#006400]">
                        {item.overallRating ? item.overallRating.toFixed(0) : '-'}
                    </Text>
                </View>
            </View>
        </Card>
    );

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#F8FAFC] pt-12 px-5">
            <Header title="ELENCO" subtitle={`${players.length} JOGADORES`} />

            <FlatList
                data={players}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View className="py-10 items-center">
                        <User size={48} color="#CBD5E1" />
                        <Text className="text-slate-400 mt-4 font-medium italic">Nenhum jogador cadastrado.</Text>
                    </View>
                }
            />

            {/* FAB Removed - Moved to Main Speed Dial */}
            {/* {canManageRoster && (
                <TouchableOpacity
                    className="absolute bottom-6 right-6 w-14 h-14 bg-[#006400] rounded-2xl items-center justify-center shadow-lg shadow-green-900/40 transform rotate-45"
                    onPress={handleAddPlayer}
                    activeOpacity={0.8}
                >
                    <View className="transform -rotate-45">
                        <Plus size={24} color="white" />
                    </View>
                </TouchableOpacity>
            )} */}
        </View>
    );
}
