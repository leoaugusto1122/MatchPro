import React, { useEffect, useState, useMemo } from 'react';
import { View, ScrollView, Alert, TouchableOpacity, Text, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { doc, updateDoc, addDoc, collection, Timestamp, onSnapshot, query, orderBy, getDocs, deleteField } from 'firebase/firestore';
import { Match, MatchEvent, PresenceStatus, Transaction, Player } from '@/types/models';
import { TransactionService } from '@/services/transactionService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatsService } from '@/services/statsService';
import {
    Calendar, MapPin, Trophy, Target,
    CheckCircle2, XCircle,
    Flag, RotateCcw, DollarSign,
    ChevronLeft, Settings2, Users, X, Trash2
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
    const [transactions, setTransactions] = useState<Transaction[]>([]);

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

    const myStatus = useMemo(() => {
        if (!match?.presence || !myPlayerProfile) return null;
        const p = match.presence[myPlayerProfile.id];
        return p ? p.status : null;
    }, [match, myPlayerProfile]);

    const getMyStatus = () => {
        if (!match?.presence || !myPlayerProfile) return null;
        const p = match.presence[myPlayerProfile.id];
        return p ? p.status : null;
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

    // NEW: Undecided Players (Not voted yet)
    const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);

    useEffect(() => {
        if (!teamId) return;
        const q = query(collection(db, 'teams', teamId, 'players'));
        const unsubPlayers = onSnapshot(q, (snap) => {
            const list: Player[] = [];
            snap.forEach(d => {
                const p = d.data() as Player;
                if (p.status === 'active') { // Only active players
                    list.push({ ...p, id: d.id });
                }
            });
            setTeamPlayers(list);
        });
        return () => unsubPlayers();
    }, [teamId]);

    const undecidedPlayers = useMemo(() => {
        if (!teamPlayers.length) return [];
        const decidedIds = new Set(Object.keys(match?.presence || {}));
        return teamPlayers
            .filter(p => !decidedIds.has(p.id))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [teamPlayers, match?.presence]);

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
            'ATENÇÃO: Isso irá reverter todas as estatísticas e pagamentos gerados para esta partida. Deseja continuar?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Sim, Reabrir',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            // 3rd arg is events
                            await StatsService.rollbackMatchStats(teamId, matchId, events);
                            Alert.alert('Sucesso', 'Partida reaberta para edição.');
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
    };

    const handlePresence = async (status: PresenceStatus) => {
        if (!match || !teamId || !myPlayerProfile) return;
        try {
            const matchRef = doc(db, 'teams', teamId, 'matches', match.id);
            await updateDoc(matchRef, {
                [`presence.${myPlayerProfile.id}`]: {
                    status,
                    name: myPlayerProfile.name,
                    timestamp: new Date()
                }
            });
        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Falha ao atualizar presença.');
        }
    };

    const handleAdminPresence = async (playerId: string, playerName: string, status: PresenceStatus) => {
        if (!match || !teamId) return;
        try {
            const matchRef = doc(db, 'teams', teamId, 'matches', match.id);
            await updateDoc(matchRef, {
                [`presence.${playerId}`]: {
                    status,
                    name: playerName,
                    timestamp: new Date()
                }
            });
        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Falha ao atualizar presença.');
        }
    };

    const handleRemovePresence = async (playerId: string) => {
        if (!match || !teamId) return;
        Alert.alert(
            'Remover Confirmação',
            'Deseja remover a presença deste jogador? Ele voltará para a lista de "Não Votaram".',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Remover',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const matchRef = doc(db, 'teams', teamId, 'matches', match.id);
                            await updateDoc(matchRef, {
                                [`presence.${playerId}`]: deleteField()
                            });
                        } catch (e) {
                            console.error(e);
                            Alert.alert('Erro', 'Falha ao remover presença.');
                        }
                    }
                }
            ]
        );
    };

    const handleViewVotes = async () => {
        if (!isAdmin || !teamId) {
            Alert.alert('Acesso Negado', 'Apenas donos e staff podem ver os votos detalhados.');
            return;
        }

        setLoading(true);
        try {
            // Fetch all votes for this match
            const votesRef = collection(db, 'teams', teamId, 'matches', matchId, 'votes');
            const snap = await getDocs(votesRef);
            const votesList: any[] = [];
            snap.forEach(d => votesList.push(d.data()));
            setAllVotes(votesList);
            setShowVotesModal(true);
        } catch (e) {
            Alert.alert('Erro', 'Falha ao buscar votos.');
        } finally {
            setLoading(false);
        }
    };

    const isAdmin = isOwner || currentRole === 'staff';

    const handlePaymentAction = (playerId: string) => {
        const payment = paymentsMap[playerId];
        if (!payment) return;

        if (payment.status === 'paid') {
            Alert.alert('Detalhes', `Pagamento realizado em ${format(new Date(), 'dd/MM')}`);
        } else {
            if (isAdmin) {
                Alert.alert(
                    'Receber Pagamento',
                    `Confirmar pagamento de R$ ${payment.amount}?`,
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                            text: 'Confirmar', onPress: async () => {
                                if (!teamId) return;
                                try {
                                    await TransactionService.markAsPaid(teamId, payment.id);
                                    Alert.alert('Sucesso', 'Pagamento registrado!');
                                } catch (e) {
                                    Alert.alert('Erro', 'Falha ao registrar pagamento.');
                                }
                            }
                        }
                    ]
                );
            }
        }
    };

    if (loading && !match) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-[#F8FAFC]">
            <View className="pt-12 px-6 pb-4 bg-white border-b border-slate-100">
                <View className="flex-row items-center justify-between">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="w-10 h-10 bg-slate-50 items-center justify-center rounded-full">
                        <ChevronLeft size={24} color="#0F172A" />
                    </TouchableOpacity>
                    <Text className="text-xl font-black italic text-slate-900 uppercase">DETALHES DA PARTIDA</Text>
                    <View className="w-10" />
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
                {/* Match Header Info */}
                <View className="mb-8">
                    <View className="flex-row justify-between items-start mb-2">
                        <View>
                            <Text className="text-3xl font-black italic text-slate-900 uppercase">
                                {match?.opponent || 'JOGO INTERNO'}
                            </Text>
                            <View className="flex-row items-center mt-2">
                                <Calendar size={14} color="#64748B" />
                                <Text className="ml-2 text-slate-500 font-bold text-xs uppercase">
                                    {match?.date ? format(date, "EEE, dd 'de' MMMM • HH:mm", { locale: ptBR }) : 'DATA A DEFINIR'}
                                </Text>
                            </View>
                            <View className="flex-row items-center mt-1">
                                <MapPin size={14} color="#64748B" />
                                <Text className="ml-2 text-slate-500 font-bold text-xs uppercase">{match?.location || 'LOCAL A DEFINIR'}</Text>
                            </View>
                        </View>
                        <Badge
                            label={match?.status === 'finished' ? 'FINALIZADO' : (match?.status === 'scheduled' ? 'AGENDADO' : 'RASCUNHO')}
                            color={match?.status === 'finished' ? '#dcfce7' : (match?.status === 'scheduled' ? '#fef9c3' : '#f1f5f9')}
                            textColor={match?.status === 'finished' ? '#166534' : (match?.status === 'scheduled' ? '#854d0e' : '#475569')}
                        />
                    </View>
                </View>

                {/* Main Content */}
                <View>
                    {/* Attendance Selector - Show if match open OR if owner */}
                    {/* UPDATED LOGIC: If match finished or date passed, disable for EVERYONE (including owner, unless they reopen/edit date) */}
                    {(() => {
                        const isFinished = match?.status === 'finished';
                        // Check date
                        let isPast = false;
                        if (match?.date) {
                            const d = (match.date as any).toDate ? (match.date as any).toDate() : new Date(match.date);
                            if (new Date() > d) isPast = true;
                        }

                        // Strict Rule: If Finished, Closed for everyone.
                        // If Past: Closed for Players, Open for Owner (to allow correction after reopen)
                        const isVotingClosed = isFinished || (isPast && !isOwner);

                        if (isVotingClosed) {
                            return (
                                <View className="mb-8">
                                    <Text className="text-xs font-black italic text-slate-900 tracking-widest uppercase mb-4 ml-1">SUA PRESENÇA</Text>
                                    <View className="bg-slate-100 p-4 rounded-2xl border border-slate-200 items-center justify-center">
                                        <Text className="text-slate-400 font-bold text-xs uppercase text-center">
                                            {isFinished ? 'PARTIDA FINALIZADA' : 'DATA LIMITE EXPIRADA'}
                                        </Text>
                                        <Text className="text-slate-400 text-[10px] text-center mt-1">
                                            Não é mais possível alterar a presença.
                                        </Text>
                                    </View>
                                </View>
                            );
                        }

                        // Regular Voting
                        return (myPlayerProfile?.isAthlete || isOwner) ? (
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
                        ) : null;
                    })()}

                    {/* Voting Logic - Only show if finished or I voted 'confirmed' */}
                    {isOwner && match?.status === 'finished' && (
                        (() => {
                            // Check if voting is open (e.g. within 24h after match)
                            // For now, always open if finished
                            const canVote = true; // Placeholder
                            if (canVote) {
                                return (
                                    <View className="mb-8">
                                        <Text className="text-xs font-black italic text-slate-900 tracking-widest uppercase mb-4 ml-1">PÓS-JOGO</Text>
                                        <TouchableOpacity
                                            onPress={() => navigation.navigate('PostMatchVoting', { matchId })}
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

                                                <View className="flex-row items-center gap-2">
                                                    {payment && (
                                                        <TouchableOpacity onPress={() => handlePaymentAction(p.id)} className={`px-2 py-1 rounded-lg flex-row items-center ${payment.status === 'paid' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                                            <DollarSign size={10} color={payment.status === 'paid' ? '#10B981' : '#EF4444'} />
                                                            <Text className={`ml-1 text-[8px] font-black uppercase tracking-widest ${payment.status === 'paid' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                {payment.status === 'paid' ? 'PAGO' : 'PENDENTE'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}

                                                    {/* Admin Reset Presence */}
                                                    {(canManageMatches || isOwner) && match?.status !== 'finished' && (
                                                        <TouchableOpacity
                                                            onPress={() => handleRemovePresence(p.id)}
                                                            className="w-8 h-8 items-center justify-center"
                                                        >
                                                            <Trash2 size={14} color="#CBD5E1" />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
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


                    {absentPlayers.length > 0 && (
                        <View className="mb-8 opacity-75">
                            <View className="flex-row justify-between items-end mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{absentPlayers.length} NÃO VÃO</Text>
                            </View>

                            <View className="gap-2">
                                {absentPlayers.map((p) => (
                                    <View key={p.id} className="p-3 bg-slate-50 rounded-xl flex-row items-center justify-between border border-slate-100">
                                        <View className="flex-row items-center">
                                            <XCircle size={14} color="#94A3B8" />
                                            <Text className="ml-2 font-bold text-slate-500 text-xs">{p.name}</Text>
                                        </View>

                                        {/* Admin Reset Presence */}
                                        {(canManageMatches || isOwner) && match?.status !== 'finished' && (
                                            <TouchableOpacity
                                                onPress={() => handleRemovePresence(p.id)}
                                                className="w-6 h-6 items-center justify-center"
                                            >
                                                <Trash2 size={12} color="#CBD5E1" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* NEW: Undecided Players View */}
                    {undecidedPlayers.length > 0 && (
                        <View className="mb-8 opacity-60">
                            <View className="flex-row justify-between items-end mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{undecidedPlayers.length} AINDA NÃO VOTARAM</Text>
                            </View>

                            <View className="gap-2">
                                {undecidedPlayers.map((p) => (
                                    <View key={p.id} className="p-3 bg-slate-50 rounded-xl flex-row items-center justify-between border border-slate-100 border-dashed">
                                        <View className="flex-row items-center">
                                            <View className="w-4 h-4 rounded-full bg-slate-200 items-center justify-center">
                                                <Text className="text-[8px] font-bold text-slate-500">?</Text>
                                            </View>
                                            <Text className="ml-2 font-bold text-slate-400 text-xs">{p.name}</Text>
                                        </View>

                                        {/* Admin Actions */}
                                        {(canManageMatches || isOwner) && (match?.status !== 'finished') && (
                                            <View className="flex-row gap-2">
                                                <TouchableOpacity
                                                    onPress={() => handleAdminPresence(p.id, p.name, 'confirmed')}
                                                    className="w-6 h-6 bg-emerald-100 rounded-full items-center justify-center"
                                                >
                                                    <CheckCircle2 size={12} color="#059669" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleAdminPresence(p.id, p.name, 'out')}
                                                    className="w-6 h-6 bg-red-100 rounded-full items-center justify-center"
                                                >
                                                    <XCircle size={12} color="#DC2626" />
                                                </TouchableOpacity>
                                            </View>
                                        )}
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

                {/* Votes Modal */}
                <Modal visible={showVotesModal} animationType="slide" presentationStyle="pageSheet">
                    <View className="flex-1 bg-white p-6">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-black italic text-slate-900 uppercase">VOTOS DA PARTIDA</Text>
                            <TouchableOpacity onPress={() => setShowVotesModal(false)} className="bg-slate-100 p-2 rounded-full">
                                <X size={24} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView>
                            {allVotes.length === 0 ? (
                                <Text className="text-center text-slate-400 italic mt-10">Nenhum voto registrado.</Text>
                            ) : (
                                allVotes.map((v, index) => (
                                    <View key={index} className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                        <Text className="font-bold text-slate-800 text-xs uppercase mb-2">Votante: {v.voterName || 'Anônimo'}</Text>
                                        <View className="gap-1">
                                            <Text className="text-[10px] text-slate-500">Melhor em Campo: <Text className="font-bold text-slate-700">{v.bestPlayerId || 'N/A'}</Text></Text>
                                            <Text className="text-[10px] text-slate-500">Bagre: <Text className="font-bold text-slate-700">{v.worstPlayerId || 'N/A'}</Text></Text>
                                        </View>
                                        {/* Ratings */}
                                        {v.ratings && Object.keys(v.ratings).length > 0 && (
                                            <View className="mt-2 pt-2 border-t border-slate-200">
                                                <Text className="text-[10px] font-black uppercase text-slate-400 mb-1">NOTAS</Text>
                                                <View className="flex-row flex-wrap gap-2">
                                                    {Object.entries(v.ratings).map(([pid, rate]) => (
                                                        <View key={pid} className="bg-white px-2 py-1 rounded border border-slate-100">
                                                            <Text className="text-[8px] font-bold text-slate-600">{pid.substring(0, 4)}... : {String(rate)}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </Modal>

            </ScrollView>
        </KeyboardAvoidingView>
    );
}
