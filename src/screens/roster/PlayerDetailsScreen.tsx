import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, ActivityIndicator, Card, Divider } from 'react-native-paper'; // Updated import
import { useTeamStore } from '@/stores/teamStore'; // CHANGE
import { usePermissions } from '@/hooks/usePermissions'; // CHANGE
import { db } from '@/services/firebase';
import { doc, getDoc, addDoc, collection, updateDoc } from 'firebase/firestore';
import { Player } from '@/types/models';

export default function PlayerDetailsScreen({ route, navigation }: any) {
    const teamId = useTeamStore(state => state.teamId); // CHANGE
    const { canManageRoster } = usePermissions(); // CHANGE

    const { playerId, mode = 'view' } = route.params || {};

    const isEditing = mode === 'edit' || mode === 'create';
    const canEdit = canManageRoster; // CHANGE

    const [name, setName] = useState('');
    const [position, setPosition] = useState('MID');
    const [status, setStatus] = useState('active');
    const [financialSummary, setFinancialSummary] = useState<{ totalPaid: number, totalPending: number } | null>(null); // Added state
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(!!playerId);

    useEffect(() => {
        if (playerId && teamId) {
            const fetchPlayer = async () => {
                try {
                    const docRef = doc(db, 'teams', teamId, 'players', playerId);
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        const data = snap.data() as Player;
                        setName(data.name);
                        setPosition(data.position || 'MID');
                        setStatus(data.status || 'active');
                        if (data.financialSummary) setFinancialSummary(data.financialSummary);
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    setInitialLoading(false);
                }
            };
            fetchPlayer();
        }
    }, [playerId, teamId]);

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Erro', 'Nome é obrigatório');
            return;
        }
        if (!teamId) return;

        setLoading(true);
        try {
            const playerData = {
                name,
                position,
                status,
                ...(mode === 'create' ? { goals: 0, assists: 0, matchesPlayed: 0 } : {})
            };

            if (mode === 'create') {
                await addDoc(collection(db, 'teams', teamId, 'players'), playerData);
            } else {
                await updateDoc(doc(db, 'teams', teamId, 'players', playerId), playerData);
            }

            navigation.goBack();
        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Falha ao salvar');
        } finally {
            setLoading(false);
        }
    };


    if (initialLoading) {
        return <ActivityIndicator style={styles.center} />;
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text variant="headlineSmall" style={styles.header}>
                {mode === 'create' ? 'Novo Jogador' : isEditing ? 'Editar Jogador' : 'Detalhes'}
            </Text>

            <TextInput
                label="Nome"
                value={name}
                onChangeText={setName}
                mode="outlined"
                disabled={!isEditing}
                style={styles.input}
            />

            <Text style={styles.label}>Posição</Text>
            <View pointerEvents={!isEditing ? "none" : "auto"} style={{ opacity: !isEditing ? 0.6 : 1 }}>
                <SegmentedButtons
                    value={position}
                    onValueChange={setPosition}
                    buttons={[
                        { value: 'GK', label: 'GOL' },
                        { value: 'DEF', label: 'DEF' },
                        { value: 'MID', label: 'MEI' },
                        { value: 'FWD', label: 'ATA' },
                    ]}
                    style={styles.input}
                />
            </View>

            <Text style={styles.label}>Status</Text>
            <View pointerEvents={!isEditing ? "none" : "auto"} style={{ opacity: !isEditing ? 0.6 : 1 }}>
                <SegmentedButtons
                    value={status}
                    onValueChange={setStatus}
                    buttons={[
                        { value: 'active', label: 'Ativo' },
                        { value: 'reserve', label: 'Reserva' },
                    ]}
                    style={styles.input}
                />
            </View>

            {(canEdit && isEditing) && (
                <Button
                    mode="contained"
                    onPress={handleSave}
                    loading={loading}
                    style={styles.button}
                >
                    Salvar
                </Button>
            )}

            {/* Financial Summary - Read Only */}
            {financialSummary && (canEdit || !isEditing) && (
                <View style={{ marginTop: 20 }}>
                    <Text variant="titleMedium" style={{ marginBottom: 10 }}>Resumo Financeiro</Text>
                    <Card style={{ backgroundColor: '#f9f9f9' }}>
                        <Card.Content>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                                <Text>Total Pago:</Text>
                                <Text style={{ color: 'green', fontWeight: 'bold' }}>R$ {financialSummary.totalPaid.toFixed(2)}</Text>
                            </View>
                            <Divider />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                                <Text>Total Pendente:</Text>
                                <Text style={{ color: 'red', fontWeight: 'bold' }}>R$ {financialSummary.totalPending.toFixed(2)}</Text>
                            </View>
                        </Card.Content>
                    </Card>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        backgroundColor: '#fff',
        flexGrow: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 20,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    input: {
        marginBottom: 20,
    },
    label: {
        marginBottom: 8,
        fontWeight: 'bold',
        color: '#666',
    },
    button: {
        marginTop: 10,
    }
});
