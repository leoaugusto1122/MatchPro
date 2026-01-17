import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { collection, query, where, orderBy, limit, getDocs, Timestamp, collectionGroup } from 'firebase/firestore';
import { Match, Player } from '@/types/models';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, MapPin, TrendingUp, Trophy, Target, AlertCircle, ChevronRight, Settings, LogOut } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function HomeScreen({ navigation }: any) {
    const { teamId, teamName, clearTeamContext } = useTeamStore();
    const { canManageTeam } = usePermissions();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [nextMatch, setNextMatch] = useState<Match | null>(null);
    const [confirmedCount, setConfirmedCount] = useState(0);
    const [lastMatch, setLastMatch] = useState<Match | null>(null);

    const [topScorers, setTopScorers] = useState<Player[]>([]);
    const [topMvps, setTopMvps] = useState<Player[]>([]);
    const [financials, setFinancials] = useState({ pending: 0, collected: 0 });

    const fetchData = async () => {
        if (!teamId) return;

        try {
            const now = new Date();

            // 1. Next Match
            const nextMatchQ = query(
                collection(db, 'teams', teamId, 'matches'),
                where('date', '>=', Timestamp.fromDate(now)),
                orderBy('date', 'asc'),
                limit(1)
            );
            const nextSnap = await getDocs(nextMatchQ);
            if (!nextSnap.empty) {
                const doc = nextSnap.docs[0];
                const data = doc.data() as Match;
                setNextMatch({ ...data, id: doc.id });

                // Count confirmed
                const count = data.presence
                    ? Object.values(data.presence).filter(p => p.status === 'confirmed').length
                    : 0;
                setConfirmedCount(count);
            } else {
                setNextMatch(null);
            }

            // 2. Last Match (Result)
            const lastMatchQ = query(
                collection(db, 'teams', teamId, 'matches'),
                where('status', '==', 'finished'),
                orderBy('date', 'desc'),
                limit(1)
            );
            const lastSnap = await getDocs(lastMatchQ);
            if (!lastSnap.empty) {
                const doc = lastSnap.docs[0];
                const data = doc.data() as Match;
                setLastMatch({ ...data, id: doc.id });
            } else {
                setLastMatch(null);
            }

            // 3. Top Scorers (Goals)
            const scorersQ = query(
                collection(db, 'teams', teamId, 'players'),
                where('status', '==', 'active'),
                orderBy('goals', 'desc'),
                limit(3)
            );
            const scorersSnap = await getDocs(scorersQ);
            setTopScorers(scorersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player)));

            // 4. Top MVP 
            const mvpQ = query(
                collection(db, 'teams', teamId, 'players'),
                where('status', '==', 'active'),
                orderBy('mvpScore', 'desc'),
                limit(3)
            );
            const mvpSnap = await getDocs(mvpQ);
            setTopMvps(mvpSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player)));

            // 5. Financial Summary (Owner/Coach only)
            if (canManageTeam) {
                let pending = 0;
                let collected = 0;

                // Monthly Payments
                const monthlyQ = query(collection(db, 'teams', teamId, 'monthlyPayments'));
                const monthlySnap = await getDocs(monthlyQ);
                monthlySnap.forEach(d => {
                    const data = d.data();
                    if (data.status === 'paid') collected += (data.amount || 0);
                    else pending += (data.amount || 0);
                });

                // Game Payments 
                try {
                    const gameQ = query(
                        collectionGroup(db, 'payments'),
                        where('teamId', '==', teamId)
                    );
                    const gameSnap = await getDocs(gameQ);
                    gameSnap.forEach(d => {
                        const data = d.data();
                        if (data.status === 'paid') collected += (data.amount || 0);
                        else pending += (data.amount || 0);
                    });
                } catch (e: any) {
                    console.log("Collection Group Query failed: " + (e.message || ""));
                }

                setFinancials({ pending, collected });
            }

        } catch (e) {
            console.error("Error fetching dashboard data:", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [teamId]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const safeFormatDate = (date: any, fmt: string) => {
        try {
            if (!date) return '';
            const d = date.toDate ? date.toDate() : new Date(date);
            if (isNaN(d.getTime())) return '';
            return format(d, fmt, { locale: ptBR });
        } catch (e) {
            return '';
        }
    };

    if (loading) {
        return <View className="flex-1 justify-center items-center bg-[#F8FAFC]"><ActivityIndicator size="large" color="#006400" /></View>;
    }

    return (
        <View className="flex-1 bg-[#F8FAFC]">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 100, paddingTop: 60, paddingHorizontal: 20 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#006400" />}
            >
                <Header
                    title={teamName?.toUpperCase() || "MEU TIME"}
                    subtitle="Dashboard"
                    rightComponent={
                        <View className="flex-row items-center space-x-2">
                            <TouchableOpacity
                                onPress={clearTeamContext}
                                className="w-10 h-10 rounded-2xl bg-red-50 border border-red-100 justify-center items-center shadow-sm mr-2"
                            >
                                <LogOut size={20} color="#EF4444" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => navigation.navigate('TeamSettings')}
                                className="w-10 h-10 rounded-2xl bg-white border border-slate-100 justify-center items-center shadow-sm"
                            >
                                <Settings size={20} color="#0F172A" />
                            </TouchableOpacity>
                        </View>
                    }
                />

                {/* Financial Summary */}
                {canManageTeam && (
                    <View className="mb-8">
                        <Text className="text-xl font-black italic text-slate-900 tracking-tighter mb-4">FINANCEIRO</Text>
                        <Card className="bg-[#0F172A] p-0 overflow-hidden border-0">
                            {/* Background Pattern */}
                            <View className="absolute -right-6 -bottom-6 opacity-10">
                                <TrendingUp size={150} color="white" />
                            </View>

                            <View className="flex-row p-6">
                                <View className="flex-1">
                                    <View className="flex-row items-center space-x-2 mb-2">
                                        <View className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <Text className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Arrecadado</Text>
                                    </View>
                                    <Text className="text-emerald-400 text-2xl font-black italic">
                                        R$ {financials.collected.toFixed(2)}
                                    </Text>
                                </View>
                                <View className="w-[1px] bg-slate-800 mx-4" />
                                <View className="flex-1">
                                    <View className="flex-row items-center space-x-2 mb-2">
                                        <View className="w-2 h-2 rounded-full bg-red-500" />
                                        <Text className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Pendente</Text>
                                    </View>
                                    <Text className="text-red-400 text-2xl font-black italic">
                                        R$ {financials.pending.toFixed(2)}
                                    </Text>
                                </View>
                            </View>
                        </Card>
                    </View>
                )}

                {/* Alerts */}
                {canManageTeam && confirmedCount < 5 && nextMatch && (
                    <TouchableOpacity onPress={() => navigation.navigate('MatchDetails', { matchId: nextMatch.id })} className="mb-6 bg-orange-50 border border-orange-200 p-4 rounded-xl flex-row items-center">
                        <AlertCircle color="#F97316" size={24} />
                        <View className="ml-3 flex-1">
                            <Text className="text-orange-800 font-bold text-xs uppercase tracking-wide">Atenção</Text>
                            <Text className="text-orange-900 font-medium text-sm">Apenas {confirmedCount} confirmados para o jogo.</Text>
                        </View>
                        <ChevronRight color="#F97316" size={20} />
                    </TouchableOpacity>
                )}

                {/* Next Match */}
                <View className="mb-8">
                    <View className="flex-row justify-between items-end mb-4">
                        <Text className="text-xl font-black italic text-slate-900 tracking-tighter">PRÓXIMA PARTIDA</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Partidas')}>
                            <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Ver Agenda</Text>
                        </TouchableOpacity>
                    </View>

                    {nextMatch ? (
                        <Card className="bg-white" onTouchEnd={() => navigation.navigate('MatchDetails', { matchId: nextMatch.id })}>
                            <View className="flex-row justify-between mb-4">
                                <Badge label="Agendado" color="bg-emerald-50" textColor="text-emerald-700" />
                                <View className="flex-row items-center">
                                    <Calendar size={12} color="#94A3B8" />
                                    <Text className="text-slate-400 text-xs font-bold ml-1">{safeFormatDate(nextMatch.date, 'dd/MM HH:mm')}</Text>
                                </View>
                            </View>

                            <Text className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">VS</Text>
                            <Text className="text-3xl font-black italic text-slate-900 uppercase mb-4" numberOfLines={1}>{nextMatch.opponent || 'Adversário'}</Text>

                            <View className="flex-row items-center mb-6">
                                <MapPin size={14} color="#64748B" />
                                <Text className="text-slate-500 font-bold text-xs uppercase ml-2">{nextMatch.location || 'Local a definir'}</Text>
                            </View>

                            <View className="h-[1px] bg-slate-100 mb-4" />

                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    className="flex-1 bg-[#006400] rounded-xl py-3 items-center shadow-lg shadow-green-900/20"
                                    onPress={() => navigation.navigate('MatchDetails', { matchId: nextMatch.id })}
                                >
                                    <Text className="text-white font-black italic uppercase text-xs tracking-widest">Vou Jogo</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className="flex-1 bg-slate-100 rounded-xl py-3 items-center"
                                    onPress={() => navigation.navigate('MatchDetails', { matchId: nextMatch.id })}
                                >
                                    <Text className="text-slate-400 font-black italic uppercase text-xs tracking-widest">Não Vou</Text>
                                </TouchableOpacity>
                            </View>
                        </Card>
                    ) : (
                        <Card className="bg-white items-center py-8">
                            <Calendar size={48} color="#E2E8F0" className="mb-4" />
                            <Text className="text-slate-400 font-medium italic mb-4">Nenhum jogo agendado</Text>
                            {canManageTeam && (
                                <TouchableOpacity onPress={() => navigation.navigate('Partidas')} className="bg-slate-900 px-6 py-3 rounded-xl">
                                    <Text className="text-white font-bold text-xs uppercase tracking-widest">Agendar Novo</Text>
                                </TouchableOpacity>
                            )}
                        </Card>
                    )}
                </View>

                {/* Rankings */}
                <View className="mb-8">
                    <Text className="text-xl font-black italic text-slate-900 tracking-tighter mb-4">RANKINGS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>

                        {/* Top Scorers */}
                        <LinearGradient colors={['#FACC15', '#EA580C']} className="rounded-[2rem] p-5 w-48 mr-4 h-48 justify-between" start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                            <View>
                                <View className="bg-white/20 self-start p-2 rounded-lg mb-2">
                                    <Trophy color="white" size={20} />
                                </View>
                                <Text className="text-white/80 font-black text-[10px] uppercase tracking-widest">Artilharia</Text>
                            </View>
                            <View>
                                {topScorers[0] ? (
                                    <>
                                        <Text className="text-white text-xl font-black italic" numberOfLines={1}>{topScorers[0].name}</Text>
                                        <Text className="text-white font-black text-4xl italic">{topScorers[0].goals} <Text className="text-sm opacity-60">Gols</Text></Text>
                                    </>
                                ) : <Text className="text-white/60 font-medium">Sem dados</Text>}
                            </View>
                        </LinearGradient>

                        {/* MVPs */}
                        <LinearGradient colors={['#38BDF8', '#3B82F6']} className="rounded-[2rem] p-5 w-48 mr-4 h-48 justify-between" start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                            <View>
                                <View className="bg-white/20 self-start p-2 rounded-lg mb-2">
                                    <Target color="white" size={20} />
                                </View>
                                <Text className="text-white/80 font-black text-[10px] uppercase tracking-widest">MVP Pontos</Text>
                            </View>
                            <View>
                                {topMvps[0] ? (
                                    <>
                                        <Text className="text-white text-xl font-black italic" numberOfLines={1}>{topMvps[0].name}</Text>
                                        <Text className="text-white font-black text-4xl italic">{topMvps[0].mvpScore?.toFixed(1) || 0} <Text className="text-sm opacity-60">Pts</Text></Text>
                                    </>
                                ) : <Text className="text-white/60 font-medium">Sem dados</Text>}
                            </View>
                        </LinearGradient>

                    </ScrollView>
                </View>

                {/* Last Result */}
                {lastMatch && (
                    <View className="mb-8">
                        <Text className="text-xl font-black italic text-slate-900 tracking-tighter mb-4">ÚLTIMO RESULTADO</Text>
                        <Card className="bg-[#0F172A] border-0" onTouchEnd={() => navigation.navigate('MatchDetails', { matchId: lastMatch.id })}>
                            <View className="flex-row justify-between items-center">
                                <View className="items-center flex-1">
                                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">Meu Time</Text>
                                    <Text className="text-white text-4xl font-black italic">{lastMatch.scoreHome}</Text>
                                </View>
                                <Text className="text-slate-600 font-black italic text-2xl">X</Text>
                                <View className="items-center flex-1">
                                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">{lastMatch.opponent}</Text>
                                    <Text className="text-white text-4xl font-black italic">{lastMatch.scoreAway}</Text>
                                </View>
                            </View>
                            <View className="items-center mt-4">
                                <Badge label={safeFormatDate(lastMatch.date, "dd MMM")} color="bg-slate-800" textColor="text-slate-400" />
                            </View>
                        </Card>
                    </View>
                )}

            </ScrollView>
        </View>
    );
}
