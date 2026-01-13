import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card, Avatar, Button, ActivityIndicator, Badge, Surface, useTheme, Divider, Banner, Chip, Appbar } from 'react-native-paper';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { collection, query, where, orderBy, limit, getDocs, Timestamp, collectionGroup } from 'firebase/firestore';
import { Match, Player } from '@/types/models';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function HomeScreen({ navigation }: any) {
    const theme = useTheme();
    const teamId = useTeamStore(state => state.teamId);
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
                } catch (e) {
                    console.log("Collection Group Query failed (likely missing index). skipping game payments summary.");
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

    const renderPlayerRankItem = (player: Player, index: number, value: string | number, label: string) => (
        <View key={player.id} style={styles.rankItem}>
            <View style={styles.rankIndex}>
                <Text style={{ fontWeight: 'bold', color: theme.colors.primary }}>{index + 1}º</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Avatar.Text size={36} label={player.name.substring(0, 2).toUpperCase()} style={{ marginRight: 10, backgroundColor: '#e0e0e0' }} />
                <View>
                    <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{player.name}</Text>
                    {player.position && <Text variant="labelSmall" style={{ color: '#666' }}>{player.position}</Text>}
                </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{value}</Text>
                <Text variant="labelSmall">{label}</Text>
            </View>
        </View>
    );

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" /></View>;
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
                <Appbar.Content title="Dashboard" />
                {canManageTeam && <Appbar.Action icon="cog" onPress={() => navigation.navigate('TeamSettings')} />}
            </Appbar.Header>

            {/* Financial Summary */}
            {canManageTeam && (
                <View style={[styles.section, { paddingBottom: 10 }]}>
                    <Text variant="titleMedium" style={styles.sectionTitle}>Financeiro</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Card style={[styles.card, { flex: 1, backgroundColor: '#e3f2fd' }]}>
                            <Card.Content>
                                <Text variant="labelMedium">Arrecadado</Text>
                                <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#1565C0' }}>
                                    R$ {financials.collected.toFixed(2)}
                                </Text>
                            </Card.Content>
                        </Card>
                        <Card style={[styles.card, { flex: 1, backgroundColor: '#ffebee' }]}>
                            <Card.Content>
                                <Text variant="labelMedium">Pendente</Text>
                                <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#C62828' }}>
                                    R$ {financials.pending.toFixed(2)}
                                </Text>
                            </Card.Content>
                        </Card>
                    </View>
                </View>
            )}

            {canManageTeam && confirmedCount < 5 && nextMatch && (
                <Banner visible={true} icon="alert-circle" actions={[{ label: 'Ver Detalhes', onPress: () => navigation.navigate('MatchDetails', { matchId: nextMatch.id }) }]}>
                    Atenção: Apenas {confirmedCount} confirmados para o próximo jogo.
                </Banner>
            )}

            <View style={styles.section}>
                <Text variant="titleLarge" style={styles.sectionTitle}>Próxima Partida</Text>
                {nextMatch ? (
                    <Card style={styles.card} onPress={() => navigation.navigate('MatchDetails', { matchId: nextMatch.id })}>
                        <Card.Content>
                            <View style={styles.matchHeader}>
                                <Chip icon="calendar" compact>{nextMatch.date?.toDate ? format(nextMatch.date.toDate(), 'dd/MM HH:mm') : ''}</Chip>
                                <Chip icon="map-marker" compact>{nextMatch.location || 'Local a definir'}</Chip>
                            </View>
                            <Text variant="headlineSmall" style={{ marginTop: 10, fontWeight: 'bold' }}>vs {nextMatch.opponent || 'Adversário'}</Text>

                            <Divider style={{ marginVertical: 10 }} />

                            <View style={styles.presenceInfo}>
                                <Text variant="bodyMedium">Confirmados: </Text>
                                <Badge size={24} style={{ backgroundColor: confirmedCount >= 10 ? '#4CAF50' : '#FFC107' }}>{confirmedCount}</Badge>
                            </View>
                        </Card.Content>
                    </Card>
                ) : (
                    <Card style={styles.card}>
                        <Card.Content>
                            <Text style={{ color: '#666', fontStyle: 'italic' }}>Nenhum jogo agendado.</Text>
                            {canManageTeam && <Button style={{ marginTop: 10 }} mode="contained-tonal" onPress={() => navigation.navigate('Partidas')}>Agendar</Button>}
                        </Card.Content>
                    </Card>
                )}
            </View>

            {lastMatch && (
                <View style={styles.section}>
                    <Text variant="titleLarge" style={styles.sectionTitle}>Último Resultado</Text>
                    <Card style={[styles.card, { backgroundColor: '#333' }]} onPress={() => navigation.navigate('MatchDetails', { matchId: lastMatch.id })}>
                        <Card.Content>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ alignItems: 'center' }}>
                                    <Text variant="titleMedium" style={{ color: 'white' }}>Meu Time</Text>
                                    <Text variant="displayMedium" style={{ color: 'white', fontWeight: 'bold' }}>{lastMatch.scoreHome}</Text>
                                </View>
                                <Text variant="headlineSmall" style={{ color: '#aaa' }}>X</Text>
                                <View style={{ alignItems: 'center' }}>
                                    <Text variant="titleMedium" style={{ color: 'white' }}>{lastMatch.opponent}</Text>
                                    <Text variant="displayMedium" style={{ color: 'white', fontWeight: 'bold' }}>{lastMatch.scoreAway}</Text>
                                </View>
                            </View>
                            <Text style={{ color: '#ccc', textAlign: 'center', marginTop: 10 }}>
                                {lastMatch.date?.toDate ? format(lastMatch.date.toDate(), "d 'de' MMMM", { locale: ptBR }) : ''}
                            </Text>
                        </Card.Content>
                    </Card>
                </View>
            )}

            <View style={styles.rowSection}>
                <View style={styles.halfColumn}>
                    <Text variant="titleMedium" style={styles.sectionTitle}>Artilheiros</Text>
                    <Surface style={styles.rankCard}>
                        {topScorers.length > 0 ? (
                            topScorers.map((p, i) => renderPlayerRankItem(p, i, p.goals, 'Gols'))
                        ) : (
                            <Text style={styles.emptyText}>Sem dados</Text>
                        )}
                    </Surface>
                </View>

                <View style={styles.halfColumn}>
                    <Text variant="titleMedium" style={styles.sectionTitle}>MVPs</Text>
                    <Surface style={styles.rankCard}>
                        {topMvps.length > 0 ? (
                            topMvps.map((p, i) => renderPlayerRankItem(p, i, p.mvpScore?.toFixed(1) || '0', 'Pontos'))
                        ) : (
                            <Text style={styles.emptyText}>Sem dados</Text>
                        )}
                    </Surface>
                </View>
            </View>

            <Text style={{ textAlign: 'center', color: '#888', marginTop: 20, fontSize: 12 }}>
                Estatísticas atualizadas ao finalizar partidas.
            </Text>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    section: {
        padding: 16,
        paddingBottom: 0
    },
    sectionTitle: {
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333'
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 12,
        elevation: 2
    },
    matchHeader: {
        flexDirection: 'row',
        gap: 8
    },
    presenceInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    rowSection: {
        flexDirection: 'row',
        padding: 16,
        gap: 10
    },
    halfColumn: {
        flex: 1
    },
    rankCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 10,
        elevation: 1,
        minHeight: 100
    },
    rankItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: '#eee',
        paddingBottom: 4
    },
    rankIndex: {
        width: 25,
        alignItems: 'center'
    },
    emptyText: {
        textAlign: 'center',
        color: '#999',
        fontStyle: 'italic',
        marginTop: 20
    }
});
