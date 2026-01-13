import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, FAB, Card, Chip, SegmentedButtons, ActivityIndicator, useTheme } from 'react-native-paper';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Match } from '@/types/models';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function MatchesScreen({ navigation }: any) {
    const theme = useTheme();
    const teamId = useTeamStore(state => state.teamId);
    const { canManageMatches } = usePermissions();

    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('upcoming'); // upcoming | past

    useEffect(() => {
        if (!teamId) return;

        setLoading(true);
        const q = query(collection(db, 'teams', teamId, 'matches'), orderBy('date', viewMode === 'upcoming' ? 'asc' : 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Match[] = [];
            const now = new Date();

            snapshot.forEach((doc) => {
                const data = doc.data();
                const matchDate = data.date?.toDate ? data.date.toDate() : new Date(data.date);

                if (viewMode === 'upcoming') {
                    if (matchDate >= now) {
                        list.push({ id: doc.id, ...data, date: matchDate } as Match);
                    }
                } else {
                    if (matchDate < now) {
                        list.push({ id: doc.id, ...data, date: matchDate } as Match);
                    }
                }
            });
            setMatches(list);
            setLoading(false);
        }, (error) => {
            console.error(error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [teamId, viewMode]);

    const handleAddMatch = () => {
        navigation.navigate('MatchDetails', { mode: 'create' });
    };

    const renderItem = ({ item }: { item: Match }) => (
        <Card
            style={styles.card}
            onPress={() => navigation.navigate('MatchDetails', { matchId: item.id, mode: 'view' })}
        >
            <Card.Content>
                <View style={styles.cardHeader}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>vs {item.opponent || 'Adversário'}</Text>
                    <Chip compact mode="outlined">{item.status === 'finished' ? 'Finalizada' : 'Agendada'}</Chip>
                </View>

                <Text variant="bodyMedium" style={{ marginTop: 5 }}>
                    {format(item.date, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </Text>

                <Text variant="bodySmall" style={{ color: '#666' }}>
                    {item.location || 'Local a definir'}
                </Text>

                {item.status === 'finished' && (
                    <View style={styles.scoreContainer}>
                        <Text variant="headlineMedium" style={{ color: theme.colors.primary }}>{item.scoreHome}</Text>
                        <Text variant="titleLarge"> x </Text>
                        <Text variant="headlineMedium" style={{ color: theme.colors.error }}>{item.scoreAway}</Text>
                    </View>
                )}
            </Card.Content>
        </Card>
    );

    return (
        <View style={styles.container}>
            <View style={styles.filterContainer}>
                <SegmentedButtons
                    value={viewMode}
                    onValueChange={setViewMode}
                    buttons={[
                        { value: 'upcoming', label: 'Próximas' },
                        { value: 'past', label: 'Resultados' },
                    ]}
                />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" />
                </View>
            ) : (
                <FlatList
                    data={matches}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text>Nenhuma partida encontrada.</Text>
                        </View>
                    }
                />
            )}

            {canManageMatches && (
                <FAB
                    icon="plus"
                    style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                    onPress={handleAddMatch}
                    color="white"
                />
            )}
        </View>
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
    list: {
        padding: 16,
        paddingBottom: 80,
    },
    card: {
        marginBottom: 12,
        backgroundColor: 'white',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    scoreContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        backgroundColor: '#f0f0f0',
        padding: 5,
        borderRadius: 8,
    },
    filterContainer: {
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    empty: {
        padding: 20,
        alignItems: 'center',
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});
