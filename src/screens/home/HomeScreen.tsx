import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Text, Modal } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { Match, Player } from '@/types/models';
import { TransactionService } from '@/services/transactionService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, TrendingUp, Trophy, Target, AlertCircle, ChevronRight, Settings, LogOut, Info, X } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function HomeScreen({ navigation, onTabChange }: any) {
    const { teamId, teamName, clearTeamContext, currentRole } = useTeamStore();
    const { canManageTeam } = usePermissions();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [nextMatch, setNextMatch] = useState<Match | null>(null);
    const [confirmedCount, setConfirmedCount] = useState(0);
    const [lastMatch, setLastMatch] = useState<Match | null>(null);

    const [topScorers, setTopScorers] = useState<Player[]>([]);
    const [topAssists, setTopAssists] = useState<Player[]>([]);
    const [topParticipations, setTopParticipations] = useState<Player[]>([]);
    const [mostVotedCrowd, setMostVotedCrowd] = useState<Player[]>([]);
    const [topRatedCrowd, setTopRatedCrowd] = useState<Player[]>([]);
    const [topRatedCoach, setTopRatedCoach] = useState<Player[]>([]);

    const [financials, setFinancials] = useState({ pending: 0, collected: 0, balance: 0 });
    const [infoModal, setInfoModal] = useState<{ visible: boolean; title: string; description: string } | null>(null);

    const fetchData = async () => {
        if (!teamId) return;

        try {
            const now = new Date();

            // 1. Next Match - Fetch a few to filter out finished ones client-side
            const nextMatchQ = query(
                collection(db, 'teams', teamId, 'matches'),
                where('date', '>=', Timestamp.fromDate(now)),
                orderBy('date', 'asc'),
                limit(10)
            );
            const nextSnap = await getDocs(nextMatchQ);
            let foundMatch = null;

            if (!nextSnap.empty) {
                // Find first that is NOT finished
                const matches = nextSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Match));
                foundMatch = matches.find(m => m.status !== 'finished') || null;

                if (foundMatch) {
                    setNextMatch(foundMatch);
                    // Count confirmed
                    const count = foundMatch.presence
                        ? Object.values(foundMatch.presence).filter(p => p.status === 'confirmed').length
                        : 0;
                    setConfirmedCount(count);
                } else {
                    setNextMatch(null);
                }
            } else {
                setNextMatch(null);
            }

            // 2. Last Match (Result)
            // 2. Last Match (Result) - Fetch recent matches and find first finished one (Avoids Composite Index)
            const lastMatchQ = query(
                collection(db, 'teams', teamId, 'matches'),
                orderBy('date', 'desc'),
                limit(10)
            );
            const lastSnap = await getDocs(lastMatchQ);

            if (!lastSnap.empty) {
                const matches = lastSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Match));
                const finished = matches.find(m => m.status === 'finished');
                setLastMatch(finished || null);
            } else {
                setLastMatch(null);
            }

            // 3. Fetch All Active Players & Calculate Rankings In-Memory
            // This avoids needing 7+ composite indexes in Firebase for a small dataset.
            const playersQ = query(
                collection(db, 'teams', teamId, 'players'),
                where('status', '==', 'active')
            );
            const playersSnap = await getDocs(playersQ);
            const allPlayers = playersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player));

            // Helpers for sorting
            const getTop = (field: keyof Player) => {
                return [...allPlayers]
                    .sort((a, b) => ((b[field] as number) || 0) - ((a[field] as number) || 0))
                    .slice(0, 1);
            };

            setTopScorers(getTop('goals'));
            setTopAssists(getTop('assists'));
            setTopParticipations(getTop('goalParticipations'));
            // setMostMatches(getTop('matchesPlayed')); // Removed
            setMostVotedCrowd(getTop('totalCrowdVotes'));
            setTopRatedCrowd(getTop('averageCommunityRating'));
            setTopRatedCoach(getTop('averageTechnicalRating'));

            // 5. Financial Summary (Owner/Coach only) using TransactionService
            if (canManageTeam) {
                // Trigger monthly check (Async, don't await blocking)
                TransactionService.checkAndGenerateMonthlyTransactions(teamId).catch(console.error);

                const summary = await TransactionService.getSummary(teamId);
                setFinancials({
                    collected: summary.income,
                    pending: summary.pending,
                    balance: summary.balance
                });
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
                    subtitle={
                        currentRole === 'owner' ? 'Gestão do Clube' :
                            currentRole === 'coach' ? 'Comissão Técnica' :
                                currentRole === 'staff' ? 'Staff' :
                                    'Atuando como Jogador'
                    }
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
        </View>
    );
}
