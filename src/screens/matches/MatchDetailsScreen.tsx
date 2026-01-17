import React, { useEffect, useState, useMemo } from 'react';
import { View, ScrollView, Alert, TouchableOpacity, Text, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { doc, updateDoc, addDoc, collection, Timestamp, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore';
import { Match, MatchEvent, PresenceStatus, GamePayment } from '@/types/models';
import { BillingService } from '@/services/billingService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatsService } from '@/services/statsService';
import {
    Calendar, MapPin, Trophy, Target,
    CheckCircle2, XCircle, HelpCircle,
    Save, Flag, RotateCcw, DollarSign,
    ChevronLeft, Settings2, Plus, Minus
} from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ButtonPrimary } from '@/components/ui/ButtonPrimary';

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
    const [payments, setPayments] = useState<Record<string, GamePayment>>({});

    const [opponent, setOpponent] = useState('');
    const [location, setLocation] = useState('');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [scoreHome, setScoreHome] = useState('0');
    const [scoreAway, setScoreAway] = useState('0');

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

        const paymentsRef = collection(db, 'teams', teamId, 'matches', matchId, 'payments');
        const unsubPayments = onSnapshot(paymentsRef, (snap) => {
            const map: Record<string, GamePayment> = {};
            snap.forEach(doc => {
                const p = doc.data() as GamePayment;
                map[p.playerId] = p;
            });
            setPayments(map);
        });

        return () => {
            unsubMatch();
            unsubEvents();
            unsubPayments();
        };
    }, [matchId, teamId]);

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

        if (match.status === 'finished' && !isOwner) {
            Alert.alert('Bloqueado', 'Partida finalizada. Presença travada.');
            return;
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
        const stats: Record<string, { goals: number, assists: number }> = {};
        events.forEach(e => {
            if (!stats[e.playerId]) stats[e.playerId] = { goals: 0, assists: 0 };
            if (e.type === 'goal') stats[e.playerId].goals++;
            if (e.type === 'assist') stats[e.playerId].assists++;
        });
        return stats;
    }, [events]);

    const totalPlayerGoals = useMemo(() => {
        return events.filter(e => e.type === 'goal').length;
    }, [events]);

    const totalPlayerAssists = useMemo(() => {
        return events.filter(e => e.type === 'assist').length;
    }, [events]);

    const confirmedPlayers = useMemo(() => {
        if (!match?.presence) return [];
        return Object.entries(match.presence)
            .filter(([_, p]) => p.status === 'confirmed')
            .map(([id, p]) => ({ id, ...p }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [match?.presence]);

    const handleAddEvent = async (playerId: string, playerName: string, type: 'goal' | 'assist') => {
        if (!match || !teamId) return;
        if (type === 'assist' && totalPlayerAssists >= totalPlayerGoals) {
            Alert.alert('Inválido', 'Número de assistências não pode superar o número de gols.');
            return;
        }

        try {
            await addDoc(collection(db, 'teams', teamId, 'matches', matchId, 'events'), {
                matchId,
                playerId,
                playerName,
                type,
                createdAt: Timestamp.now()
            });
        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Falha ao adicionar evento.');
        }
    };

    const handleRemoveLastEvent = async (playerId: string, type: 'goal' | 'assist') => {
        const playerEvents = events.filter(e => e.playerId === playerId && e.type === type);
        if (playerEvents.length === 0) return;
        const lastEvent = playerEvents[playerEvents.length - 1];
        try {
            await deleteDoc(doc(db, 'teams', teamId!, 'matches', matchId, 'events', lastEvent.id));
        } catch (e) {
            Alert.alert('Erro', 'Falha ao remover evento.');
        }
    };

    const handleUpdateScore = async () => {
        if (!match || !teamId) return;
        try {
            await updateDoc(doc(db, 'teams', teamId, 'matches', matchId), {
                scoreHome: parseInt(scoreHome) || 0,
                scoreAway: parseInt(scoreAway) || 0
            });
            Alert.alert('Sucesso', 'Placar atualizado.');
        } catch (e) {
            Alert.alert('Erro', 'Erro ao salvar placar.');
        }
    };

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
        const payment = payments[playerId];
        if (!payment || payment.status === 'paid' || (!isOwner && currentRole !== 'coach')) return;

        Alert.alert(
            'Confirmar Pagamento',
            'Deseja marcar este pagamento como PAGO?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    onPress: async () => {
                        try {
                            if (!myPlayerProfile?.userId) return;
                            await BillingService.markPaymentAsPaid(teamId!, 'PER_GAME', payment.id, matchId, myPlayerProfile.userId);
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

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-[#F8FAFC]">
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
                                <TouchableOpacity onPress={() => setShowDatePicker(true)} className="bg-slate-900 px-4 py-2 rounded-lg">
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

                            {/* Scoreboard */}
                            <View className="flex-row justify-between items-center px-4 mb-4">
                                <View className="items-center flex-1">
                                    <View className="w-16 h-16 bg-slate-900 rounded-3xl items-center justify-center mb-2">
                                        <Trophy size={32} color="white" />
                                    </View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest">MEU TIME</Text>
                                </View>

                                <View className="flex-row items-center gap-4">
                                    {canEditStats ? (
                                        <View className="flex-row items-center gap-2">
                                            <TextInput
                                                className="bg-slate-100 w-14 h-14 rounded-2xl text-center text-3xl font-black italic text-slate-900"
                                                value={scoreHome} onChangeText={setScoreHome} keyboardType="numeric"
                                            />
                                            <Text className="text-slate-300 font-black italic text-xl">X</Text>
                                            <TextInput
                                                className="bg-slate-100 w-14 h-14 rounded-2xl text-center text-3xl font-black italic text-slate-900"
                                                value={scoreAway} onChangeText={setScoreAway} keyboardType="numeric"
                                            />
                                        </View>
                                    ) : (
                                        <View className="flex-row items-center gap-4">
                                            <Text className="text-5xl font-black italic text-slate-900 tracking-tighter">{match?.scoreHome}</Text>
                                            <Text className="text-slate-300 font-black italic text-2xl">X</Text>
                                            <Text className="text-5xl font-black italic text-slate-900 tracking-tighter">{match?.scoreAway}</Text>
                                        </View>
                                    )}
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

                    {/* Attendance Selector */}
                    {match?.status !== 'finished' || isOwner ? (
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
                                    className={`flex-1 py-4 flex-row justify-center items-center rounded-xl ${getMyStatus() === 'maybe' ? 'bg-orange-400' : 'bg-transparent'}`}
                                    onPress={() => handlePresence('maybe')}
                                >
                                    <HelpCircle size={16} color={getMyStatus() === 'maybe' ? 'white' : '#94A3B8'} />
                                    <Text className={`ml-2 font-black italic text-[10px] uppercase tracking-widest ${getMyStatus() === 'maybe' ? 'text-white' : 'text-slate-400'}`}>Talvez</Text>
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

                    {/* Admin Actions */}
                    {canEditStats && match?.status !== 'finished' && (
                        <View className="flex-row gap-3 mb-8">
                            <TouchableOpacity className="flex-1 bg-slate-900 flex-row justify-center items-center py-4 rounded-2xl shadow-lg shadow-slate-300" onPress={handleUpdateScore}>
                                <Save size={18} color="white" />
                                <Text className="ml-2 text-white font-black italic uppercase text-[10px] tracking-widest">PLACAR</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className="flex-1 bg-red-600 flex-row justify-center items-center py-4 rounded-2xl shadow-lg shadow-red-200" onPress={handleFinalizeMatch}>
                                <Flag size={18} color="white" />
                                <Text className="ml-2 text-white font-black italic uppercase text-[10px] tracking-widest">FINALIZAR</Text>
                            </TouchableOpacity>
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
                            <Text className="text-xl font-black italic text-slate-900 tracking-tighter">MATCH CENTER</Text>
                            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{confirmedPlayers.length} PRESENTES</Text>
                        </View>

                        {confirmedPlayers.length > 0 ? (
                            <View className="gap-3">
                                {confirmedPlayers.map((p) => {
                                    const pStats = statsByPlayer[p.id] || { goals: 0, assists: 0 };
                                    const payment = payments[p.id];
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

                                                {canEditStats && (
                                                    <View className="flex-row gap-2 ml-4">
                                                        {/* Goals Control */}
                                                        <View className="flex-row items-center bg-slate-50 rounded-xl p-1 border border-slate-100">
                                                            <TouchableOpacity onPress={() => handleRemoveLastEvent(p.id, 'goal')} className="p-1">
                                                                <Minus size={14} color="#EF4444" />
                                                            </TouchableOpacity>
                                                            <Text className="font-black italic text-[10px] px-1">G</Text>
                                                            <TouchableOpacity onPress={() => handleAddEvent(p.id, p.name, 'goal')} className="p-1">
                                                                <Plus size={14} color="#10B981" />
                                                            </TouchableOpacity>
                                                        </View>
                                                        {/* Assists Control */}
                                                        <View className="flex-row items-center bg-slate-50 rounded-xl p-1 border border-slate-100">
                                                            <TouchableOpacity onPress={() => handleRemoveLastEvent(p.id, 'assist')} className="p-1">
                                                                <Minus size={14} color="#EF4444" />
                                                            </TouchableOpacity>
                                                            <Text className="font-black italic text-[10px] px-1">A</Text>
                                                            <TouchableOpacity onPress={() => handleAddEvent(p.id, p.name, 'assist')} className="p-1">
                                                                <Plus size={14} color="#10B981" />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
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

                </View>

                {showDatePicker && (
                    <DateTimePicker
                        value={date}
                        mode="date"
                        display="default"
                        onChange={(_, selectedDate) => {
                            setShowDatePicker(false);
                            if (selectedDate) setDate(selectedDate);
                        }}
                    />
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
