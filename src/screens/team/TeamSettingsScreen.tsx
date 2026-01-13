import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Appbar, TextInput, Button, RadioButton, Text, HelperText, Card, Chip } from 'react-native-paper';
import { useTeamStore } from '@/stores/teamStore';
import { useNavigation } from '@react-navigation/native';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { Team } from '@/types/models';

export default function TeamSettingsScreen() {
    const navigation = useNavigation();
    const { teamId, currentRole } = useTeamStore();

    // Local Team Data
    const [team, setTeam] = useState<Team | null>(null);

    // Form State
    const [billingMode, setBillingMode] = useState<'PER_GAME' | 'MONTHLY' | 'MONTHLY_PLUS_GAME'>('PER_GAME');
    const [perGameAmount, setPerGameAmount] = useState('');
    const [monthlyAmount, setMonthlyAmount] = useState('');
    const [billingDay, setBillingDay] = useState('');
    const [loading, setLoading] = useState(false);
    const [monthlyGenerated, setMonthlyGenerated] = useState(false);

    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const currentMonthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    useEffect(() => {
        const fetchTeam = async () => {
            if (!teamId) return;
            try {
                const teamDoc = await getDoc(doc(db, 'teams', teamId));
                if (teamDoc.exists()) {
                    const data = teamDoc.data() as Team;
                    setTeam({ ...data, id: teamDoc.id });

                    if (data.billingMode) setBillingMode(data.billingMode);
                    if (data.perGameAmount) setPerGameAmount(data.perGameAmount.toString());
                    if (data.monthlyAmount) setMonthlyAmount(data.monthlyAmount.toString());
                    if (data.billingDay) setBillingDay(data.billingDay.toString());
                }
            } catch (e) {
                console.error("Error fetching team settings", e);
            }
        };
        fetchTeam();

        const checkMonthlyStatus = async () => {
            if (!teamId) return;
            const q = query(
                collection(db, 'teams', teamId, 'monthlyPayments'),
                where('month', '==', currentMonth),
                limit(1)
            );
            const snap = await getDocs(q);
            setMonthlyGenerated(!snap.empty);
        };
        checkMonthlyStatus();

    }, [teamId]);

    const handleSave = async () => {
        if (!team) return;

        // Ensure only owner can save
        if (currentRole !== 'owner') {
            Alert.alert('Permissão Negada', 'Apenas o dono do time pode alterar configurações financeiras.');
            return;
        }

        if (billingMode !== team.billingMode) {
            Alert.alert(
                'Mudança de Modo de Cobrança',
                'Alterar o modo de cobrança não afetará pagamentos já gerados. Deseja continuar?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Confirmar', onPress: saveToFirestore }
                ]
            );
        } else {
            saveToFirestore();
        }
    };

    const saveToFirestore = async () => {
        if (!team) return;
        setLoading(true);
        try {
            const updates: Partial<Team> = {
                billingMode,
                perGameAmount: perGameAmount ? parseFloat(perGameAmount) : 0,
                monthlyAmount: monthlyAmount ? parseFloat(monthlyAmount) : 0,
                billingDay: billingDay ? parseInt(billingDay) : 5,
            };

            await updateDoc(doc(db, 'teams', team.id), updates);
            Alert.alert('Sucesso', 'Configurações atualizadas!');
            navigation.goBack();
        } catch (error) {
            console.error(error);
            Alert.alert('Erro', 'Falha ao salvar configurações.');
        } finally {
            setLoading(false);
        }
    };

    if (currentRole !== 'owner') {
        return (
            <View style={styles.container}>
                <Appbar.Header>
                    <Appbar.BackAction onPress={() => navigation.goBack()} />
                    <Appbar.Content title="Configurações" />
                </Appbar.Header>
                <View style={styles.content}>
                    <Text>Apenas o dono do time pode acessar esta tela.</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Appbar.Header>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content title="Financeiro do Time" />
            </Appbar.Header>

            <ScrollView contentContainerStyle={styles.content}>

                <Card style={styles.card}>
                    <Card.Title title="Modo de Cobrança" subtitle="Como seu time arrecada dinheiro?" />
                    <Card.Content>
                        <RadioButton.Group onValueChange={value => setBillingMode(value as any)} value={billingMode}>
                            <View style={styles.radioRow}>
                                <RadioButton value="PER_GAME" />
                                <Text style={styles.radioLabel}>Por Jogo</Text>
                            </View>
                            <HelperText type="info">Jogadores pagam apenas quando jogam.</HelperText>

                            <View style={styles.radioRow}>
                                <RadioButton value="MONTHLY" />
                                <Text style={styles.radioLabel}>Mensalidade Fixa</Text>
                            </View>
                            <HelperText type="info">Valor fixo todo mês, jogando ou não.</HelperText>

                            <View style={styles.radioRow}>
                                <RadioButton value="MONTHLY_PLUS_GAME" />
                                <Text style={styles.radioLabel}>Híbrido (Mensal + Jogo)</Text>
                            </View>
                            <HelperText type="info">Uma mensalidade base + taxa por partida jogada.</HelperText>
                        </RadioButton.Group>
                    </Card.Content>
                </Card>

                <Card style={styles.card}>
                    <Card.Title title="Valores" />
                    <Card.Content style={styles.inputContainer}>
                        {(billingMode === 'PER_GAME' || billingMode === 'MONTHLY_PLUS_GAME') && (
                            <TextInput
                                label="Valor por Jogo (R$)"
                                value={perGameAmount}
                                onChangeText={setPerGameAmount}
                                keyboardType="numeric"
                                mode="outlined"
                                left={<TextInput.Affix text="R$" />}
                            />
                        )}

                        {(billingMode === 'MONTHLY' || billingMode === 'MONTHLY_PLUS_GAME') && (
                            <>
                                <TextInput
                                    label="Valor da Mensalidade (R$)"
                                    value={monthlyAmount}
                                    onChangeText={setMonthlyAmount}
                                    keyboardType="numeric"
                                    mode="outlined"
                                    left={<TextInput.Affix text="R$" />}
                                />
                                <TextInput
                                    label="Dia de Vencimento"
                                    value={billingDay}
                                    onChangeText={setBillingDay}
                                    keyboardType="numeric"
                                    mode="outlined"
                                    placeholder="Ex: 5"
                                />
                            </>
                        )}
                    </Card.Content>
                </Card>

                <Button
                    mode="contained"
                    onPress={handleSave}
                    loading={loading}
                    style={styles.saveBtn}
                >
                    Salvar Configurações
                </Button>

                {(billingMode === 'MONTHLY' || billingMode === 'MONTHLY_PLUS_GAME') && (
                    <View style={{ marginTop: 20 }}>
                        <Text variant="titleMedium" style={{ marginBottom: 5 }}>Cobranças Mensais</Text>
                        <Text variant="bodyMedium">Mês Atual: <Text style={{ fontWeight: 'bold' }}>{currentMonthLabel}</Text></Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 5 }}>
                            <Text>Status: </Text>
                            {monthlyGenerated ? (
                                <Chip icon="check" mode="outlined" textStyle={{ color: 'green' }} style={{ borderColor: 'green' }}>Geradas</Chip>
                            ) : (
                                <Chip icon="clock" mode="outlined" textStyle={{ color: 'orange' }} style={{ borderColor: 'orange' }}>Pendentes</Chip>
                            )}
                        </View>

                        <Button
                            mode="outlined"
                            onPress={async () => {
                                if (!team) return;
                                try {
                                    setLoading(true);
                                    // Dynamic import if needed or use imported service
                                    const { BillingService } = require('@/services/billingService');
                                    await BillingService.generateMonthlyPayments(team.id, currentMonth);
                                    Alert.alert('Sucesso', 'Cobranças mensais geradas para jogadores ativos.');
                                    setMonthlyGenerated(true);
                                } catch (e) {
                                    console.error(e);
                                    Alert.alert('Erro', 'Falha ao gerar cobranças.');
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            style={{ borderColor: monthlyGenerated ? '#ccc' : '#2196F3' }}
                            textColor={monthlyGenerated ? '#ccc' : '#2196F3'}
                            disabled={loading || monthlyGenerated}
                        >
                            {monthlyGenerated ? "Mensalidades já geradas" : "Gerar mensalidades do mês atual"}
                        </Button>
                        <HelperText type="info">
                            As mensalidades são geradas apenas uma vez por mês. Este processo não duplica cobranças.
                        </HelperText>
                    </View>
                )}

                <Text style={styles.note}>
                    * Alterações no modo de cobrança não afetam pagamentos passados.
                </Text>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        padding: 16,
        paddingBottom: 40,
    },
    card: {
        marginBottom: 16,
    },
    radioRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    radioLabel: {
        fontSize: 16,
    },
    inputContainer: {
        gap: 12,
    },
    saveBtn: {
        marginTop: 8,
        paddingVertical: 6,
    },
    note: {
        marginTop: 16,
        textAlign: 'center',
        color: '#888',
        fontSize: 12,
    },
});
