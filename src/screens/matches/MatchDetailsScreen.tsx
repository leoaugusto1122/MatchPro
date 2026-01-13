import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, Avatar, ActivityIndicator, Divider, Chip, Surface } from 'react-native-paper';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { doc, getDoc, updateDoc, addDoc, collection, Timestamp, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore';
import { Match, MatchEvent, PresenceStatus, GamePayment } from '@/types/models';
import { BillingService } from '@/services/billingService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatsService } from '@/services/statsService';

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
    const [payments, setPayments] = useState<Record<string, GamePayment>>({}); // playerId -> payment

    // Form State
    const [opponent, setOpponent] = useState('');
    const [location, setLocation] = useState('');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Score State
    const [scoreHome, setScoreHome] = useState('0');
    const [scoreAway, setScoreAway] = useState('0');

    useEffect(() => {
        if (!teamId || !matchId) return;

        // Fetch Match
        const matchRef = doc(db, 'teams', teamId, 'matches', matchId);
        const unsubMatch = onSnapshot(matchRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data() as Match;
                setMatch({ id: snap.id, ...data });
                setOpponent(data.opponent || '');
                setLocation(data.location || '');
                setDate(data.date?.toDate ? data.date.toDate() : new Date(data.date));
                setScoreHome(data.scoreHome?.toString() || '0');
                setScoreAway(data.scoreAway?.toString() || '0');
            }
        });

        // Fetch Events
        const eventsRef = collection(db, 'teams', teamId, 'matches', matchId, 'events');
        const q = query(eventsRef, orderBy('createdAt', 'asc'));
        const unsubEvents = onSnapshot(q, (snap) => {
            const list: MatchEvent[] = [];
            snap.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as MatchEvent);
            });
            setEvents(list);
        });

        // Fetch Payments
        const paymentsRef = collection(db, 'teams', teamId, 'matches', matchId, 'payments');
        const unsubPayments = onSnapshot(paymentsRef, (snap) => {
            const map: Record<string, GamePayment> = {};
            snap.forEach(doc => {
                const p = doc.data() as GamePayment;
                map[p.playerId] = p; // Indexed by playerId for easy access
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

        // Lock business rule
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

    // --- Match Center Logic ---

    const canEditStats = useMemo(() => {
        if (!match) return false;
        if (match.status === 'finished') return isOwner; // Only Owner edits after finish
        return canManageMatches; // Coach/Owner can edit before finish
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

        // Business Rule: Max 1 assist per goal (Total Assists <= Total Goals)
        // Wait, current event isn't added yet.
        if (type === 'assist') {
            if (totalPlayerAssists >= totalPlayerGoals) {
                Alert.alert('Inválido', 'Número de assistências não pode superar o número de gols.');
                return;
            }
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
        // Find last event for this player of this type
        const playerEvents = events.filter(e => e.playerId === playerId && e.type === type);
        if (playerEvents.length === 0) return;

        const lastEvent = playerEvents[playerEvents.length - 1]; // Assuming sorted by date query? Yes we did orderBy.
        // Actually better to sort locally to be sure logic matches UI
        // But firestore id is random, so date essential.

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
                            Alert.alert('Erro', 'Falha ao finalizar partida e processar estatísticas.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // Owner Logic: Re-open Match
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
                            await StatsService.rollbackMatchStats(
                                teamId,
                                matchId,
                                events
                            );
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
        if (!payment || payment.status === 'paid') return;

        if (currentRole === 'player' || currentRole === 'staff') {
            // staff shouldn't be here, but just in case
            if (currentRole === 'player') return; // Player cannot mark as paid
        }
        // Owner or Coach can mark as paid
        // Check exact role permission from prompt: Owner & Coach ✅
        if (!isOwner && currentRole !== 'coach') return;

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


    // --- Render ---

    const getMyStatus = () => {
        if (match?.presence && myPlayerProfile?.id) {
            return match.presence[myPlayerProfile.id]?.status || 'out';
        }
        return 'out';
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {/* Header / Meta */}
            {isEditing ? (
                <View style={styles.card}>
                    <Text variant="titleMedium" style={styles.sectionTitle}>Editar Detalhes</Text>
                    <TextInput label="Adversário" value={opponent} onChangeText={setOpponent} mode="outlined" style={styles.input} />
                    <TextInput label="Local" value={location} onChangeText={setLocation} mode="outlined" style={styles.input} />
                    <Text variant="bodyMedium" style={{ marginBottom: 10 }}>Data: {format(date, "dd/MM/yyyy HH:mm")}</Text>
                    <Button onPress={() => setShowDatePicker(true)} mode="outlined">Alterar Data</Button>
                    <View style={styles.row}>
                        <Button onPress={() => setIsEditing(false)} style={{ flex: 1 }}>Cancelar</Button>
                        <Button mode="contained" onPress={handleSaveInfo} style={{ flex: 1 }}>Salvar</Button>
                    </View>
                </View>
            ) : (
                <View style={styles.header}>
                    <View style={styles.scoreBoard}>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>Meu Time</Text>
                        {canEditStats ? (
                            <View style={styles.scoreInputs}>
                                <TextInput
                                    style={styles.scoreInput}
                                    value={scoreHome}
                                    onChangeText={setScoreHome}
                                    keyboardType="numeric"
                                    dense
                                />
                                <Text variant="headlineSmall">x</Text>
                                <TextInput
                                    style={styles.scoreInput}
                                    value={scoreAway}
                                    onChangeText={setScoreAway}
                                    keyboardType="numeric"
                                    dense
                                />
                            </View>
                        ) : (
                            <Text variant="displayMedium" style={{ marginHorizontal: 10 }}>
                                {match?.scoreHome} x {match?.scoreAway}
                            </Text>
                        )}
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>{match?.opponent || 'Adv'}</Text>
                    </View>

                    <Text variant="bodyMedium" style={{ color: '#666', marginTop: 5 }}>
                        {match?.date && format(match.date, "EEEE, d 'de' MMMM", { locale: ptBR })} • {match?.location}
                    </Text>
                    <Chip style={{ marginTop: 5 }} mode="outlined" icon={match?.status === 'finished' ? 'check' : 'clock'}>
                        {match?.status === 'finished' ? 'Finalizada' : 'Agendada'}
                    </Chip>

                    {canManageMatches && (match?.status !== 'finished' || isOwner) && (
                        <Button mode="text" onPress={() => setIsEditing(true)}>Editar Detalhes</Button>
                    )}
                </View>
            )}

            <Divider style={{ marginVertical: 20 }} />

            {/* Match Center (Stats) */}
            <Text variant="titleLarge" style={styles.sectionTitle}>Match Center</Text>

            {canEditStats && match?.status !== 'finished' && (
                <View style={styles.adminPanel}>
                    <Button mode="contained-tonal" icon="content-save" onPress={handleUpdateScore}>Atualizar Placar</Button>
                    <Button mode="contained" buttonColor={match?.status === 'finished' ? 'gray' : 'red'} icon="flag-checkered" onPress={handleFinalizeMatch}>
                        Finalizar Partida
                    </Button>
                </View>
            )}

            {isOwner && match?.status === 'finished' && (
                <View style={styles.adminPanel}>
                    <Button mode="outlined" icon="lock-open" onPress={handleReopenMatch}>Reabrir Partida (Rollback)</Button>
                </View>
            )}

            {(match?.status === 'finished' || canEditStats) ? (
                <View style={styles.statsContainer}>
                    {confirmedPlayers.map((p) => {
                        const pStats = statsByPlayer[p.id] || { goals: 0, assists: 0 };
                        return (
                            <Surface key={p.id} style={styles.playerRow} elevation={1}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <Avatar.Text size={40} label={p.name.substring(0, 2).toUpperCase()} />
                                    <View style={{ marginLeft: 10 }}>
                                        <Text variant="titleSmall">
                                            {p.name}
                                            {payments[p.id] && (
                                                <TouchableOpacity onPress={() => handlePaymentAction(p.id)}>
                                                    <Chip
                                                        style={{ marginLeft: 8, height: 24 }}
                                                        textStyle={{ fontSize: 10, lineHeight: 12 }}
                                                        mode="flat"
                                                        icon={payments[p.id].status === 'paid' ? 'check' : 'cash-clock'}
                                                        compact
                                                    >
                                                        {payments[p.id].status === 'paid' ? 'Pago' : 'Pendente'}
                                                    </Chip>
                                                </TouchableOpacity>
                                            )}
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: '#666' }}>
                                            {pStats.goals} Gols • {pStats.assists} Ass
                                        </Text>
                                    </View>
                                </View>

                                {canEditStats && (
                                    <View style={styles.statControls}>
                                        <View style={styles.statControlGroup}>
                                            <TouchableOpacity onPress={() => handleRemoveLastEvent(p.id, 'goal')}>
                                                <Text style={styles.minus}>-</Text>
                                            </TouchableOpacity>
                                            <Text style={styles.statLabel}>G</Text>
                                            <TouchableOpacity onPress={() => handleAddEvent(p.id, p.name, 'goal')}>
                                                <Text style={styles.plus}>+</Text>
                                            </TouchableOpacity>
                                        </View>

                                        <View style={styles.statControlGroup}>
                                            <TouchableOpacity onPress={() => handleRemoveLastEvent(p.id, 'assist')}>
                                                <Text style={styles.minus}>-</Text>
                                            </TouchableOpacity>
                                            <Text style={styles.statLabel}>A</Text>
                                            <TouchableOpacity onPress={() => handleAddEvent(p.id, p.name, 'assist')}>
                                                <Text style={styles.plus}>+</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </Surface>
                        );
                    })}
                    {confirmedPlayers.length === 0 && <Text style={{ textAlign: 'center', color: '#888' }}>Nenhum jogador confirmado.</Text>}
                </View>
            ) : (
                <Text style={{ textAlign: 'center', margin: 20, color: '#666' }}>
                    Estatísticas disponíveis após o jogo.
                </Text>
            )}

            <Divider style={{ marginVertical: 20 }} />

            {/* Presence Section (ReadOnly if Finished) */}
            <Text variant="titleMedium" style={styles.sectionTitle}>Presença</Text>
            {match?.status !== 'finished' || isOwner ? (
                <>
                    <SegmentedButtons
                        value={getMyStatus()}
                        onValueChange={(val) => handlePresence(val as PresenceStatus)}
                        buttons={[
                            { value: 'confirmed', label: 'Vou', icon: 'check', showSelectedCheck: true },
                            { value: 'maybe', label: 'Talvez', icon: 'help', showSelectedCheck: true },
                            { value: 'out', label: 'Não', icon: 'close', showSelectedCheck: true },
                        ]}
                    />
                </>
            ) : (
                <Text style={{ color: '#666', fontStyle: 'italic' }}>Lista de presença fechada.</Text>
            )}

            <View style={{ marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {confirmedPlayers.map((p, index) => (
                    <View key={index} style={{ alignItems: 'center', width: 60 }}>
                        <Avatar.Text size={40} label={p.name.substring(0, 2).toUpperCase()} style={{ backgroundColor: '#e0e0e0' }} />
                        <Text variant="bodySmall" numberOfLines={1} style={{ marginTop: 4 }}>{p.name.split(' ')[0]}</Text>
                    </View>
                ))}
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

            <View style={{ height: 50 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: '#f5f5f5',
        flexGrow: 1,
    },
    header: {
        alignItems: 'center',
        marginBottom: 10,
        backgroundColor: 'white',
        padding: 20,
        borderRadius: 12,
        elevation: 2
    },
    card: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 12,
        elevation: 2,
        marginBottom: 10
    },
    sectionTitle: {
        marginBottom: 12,
        fontWeight: 'bold',
        color: '#333'
    },
    input: {
        marginBottom: 12,
        backgroundColor: 'white'
    },
    row: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 10
    },
    scoreBoard: {
        alignItems: 'center',
        marginBottom: 10
    },
    scoreInputs: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginVertical: 5
    },
    scoreInput: {
        width: 60,
        textAlign: 'center',
        fontSize: 24,
        fontWeight: 'bold',
        backgroundColor: '#f0f0f0'
    },
    adminPanel: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 15,
        gap: 10
    },
    statsContainer: {
        gap: 8
    },
    playerRow: {
        padding: 10,
        borderRadius: 8,
        backgroundColor: 'white',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    statControls: {
        flexDirection: 'row',
        gap: 15
    },
    statControlGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0f0f0',
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 2
    },
    plus: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2196F3',
        paddingHorizontal: 8
    },
    minus: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#F44336',
        paddingHorizontal: 8
    },
    statLabel: {
        fontWeight: 'bold',
        marginHorizontal: 2
    }
});
