import React, { useEffect, useState, useMemo } from 'react';
import { View, ScrollView, Alert, TouchableOpacity, Text, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { doc, updateDoc, addDoc, collection, Timestamp, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { Match, MatchEvent, PresenceStatus, Transaction } from '@/types/models'; // Updated import
import { TransactionService } from '@/services/transactionService'; // New Service
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatsService } from '@/services/statsService';
import {
    Calendar, MapPin, Trophy, Target,
    CheckCircle2, XCircle,
    Flag, RotateCcw, DollarSign,
    ChevronLeft, Settings2, Users, X
} from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function MatchDetailsScreen({ route, navigation }: any) {
    const teamId = useTeamStore(state => state.teamId);
    const myPlayerProfile = useTeamStore(state => state.myPlayerProfile);
    const currentRole = useTeamStore(state => state.currentRole);

    const { canManageMatches } = usePermissions();
    const isOwner = currentRole === 'owner';

    const { matchId, mode = 'view' } = route.params || {};

    const [isEditing, setIsEditing] = useState(mode === 'create' || mode === 'edit');
    const [loading, setLoading] = useState(false);
    const [match, setMatch] = useState<Match | null>(null);
    const [events, setEvents] = useState<MatchEvent[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]); // Changed from payments

    const [opponent, setOpponent] = useState('');
    const [location, setLocation] = useState('');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [datePickerMode, setDatePickerMode] = useState<'date' | 'time'>('date');

    const [scoreHome, setScoreHome] = useState('0');
    const [scoreAway, setScoreAway] = useState('0');

    // New States for Votes View
    const [showVotesModal, setShowVotesModal] = useState(false);
    const [allVotes, setAllVotes] = useState<any[]>([]);

    useEffect(() => {
        if (!teamId || !matchId) return;

        const matchRef = doc(db, 'teams', teamId, 'matches', matchId);
        const unsubMatch = onSnapshot(matchRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setMatch({ ...data, id: snap.id } as Match);
                setOpponent(data.opponent || '');
                setLocation(data.location || '');
                setDate(data.date?.toDate ? data.date.toDate() : (data.date ? new Date(data.date) : new Date()));
                setScoreHome(data.scoreHome?.toString() || '0');
                setScoreAway(data.scoreAway?.toString() || '0');
            }
        });

        const eventsRef = collection(db, 'teams', teamId, 'matches', matchId, 'events');
        const q = query(eventsRef, orderBy('createdAt', 'asc'));
        const unsubEvents = onSnapshot(q, (snap) => {
            const list: MatchEvent[] = [];
            snap.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as MatchEvent);
            });
            setEvents(list);
        });

        const unsubTransactions = TransactionService.subscribeToMatchTransactions(teamId, matchId, (list) => {
            setTransactions(list);
        });

        return () => {
            unsubMatch();
            unsubEvents();
            unsubTransactions();
        };
    }, [matchId, teamId]);

    // Derived Financial State
    const paymentsMap = useMemo(() => {
        const map: Record<string, Transaction> = {};
        transactions.forEach(t => {
            if (t.playerId && t.category === 'game') {
                map[t.playerId] = t;
            }
        });
        return map;
    }, [transactions]);

    const handleSaveInfo = async () => {
        if (!opponent || !teamId) return;
        setLoading(true);

        try {
            const matchData: any = {
                opponent,
                location,
                date: Timestamp.fromDate(date),
            };

            if (mode === 'create') {
                matchData.status = 'scheduled';
                matchData.scoreHome = 0;
                matchData.scoreAway = 0;
                matchData.presence = {};
                await addDoc(collection(db, 'teams', teamId, 'matches'), matchData);
            } else {
                await updateDoc(doc(db, 'teams', teamId, 'matches', matchId), matchData);
            }
            setIsEditing(false);
            if (mode === 'create') navigation.goBack();
        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Falha ao salvar partida.');
        } finally {
            setLoading(false);
        }
    };

    const handlePresence = async (status: PresenceStatus) => {
        if (!match || !teamId || !myPlayerProfile) {
            Alert.alert('Aviso', 'Seu perfil de jogador não foi encontrado neste time.');
            return;
        }

        // Rule: Only Athletes or Owner can mark presence
        if (!myPlayerProfile.isAthlete && !isOwner) {
            Alert.alert('Aviso', 'Apenas jogadores ativos participam da lista de presença.');
            return;
        }

        if (match.status === 'finished' && !isOwner) {
            Alert.alert('Bloqueado', 'Partida finalizada. Presença travada.');
            return;
        }

        // Rule: Cannot change presence if match date has passed (and not owner)
        if (match.date && !isOwner) {
            const matchDate = (match.date as any).toDate ? (match.date as any).toDate() : new Date(match.date);
            if (new Date() > matchDate) {
                Alert.alert('Bloqueado', 'A data da partida já passou. Não é possível alterar a presença.');
                return;
            }
        }

        try {
            const matchRef = doc(db, 'teams', teamId, 'matches', match.id);
            await updateDoc(matchRef, {
                [`presence.${myPlayerProfile.id}`]: {
                    status,
                    name: myPlayerProfile.name,
                    timestamp: new Date()
                }
            });

            // TRIGGER FINANCIAL UPDATE
            if (status === 'confirmed') {
                await TransactionService.syncMatchTransactions(teamId, match.id);
            }

        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Falha ao confirmar presença.');
        }
    };

    const canEditStats = useMemo(() => {
        if (!match) return false;
        if (match.status === 'finished') return isOwner;
        return canManageMatches;
    }, [match, isOwner, canManageMatches]);

    const statsByPlayer = useMemo(() => {
        if (match?.stats) {
            const derived: Record<string, { goals: number, assists: number }> = {};
            Object.entries(match.stats).forEach(([pid, stat]) => {
                derived[pid] = { goals: stat.goals || 0, assists: stat.assists || 0 };
            });
            return derived;
        }

        const stats: Record<string, { goals: number, assists: number }> = {};
        events.forEach(e => {
            if (!stats[e.playerId]) stats[e.playerId] = { goals: 0, assists: 0 };
            if (e.type === 'goal') stats[e.playerId].goals++;
            if (e.type === 'assist') stats[e.playerId].assists++;
        });
        return stats;
    }, [events, match?.stats]);

    const confirmedPlayers = useMemo(() => {
        if (!match?.presence) return [];
        return Object.entries(match.presence)
            .filter(([_, p]) => p.status === 'confirmed')
            .map(([id, p]) => ({ id, ...p }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [match?.presence]);

    const absentPlayers = useMemo(() => {
        if (!match?.presence) return [];
        return Object.entries(match.presence)
            .filter(([_, p]) => p.status === 'out')
            .map(([id, p]) => ({ id, ...p }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [match?.presence]);

    const handleFinalizeMatch = async () => {
        if (!match || !teamId) return;
        Alert.alert(
            'Finalizar Partida',
            'Ao finalizar, os dados serão travados e a presença encerrada. Deseja continuar?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Finalizar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await StatsService.finalizeMatchStats(
                                teamId,
                                matchId,
                                parseInt(scoreHome) || 0,
                                parseInt(scoreAway) || 0,
                                match.presence || {},
                                events
                            );
                            Alert.alert('Sucesso', 'Partida finalizada e estatísticas computadas.');
                            navigation.goBack();
                        } catch (e) {
                            console.error(e);
                            Alert.alert('Erro', 'Falha ao finalizar partida.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleReopenMatch = async () => {
        if (!match || !teamId) return;
        Alert.alert(
            'Reabrir Partida',
            'ATENÇÃO: Ao reabrir, as estatísticas desta partida serão SUBTRAÍDAS dos jogadores. Tem certeza?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Reabrir',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await StatsService.rollbackMatchStats(teamId, matchId, events);
                            Alert.alert('Sucesso', 'Partida reaberta e estatísticas revertidas.');
                        } catch (e) {
                            console.error(e);
                            Alert.alert('Erro', 'Falha ao reabrir partida.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    }

    const handlePaymentAction = async (playerId: string) => {
        const transaction = paymentsMap[playerId];
        if (!transaction || transaction.status === 'paid' || (!isOwner && currentRole !== 'coach')) return;

        Alert.alert(
            'Receber Pagamento',
            `Confirmar recebimento de R$ ${transaction.amount}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar Recebimento',
                    onPress: async () => {
                        try {
                            await TransactionService.markAsPaid(teamId!, transaction.id);
                        } catch (e) {
                            Alert.alert('Erro', 'Falha ao confirmar pagamento.');
                        }
                    }
                }
            ]
        );
    };

    const getMyStatus = () => {
        if (match?.presence && myPlayerProfile?.id) {
            return match.presence[myPlayerProfile.id]?.status || 'out';
        }
        return 'out';
    };

    // Helper to find player name
    const getPlayerName = (id: string) => {
        const p = confirmedPlayers.find(cp => cp.id === id);
        return p ? p.name : 'Desconhecido';
    };

    // New Function to view votes
    const handleViewVotes = async () => {
        if (!teamId || !matchId) return;
        setLoading(true);
        try {
            const votesRef = collection(db, 'teams', teamId, 'matches', matchId, 'votes');
            const snap = await getDocs(votesRef);
            const list: any[] = [];
            snap.forEach(d => list.push(d.data()));
            setAllVotes(list);
            setShowVotesModal(true);
        } catch (e) {
            console.error(e);
            Alert.alert("Erro", "Erro ao carregar votos.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-[#F8FAFC]">
            {/* Modal for Votes */}
            <Modal visible={showVotesModal} animationType="slide" transparent={true}>
                <View className="flex-1 bg-black/50 justify-end">
                    <View className="bg-white rounded-t-3xl h-[80%] p-6">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-lg font-black italic text-slate-900 uppercase">VOTAÇÃO DETALHADA</Text>
                            <TouchableOpacity onPress={() => setShowVotesModal(false)} className="p-2 bg-slate-100 rounded-full">
                                <X size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {allVotes.length === 0 ? (
                                <Text className="text-slate-400 italic text-center mt-10">Nenhum voto registrado.</Text>
                            ) : (
                                allVotes.map((v, index) => {
                                    // v.playerId is the player ID who voted.
                                    const voterName = getPlayerName(v.playerId);

                                    return (
                                        <View key={index} className="mb-6 border-b border-slate-100 pb-4">
                                            <Text className="font-bold text-slate-800 mb-2">👤 {voterName} votou:</Text>

                                            {/* Ratings */}
                                            {v.ratings && Object.entries(v.ratings).map(([targetId, rating]) => (
                                                <Text key={targetId} className="text-xs text-slate-600 ml-4 mb-1">
                                                    • {getPlayerName(targetId as string)}: <Text className="font-bold text-blue-600">{Number(rating).toFixed(1)}</Text>
                                                </Text>
                                            ))}

                                            {/* Best Player Vote */}
                                            {v.bestPlayerVote && (
                                                <Text className="text-xs text-[#006400] font-bold ml-4 mt-1">
                                                    🏆 Craque: {getPlayerName(v.bestPlayerVote)}
                                                </Text>
                                            )}
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                {/* Header Section */}
                <View className="pt-12 px-6 pb-6 bg-white border-b border-slate-100 mb-6 shadow-sm">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center mb-6">
                        <ChevronLeft size={20} color="#94A3B8" />
                        <Text className="ml-1 font-black italic text-slate-400 uppercase tracking-widest text-[10px]">Agenda</Text>
                    </TouchableOpacity>

                    {isEditing ? (
                        <View className="gap-4">
                            <Header title="EDITAR JOGO" subtitle="Detalhes da Partida" />
                            <View>
                                <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">ADVERSÁRIO</Text>
                                <TextInput
                                    className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold"
                                    value={opponent} onChangeText={setOpponent} placeholder="Nome do Adversário"
                                />
                            </View>
                            <View>
                                <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">LOCAL</Text>
                                <TextInput
                                    className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold"
                                    value={location} onChangeText={setLocation} placeholder="Estádio / Arena"
                                />
                            </View>
                            <View className="flex-row items-center justify-between py-2 border-y border-dashed border-slate-100">
                                <View className="flex-row items-center">
                                    <Calendar size={18} color="#94A3B8" />
                                    <Text className="ml-2 font-bold text-slate-600">{format(date, "dd/MM/yyyy HH:mm")}</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => {
                                        setDatePickerMode('date');
                                        setShowDatePicker(true);
                                    }}
                                    className="bg-slate-900 px-4 py-2 rounded-lg"
                                >
                                    <Text className="text-white font-black italic uppercase text-[10px] tracking-widest">ALTERAR</Text>
                                </TouchableOpacity>
                            </View>

                            <View className="flex-row gap-4 mt-2">
                                <TouchableOpacity onPress={() => setIsEditing(false)} className="flex-1 py-4 items-center">
                                    <Text className="text-slate-400 font-black italic uppercase text-xs tracking-widest">CANCELAR</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleSaveInfo} className="flex-2 bg-[#006400] px-6 py-4 rounded-2xl items-center shadow-lg shadow-green-900/20">
                                    <Text className="text-white font-black italic uppercase text-xs tracking-widest">SALVAR JOGO</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View>
                            <View className="flex-row justify-between items-center mb-6">
                                <Badge
                                    label={match?.status === 'finished' ? 'FINALIZADA' : 'AGENDADA'}
                                    color={match?.status === 'finished' ? 'bg-slate-900' : 'bg-emerald-100'}
                                    textColor={match?.status === 'finished' ? 'text-white' : 'text-emerald-700'}
                                />
                                {canManageMatches && (match?.status !== 'finished' || isOwner) && (
                                    <TouchableOpacity onPress={() => setIsEditing(true)}>
                                        <Settings2 size={20} color="#94A3B8" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Scoreboard - Read Only */}
                            <View className="flex-row justify-between items-center px-4 mb-4">
                                <View className="items-center flex-1">
                                    <View className="w-16 h-16 bg-slate-900 rounded-3xl items-center justify-center mb-2">
                                        <Trophy size={32} color="white" />
                                    </View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest">MEU TIME</Text>
                                </View>

                                <View className="flex-row items-center gap-4">
                                    <Text className="text-5xl font-black italic text-slate-900 tracking-tighter">{match?.scoreHome || 0}</Text>
                                    <Text className="text-slate-300 font-black italic text-2xl">X</Text>
                                    <Text className="text-5xl font-black italic text-slate-900 tracking-tighter">{match?.scoreAway || 0}</Text>
                                </View>

                                <View className="items-center flex-1">
                                    <View className="w-16 h-16 bg-slate-100 rounded-3xl items-center justify-center mb-2">
                                        <Trophy size={32} color="#CBD5E1" />
                                    </View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest" numberOfLines={1}>{match?.opponent || 'ADV'}</Text>
                                </View>
                            </View>

                            <View className="items-center mt-6">
                                <View className="flex-row items-center mb-1">
                                    <Calendar size={12} color="#64748B" />
                                    <Text className="ml-1 text-xs font-black italic uppercase text-slate-500 tracking-widest">
                                        {match?.date && (() => {
                                            try {
                                                const d = (match.date as any).toDate ? (match.date as any).toDate() : new Date(match.date);
                                                return format(d, "EEEE, d 'DE' MMMM", { locale: ptBR });
                                            } catch (e) { return ''; }
                                        })()}
                                    </Text>
                                </View>
                                <View className="flex-row items-center">
                                    <MapPin size={12} color="#94A3B8" />
                                    <Text className="ml-1 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{match?.location}</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </View>

                {/* Match Center / Presence */}
                <View className="px-6">

                    {/* AWARDS SECTION (NEW) */}
                    {match?.status === 'finished' && match.awards && (
                        <View className="mb-8 flex-row gap-4">
                            {/* Best Player */}
                            <View className="flex-1 bg-gradient-to-br from-yellow-50 to-orange-50 p-4 rounded-2xl border border-orange-100 items-center shadow-sm">
                                <Text className="text-[8px] font-black uppercase text-orange-400 tracking-widest mb-2">MELHOR DA PARTIDA</Text>
                                <View className="w-12 h-12 bg-orange-400 rounded-full items-center justify-center mb-2 shadow-sm">
                                    <Trophy size={20} color="white" />
                                </View>
                                <Text className="font-black italic text-slate-800 text-center text-sm" numberOfLines={1}>
                                    {match.awards.bestPlayerId ? getPlayerName(match.awards.bestPlayerId) : '-'}
                                </Text>
                                <Text className="text-[10px] text-orange-400 font-bold mt-1">Nota: {match.awards.bestPlayerScore?.toFixed(1) || '-'}</Text>
                            </View>

                            {/* Crowd Favorite */}
                            <View className="flex-1 bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-2xl border border-emerald-100 items-center shadow-sm">
                                <Text className="text-[8px] font-black uppercase text-emerald-500 tracking-widest mb-2">CRAQUE DA GALERA</Text>
                                <View className="w-12 h-12 bg-emerald-500 rounded-full items-center justify-center mb-2 shadow-sm">
                                    <Users size={20} color="white" />
                                </View>
                                <Text className="font-black italic text-slate-800 text-center text-sm" numberOfLines={1}>
                                    {match.awards.crowdFavoriteId ? getPlayerName(match.awards.crowdFavoriteId) : '-'}
                                </Text>
                                <Text className="text-[10px] text-emerald-500 font-bold mt-1">
                                    {match.awards.crowdFavoriteVotes || 0} Votos
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Attendance Selector - Show if match open OR if owner */}
                    {(match?.status !== 'finished' || isOwner) && (myPlayerProfile?.isAthlete || isOwner) ? (
                        <View className="mb-8">
                            <Text className="text-xs font-black italic text-slate-900 tracking-widest uppercase mb-4 ml-1">SUA PRESENÇA</Text>
                            <View className="flex-row bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
                                <TouchableOpacity
                                    className={`flex-1 py-4 flex-row justify-center items-center rounded-xl ${getMyStatus() === 'confirmed' ? 'bg-[#006400]' : 'bg-transparent'}`}
                                    onPress={() => handlePresence('confirmed')}
                                >
                                    <CheckCircle2 size={16} color={getMyStatus() === 'confirmed' ? 'white' : '#94A3B8'} />
                                    <Text className={`ml-2 font-black italic text-[10px] uppercase tracking-widest ${getMyStatus() === 'confirmed' ? 'text-white' : 'text-slate-400'}`}>Vou</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className={`flex-1 py-4 flex-row justify-center items-center rounded-xl ${getMyStatus() === 'out' ? 'bg-red-500' : 'bg-transparent'}`}
                                    onPress={() => handlePresence('out')}
                                >
                                    <XCircle size={16} color={getMyStatus() === 'out' ? 'white' : '#94A3B8'} />
                                    <Text className={`ml-2 font-black italic text-[10px] uppercase tracking-widest ${getMyStatus() === 'out' ? 'text-white' : 'text-slate-400'}`}>Não</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : null}


                    {/* Voting Action - Players */}
                    {match?.status === 'finished' && (
                        (() => {
                            const myPresence = match.presence?.[myPlayerProfile?.id || ''];
                            const myStats = match.stats?.[myPlayerProfile?.id || ''];
                            const isEligible = myPresence?.status === 'confirmed' && !myStats?.faltou;

                            if (isEligible) {
                                return (
                                    <View className="mb-6">
                                        <TouchableOpacity
                                            onPress={() => navigation.navigate('MatchVoting', { matchId: match.id })}
                                            className="bg-purple-600 p-4 rounded-2xl flex-row justify-center items-center shadow-lg shadow-purple-200"
                                        >
                                            <Trophy size={20} color="white" />
                                            <Text className="ml-2 text-white font-black italic uppercase text-[10px] tracking-widest">AVALIAR COMPANHEIROS</Text>
                                            <View className="ml-2 bg-purple-800 px-2 py-1 rounded-full">
                                                <Text className="text-white text-[8px] font-bold">VOTAÇÃO ABERTA</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                );
                            }
                            return null;
                        })()
                    )}

                    {/* Admin Actions */}
                    {canEditStats && (
                        <View className="mb-8">
                            <Text className="text-xs font-black italic text-slate-900 tracking-widest uppercase mb-4 ml-1">GESTÃO DA PARTIDA</Text>
                            <View className="gap-3">

                                <TouchableOpacity
                                    className="bg-white border border-slate-200 flex-row justify-center items-center py-4 rounded-2xl shadow-sm"
                                    onPress={() => navigation.navigate('MatchSummary', { matchId })}
                                >
                                    <Target size={18} color="#0F172A" />
                                    <Text className="ml-2 text-slate-900 font-black italic uppercase text-[10px] tracking-widest">GESTÃO DE SÚMULA (PLACAR/GOLS/NOTAS)</Text>
                                </TouchableOpacity>

                                {/* NEW: VIEW VOTES BUTTON */}
                                <TouchableOpacity
                                    className="bg-white border border-slate-200 flex-row justify-center items-center py-4 rounded-2xl shadow-sm"
                                    onPress={handleViewVotes}
                                >
                                    <Users size={18} color="#0F172A" />
                                    <Text className="ml-2 text-slate-900 font-black italic uppercase text-[10px] tracking-widest">VER VOTOS DETALHADOS (ADMIN)</Text>
                                </TouchableOpacity>

                                {match?.status !== 'finished' && (
                                    <TouchableOpacity className="bg-red-600 flex-row justify-center items-center py-4 rounded-2xl shadow-lg shadow-red-200" onPress={handleFinalizeMatch}>
                                        <Flag size={18} color="white" />
                                        <Text className="ml-2 text-white font-black italic uppercase text-[10px] tracking-widest">FINALIZAR PARTIDA</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}

                    {isOwner && match?.status === 'finished' && (
                        <TouchableOpacity className="mb-8 border-2 border-dashed border-red-200 p-4 rounded-2xl flex-row items-center justify-center" onPress={handleReopenMatch}>
                            <RotateCcw size={18} color="#EF4444" />
                            <Text className="ml-2 text-red-500 font-black italic uppercase text-[10px] tracking-widest">REABRIR PARTIDA (DADOS SERÃO RESETADOS)</Text>
                        </TouchableOpacity>
                    )}

                    {/* Stats Center */}
                    <View className="mb-8">
                        <View className="flex-row justify-between items-end mb-4">
                            <Text className="text-xl font-black italic text-slate-900 tracking-tighter">CENTRAL DA PARTIDA</Text>
                            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{confirmedPlayers.length} PRESENTES</Text>
                        </View>

                        {confirmedPlayers.length > 0 ? (
                            <View className="gap-3">
                                {confirmedPlayers.map((p) => {
                                    const pStats = statsByPlayer[p.id] || { goals: 0, assists: 0 };
                                    const payment = paymentsMap[p.id]; // Use paymentsMap
                                    return (
                                        <Card key={p.id} className="p-4 border-slate-50 shadow-sm">
                                            <View className="flex-row items-center justify-between">
                                                <View className="flex-row items-center flex-1">
                                                    <View className="w-10 h-10 bg-slate-900 rounded-xl items-center justify-center mr-3">
                                                        <Text className="text-white font-black italic">{p.name.substring(0, 2).toUpperCase()}</Text>
                                                    </View>
                                                    <View>
                                                        <Text className="font-bold text-slate-800">{p.name}</Text>
                                                        <View className="flex-row items-center mt-1">
                                                            <Target size={10} color="#006400" />
                                                            <Text className="ml-1 text-[10px] font-black italic text-[#006400] tracking-widest uppercase">{pStats.goals} GOLS</Text>
                                                            <View className="w-1 h-1 rounded-full bg-slate-200 mx-2" />
                                                            <Trophy size={10} color="#00BFFF" />
                                                            <Text className="ml-1 text-[10px] font-black italic text-[#00BFFF] tracking-widest uppercase">{pStats.assists} ASSIST</Text>
                                                        </View>
                                                    </View>
                                                </View>

                                                {payment && (
                                                    <TouchableOpacity onPress={() => handlePaymentAction(p.id)} className={`px-2 py-1 rounded-lg flex-row items-center ${payment.status === 'paid' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                                        <DollarSign size={10} color={payment.status === 'paid' ? '#10B981' : '#EF4444'} />
                                                        <Text className={`ml-1 text-[8px] font-black uppercase tracking-widest ${payment.status === 'paid' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                            {payment.status === 'paid' ? 'PAGO' : 'PENDENTE'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </Card>
                                    );
                                })}
                            </View>
                        ) : (
                            <View className="py-8 items-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                                <Users size={32} color="#CBD5E1" />
                                <Text className="mt-2 text-slate-400 font-medium italic">Nenhum atleta presente ainda.</Text>
                            </View>
                        )}
                    </View>

                    {/* Absent Players */}
                    {absentPlayers.length > 0 && (
                        <View className="mb-8 opacity-75">
                            <View className="flex-row justify-between items-end mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{absentPlayers.length} NÃO VÃO</Text>
                            </View>

                            <View className="gap-2">
                                {absentPlayers.map((p) => (
                                    <View key={p.id} className="p-3 bg-slate-50 rounded-xl flex-row items-center border border-slate-100">
                                        <XCircle size={14} color="#94A3B8" />
                                        <Text className="ml-2 font-bold text-slate-500 text-xs">{p.name}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                </View>

                {
                    showDatePicker && (
                        <DateTimePicker
                            value={date}
                            mode={datePickerMode}
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(_, selectedDate) => {
                                if (Platform.OS === 'android') {
                                    setShowDatePicker(false);
                                    if (selectedDate) {
                                        // If we just set the date, now set the time
                                        if (datePickerMode === 'date') {
                                            const currentDate = selectedDate;
                                            // Keep the time from the previous date state if needed, or just set date part
                                            // Standard: set date part, then ask for time
                                            const newDate = new Date(date);
                                            newDate.setFullYear(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
                                            setDate(newDate);

                                            // Open Time Picker
                                            setTimeout(() => {
                                                setDatePickerMode('time');
                                                setShowDatePicker(true);
                                            }, 100);
                                        } else {
                                            // We just set the time
                                            const timeDate = selectedDate;
                                            const newDate = new Date(date);
                                            newDate.setHours(timeDate.getHours());
                                            newDate.setMinutes(timeDate.getMinutes());
                                            setDate(newDate);
                                        }
                                    }
                                } else {
                                    // iOS - simplified, usually we might use 'datetime' or keep open
                                    setShowDatePicker(false);
                                    if (selectedDate) setDate(selectedDate);
                                }
                            }}
                        />
                    )
                }
            </ScrollView >
        </KeyboardAvoidingView >
    );
}
