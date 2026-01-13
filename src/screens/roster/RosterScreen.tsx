import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, FAB, List, Avatar, ActivityIndicator, useTheme } from 'react-native-paper';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Player } from '@/types/models';

export default function RosterScreen({ navigation }: any) {
    const theme = useTheme();
    const teamId = useTeamStore(state => state.teamId);
    const { canManageRoster } = usePermissions();

    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!teamId) return;

        const q = query(collection(db, 'teams', teamId, 'players'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Player[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() } as Player);
            });
            setPlayers(list);
            setLoading(false);
        }, (error) => {
            console.error(error);
            setLoading(false);
        });

        return () => unsubscribe();
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
        <List.Item
            title={item.name}
            description={item.status === 'active' ? 'Ativo' : 'Reserva'}
            left={props => (
                <Avatar.Text
                    {...props}
                    size={40}
                    label={item.name.substring(0, 2).toUpperCase()}
                    style={{ backgroundColor: item.status === 'active' ? theme.colors.primary : theme.colors.surfaceVariant }}
                />
            )}
            right={props => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ marginRight: 10, fontWeight: 'bold' }}>{getPositionAbbr(item.position)}</Text>
                    <List.Icon {...props} icon="chevron-right" />
                </View>
            )}
            onPress={() => {
                navigation.navigate('PlayerDetails', { playerId: item.id, mode: canManageRoster ? 'edit' : 'view' });
            }}
        />
    );

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={players}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text>Nenhum jogador cadastrado.</Text>
                    </View>
                }
            />

            {canManageRoster && (
                <FAB
                    icon="plus"
                    style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                    onPress={handleAddPlayer}
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
