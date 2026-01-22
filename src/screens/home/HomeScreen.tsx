import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Text, Modal } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { Match, Player } from '@/types/models';
import { TransactionService } from '@/services/transactionService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, TrendingUp, Trophy, Target, Info, X, Menu } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAlerts } from '@/hooks/useAlerts';
import { DashboardAlertsSummary } from '@/components/alerts/DashboardAlertsSummary';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen({ navigation, onTabChange }: any) {
    const { teamId, teamName, currentRole } = useTeamStore();
    const { canManageTeam, canManageRoster } = usePermissions();
    const { counts: alertCounts, refreshAlerts } = useAlerts();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Data State
    const [financials, setFinancials] = useState({ collected: 0, pending: 0 });
    const [nextMatch, setNextMatch] = useState<Match | null>(null);
    const [lastMatch, setLastMatch] = useState<Match | null>(null);

    // Rankings State
    const [topScorers, setTopScorers] = useState<Player[]>([]);
    const [topAssists, setTopAssists] = useState<Player[]>([]);
    const [topParticipations, setTopParticipations] = useState<Player[]>([]);
    const [mostVotedCrowd, setMostVotedCrowd] = useState<Player[]>([]);
    const [topRatedCrowd, setTopRatedCrowd] = useState<Player[]>([]);
    const [topRatedCoach, setTopRatedCoach] = useState<Player[]>([]);

    const [infoModal, setInfoModal] = useState<{ visible: boolean; title: string; description: string } | null>(null);

    const fetchData = useCallback(async () => {
        if (!teamId) return;

        try {
            // 1. Financials
            try {
                const summary = await TransactionService.getSummary(teamId);
                setFinancials({
                    collected: summary.income,
                    pending: summary.pending
                });
            } catch (e) {
                console.error("Error fetching financials:", e);
            }

            // 2. Matches (Next and Last)
            try {
                const matchesRef = collection(db, 'teams', teamId, 'matches');
                const now = Timestamp.now();

                // Next Match
                const qNext = query(matchesRef, where('date', '>=', now), orderBy('date', 'asc'), limit(1));
                const nextSnap = await getDocs(qNext);
                if (!nextSnap.empty) {
                    setNextMatch({ id: nextSnap.docs[0].id, ...nextSnap.docs[0].data() } as Match);
                } else {
                    setNextMatch(null);
                }

                // Last Match
                const qLast = query(matchesRef, where('date', '<', now), orderBy('date', 'desc'), limit(1));
                const lastSnap = await getDocs(qLast);
                if (!lastSnap.empty) {
                    setLastMatch({ id: lastSnap.docs[0].id, ...lastSnap.docs[0].data() } as Match);
                } else {
                    setLastMatch(null);
                }
            } catch (e) {
                console.error("Error fetching matches:", e);
                // Fallback for query index errors
                setNextMatch(null);
                setLastMatch(null);
            }

            // 3. Rankings
            try {
                const playersRef = collection(db, 'teams', teamId, 'players');
                const qPlayers = query(playersRef, where('status', '==', 'active'));
                const playersSnap = await getDocs(qPlayers);
                const players = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));

                // Process Rankings locally
                // Goals
                const scorers = [...players].sort((a, b) => (b.goals || 0) - (a.goals || 0)).slice(0, 1);
                setTopScorers(scorers[0]?.goals ? scorers : []);

                // Assists
                const assists = [...players].sort((a, b) => (b.assists || 0) - (a.assists || 0)).slice(0, 1);
                setTopAssists(assists[0]?.assists ? assists : []);

                // Participations (G+A)
                const participations = [...players].sort((a, b) => ((b.goals || 0) + (b.assists || 0)) - ((a.goals || 0) + (a.assists || 0))).slice(0, 1);
                // Add computed property for display
                const topPart = participations.map(p => ({ ...p, goalParticipations: (p.goals || 0) + (p.assists || 0) }));
                setTopParticipations(topPart[0]?.goalParticipations ? topPart : []);

                // Crowd Votes
                const voted = [...players].sort((a, b) => (b.totalCrowdVotes || 0) - (a.totalCrowdVotes || 0)).slice(0, 1);
                setMostVotedCrowd(voted[0]?.totalCrowdVotes ? voted : []);

                // Crowd Rating (Avg)
                const ratingCrowd = [...players].filter(p => (p.averageCommunityRating || 0) > 0)
                    .sort((a, b) => (b.averageCommunityRating || 0) - (a.averageCommunityRating || 0)).slice(0, 1);
                setTopRatedCrowd(ratingCrowd);

                // Coach Rating (Avg)
                const ratingCoach = [...players].filter(p => (p.averageTechnicalRating || 0) > 0)
                    .sort((a, b) => (b.averageTechnicalRating || 0) - (a.averageTechnicalRating || 0)).slice(0, 1);
                setTopRatedCoach(ratingCoach);

            } catch (e) {
                console.error("Error fetching rankings:", e);
            }

        } catch (error) {
            console.error("Error in dashboard fetch:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [teamId]);

    useEffect(() => {
        fetchData();
        refreshAlerts();
    }, [fetchData, refreshAlerts]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
        refreshAlerts();
    };

    const safeFormatDate = (timestamp: any, formatStr: string) => {
        if (!timestamp) return '';
        try {
            return format(timestamp.toDate(), formatStr, { locale: ptBR });
        } catch (e) {
            return '';
        }
    };

    if (loading && !refreshing && !topScorers.length) { // Initial load
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#F8FAFC]">
            <View
                className="px-6 pb-2 bg-[#F8FAFC] z-10"
                style={{ paddingTop: Math.max(insets.top, 24) + 10 }}
            >
                <Header
                    leftComponent={
                        <TouchableOpacity onPress={() => navigation.openDrawer && navigation.openDrawer()} className="p-2 mr-2 bg-white rounded-xl border border-slate-100 shadow-sm">
                            <Menu size={24} color="#0F172A" />
                        </TouchableOpacity>
                    }
                    title={teamName?.toUpperCase() || "MEU TIME"}
                    subtitle={
                        currentRole === 'owner' ? 'Gestão do Clube' :
                            currentRole === 'coach' ? 'Comissão Técnica' :
                                currentRole === 'staff' ? 'Staff' :
                                    'Atuando como Jogador'
                    }
                />
            </View>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#006400" />}
            >

                {/* Financial Summary */}
                {canManageTeam && (
                    <View className="mb-8">
                        <View className="flex-row justify-between items-end mb-4">
                            <Text className="text-xl font-black italic text-slate-900 tracking-tighter">FINANCEIRO</Text>
                            <TouchableOpacity onPress={() => onTabChange && onTabChange('Financeiro')}>
                                <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Ver Detalhes</Text>
                            </TouchableOpacity>
                        </View>
                        <Card className="bg-[#0F172A] p-0 overflow-hidden border-0" onTouchEnd={() => onTabChange && onTabChange('Financeiro')}>
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
                {(canManageTeam || canManageRoster) && (
                    <DashboardAlertsSummary
                        counts={alertCounts}
                        onPress={() => navigation.navigate('Alerts')}
                    />
                )}

                {/* Next Match */}
                <View className="mb-8">
                    <View className="flex-row justify-between items-end mb-4">
                        <Text className="text-xl font-black italic text-slate-900 tracking-tighter">PRÓXIMA PARTIDA</Text>
                        <TouchableOpacity onPress={() => onTabChange && onTabChange('Partidas')}>
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

                        {/* 1. Artilharia */}
                        <View className="mr-4 w-40 bg-white rounded-3xl p-5 justify-between h-40 border border-slate-100 shadow-sm">
                            <View className="flex-row justify-between items-start">
                                <View className="bg-yellow-50 p-2 rounded-xl">
                                    <Trophy color="#CA8A04" size={18} />
                                </View>
                                <TouchableOpacity onPress={() => setInfoModal({ visible: true, title: "Artilharia", description: "Jogador com o maior número de gols marcados em todas as partidas." })}>
                                    <Info color="#94A3B8" size={16} />
                                </TouchableOpacity>
                            </View>
                            <View>
                                <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">Artilharia</Text>
                                {topScorers[0] ? (
                                    <>
                                        <Text className="text-slate-800 text-lg font-black italic" numberOfLines={1}>{topScorers[0].name}</Text>
                                        <Text className="text-yellow-600 font-black text-3xl italic">{topScorers[0].goals} <Text className="text-sm text-slate-400 font-bold not-italic">Gols</Text></Text>
                                    </>
                                ) : <Text className="text-slate-300 font-medium text-xs">Sem dados</Text>}
                            </View>
                        </View>

                        {/* 2. Assistências */}
                        <View className="mr-4 w-40 bg-white rounded-3xl p-5 justify-between h-40 border border-slate-100 shadow-sm">
                            <View className="flex-row justify-between items-start">
                                <View className="bg-green-50 p-2 rounded-xl">
                                    <TrendingUp color="#16A34A" size={18} />
                                </View>
                                <TouchableOpacity onPress={() => setInfoModal({ visible: true, title: "Garçom", description: "Jogador com o maior número de assistências realizadas em todas as partidas." })}>
                                    <Info color="#94A3B8" size={16} />
                                </TouchableOpacity>
                            </View>
                            <View>
                                <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">Garçom</Text>
                                {topAssists[0] ? (
                                    <>
                                        <Text className="text-slate-800 text-lg font-black italic" numberOfLines={1}>{topAssists[0].name}</Text>
                                        <Text className="text-green-600 font-black text-3xl italic">{topAssists[0].assists} <Text className="text-sm text-slate-400 font-bold not-italic">Ass.</Text></Text>
                                    </>
                                ) : <Text className="text-slate-300 font-medium text-xs">Sem dados</Text>}
                            </View>
                        </View>

                        {/* 3. Participações */}
                        <View className="mr-4 w-40 bg-white rounded-3xl p-5 justify-between h-40 border border-slate-100 shadow-sm">
                            <View className="flex-row justify-between items-start">
                                <View className="bg-purple-50 p-2 rounded-xl">
                                    <Target color="#9333EA" size={18} />
                                </View>
                                <TouchableOpacity onPress={() => setInfoModal({ visible: true, title: "Participações", description: "Jogador com a maior soma de gols e assistências em todas as partidas." })}>
                                    <Info color="#94A3B8" size={16} />
                                </TouchableOpacity>
                            </View>
                            <View>
                                <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">Participações</Text>
                                {topParticipations[0] ? (
                                    <>
                                        <Text className="text-slate-800 text-lg font-black italic" numberOfLines={1}>{topParticipations[0].name}</Text>
                                        <Text className="text-purple-600 font-black text-3xl italic">{topParticipations[0].goalParticipations || 0} <Text className="text-sm text-slate-400 font-bold not-italic">G+A</Text></Text>
                                    </>
                                ) : <Text className="text-slate-300 font-medium text-xs">Sem dados</Text>}
                            </View>
                        </View>

                        {/* 4. O Melhor pra Galera */}
                        <View className="mr-4 w-40 bg-white rounded-3xl p-5 justify-between h-40 border border-slate-100 shadow-sm">
                            <View className="flex-row justify-between items-start">
                                <View className="bg-pink-50 p-2 rounded-xl">
                                    <Trophy color="#DB2777" size={18} />
                                </View>
                                <TouchableOpacity onPress={() => setInfoModal({ visible: true, title: "O Melhor pra Galera", description: "Jogador que recebeu mais votos como 'Melhor da Partida' na votação da galera." })}>
                                    <Info color="#94A3B8" size={16} />
                                </TouchableOpacity>
                            </View>
                            <View>
                                <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">Melhor pra Galera</Text>
                                {mostVotedCrowd[0] ? (
                                    <>
                                        <Text className="text-slate-800 text-lg font-black italic" numberOfLines={1}>{mostVotedCrowd[0].name}</Text>
                                        <Text className="text-pink-600 font-black text-3xl italic">{mostVotedCrowd[0].totalCrowdVotes || 0} <Text className="text-sm text-slate-400 font-bold not-italic">Votos</Text></Text>
                                    </>
                                ) : <Text className="text-slate-300 font-medium text-xs">Sem dados</Text>}
                            </View>
                        </View>

                        {/* 5. Nota da Galera */}
                        <View className="mr-4 w-40 bg-white rounded-3xl p-5 justify-between h-40 border border-slate-100 shadow-sm">
                            <View className="flex-row justify-between items-start">
                                <View className="bg-sky-50 p-2 rounded-xl">
                                    <Target color="#0284C7" size={18} />
                                </View>
                                <TouchableOpacity onPress={() => setInfoModal({ visible: true, title: "Nota da Galera", description: "Jogador com a maior média de notas dadas pela galera em todas as partidas." })}>
                                    <Info color="#94A3B8" size={16} />
                                </TouchableOpacity>
                            </View>
                            <View>
                                <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">Nota da Galera</Text>
                                {topRatedCrowd[0] ? (
                                    <>
                                        <Text className="text-slate-800 text-lg font-black italic" numberOfLines={1}>{topRatedCrowd[0].name}</Text>
                                        <Text className="text-sky-600 font-black text-3xl italic">{topRatedCrowd[0].averageCommunityRating?.toFixed(1) || '0.0'} <Text className="text-sm text-slate-400 font-bold not-italic">Média</Text></Text>
                                    </>
                                ) : <Text className="text-slate-300 font-medium text-xs">Sem dados</Text>}
                            </View>
                        </View>

                        {/* 6. Nota do Técnico */}
                        <View className="mr-4 w-40 bg-white rounded-3xl p-5 justify-between h-40 border border-slate-100 shadow-sm">
                            <View className="flex-row justify-between items-start">
                                <View className="bg-rose-50 p-2 rounded-xl">
                                    <Target color="#E11D48" size={18} />
                                </View>
                                <TouchableOpacity onPress={() => setInfoModal({ visible: true, title: "Nota do Técnico", description: "Jogador com a maior média de notas dadas pelo técnico em todas as partidas." })}>
                                    <Info color="#94A3B8" size={16} />
                                </TouchableOpacity>
                            </View>
                            <View>
                                <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">Nota do Técnico</Text>
                                {topRatedCoach[0] ? (
                                    <>
                                        <Text className="text-slate-800 text-lg font-black italic" numberOfLines={1}>{topRatedCoach[0].name}</Text>
                                        <Text className="text-rose-600 font-black text-3xl italic">{topRatedCoach[0].averageTechnicalRating?.toFixed(1) || '0.0'} <Text className="text-sm text-slate-400 font-bold not-italic">Média</Text></Text>
                                    </>
                                ) : <Text className="text-slate-300 font-medium text-xs">Sem dados</Text>}
                            </View>
                        </View>

                    </ScrollView>
                </View>

                {/* Last Result */}
                {lastMatch && (
                    <View className="mb-8">
                        <Text className="text-xl font-black italic text-slate-900 tracking-tighter mb-4">ÚLTIMO RESULTADO</Text>
                        <Card className="bg-white border-0 shadow-sm" onTouchEnd={() => navigation.navigate('MatchDetails', { matchId: lastMatch.id })}>
                            <View className="flex-row justify-between items-center">
                                <View className="items-center flex-1">
                                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">Meu Time</Text>
                                    <Text className="text-slate-900 text-4xl font-black italic">
                                        {lastMatch.scoreHome !== undefined && lastMatch.scoreHome !== null ? lastMatch.scoreHome : 0}
                                    </Text>
                                </View>
                                <Text className="text-slate-300 font-black italic text-2xl">X</Text>
                                <View className="items-center flex-1">
                                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1">{lastMatch.opponent}</Text>
                                    <Text className="text-slate-900 text-4xl font-black italic">
                                        {lastMatch.scoreAway !== undefined && lastMatch.scoreAway !== null ? lastMatch.scoreAway : 0}
                                    </Text>
                                </View>
                            </View>
                            <View className="items-center mt-4">
                                <Badge label={safeFormatDate(lastMatch.date, "dd MMM")} color="bg-slate-100" textColor="text-slate-500" />
                            </View>
                        </Card>
                    </View>
                )}

            </ScrollView>

            {/* Info Modal */}
            <Modal transparent visible={!!infoModal} animationType="fade" onRequestClose={() => setInfoModal(null)}>
                <View className="flex-1 bg-black/50 justify-end">
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setInfoModal(null)} />
                    <View className="bg-white rounded-t-3xl p-8 pb-12 shadow-2xl">
                        <View className="w-12 h-1 bg-slate-200 rounded-full self-center mb-6" />
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-2xl font-black italic text-slate-900 uppercase">{infoModal?.title}</Text>
                            <TouchableOpacity onPress={() => setInfoModal(null)} className="p-2 bg-slate-50 rounded-full">
                                <X size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <Text className="text-slate-500 text-base leading-6 font-medium">
                            {infoModal?.description}
                        </Text>
                    </View>
                </View>
            </Modal>
        </View >
    );
}
