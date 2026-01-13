import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Title, Button, Paragraph, TextInput } from 'react-native-paper';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit } from 'firebase/firestore';
import { useTeamStore } from '@/stores/teamStore';
import { Player } from '@/types/models';

export default function TeamSetupScreen() {
    const { user } = useAuth();
    const setTeamContext = useTeamStore(state => state.setTeamContext);

    const [mode, setMode] = useState<'create' | 'join'>('create');
    const [teamName, setTeamName] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreateTeam = async () => {
        if (!teamName || !user) return;
        setLoading(true);

        try {
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();

            // 1. Create Team Doc
            const newTeamRef = await addDoc(collection(db, 'teams'), {
                name: teamName,
                ownerId: user.id,
                createdAt: new Date(),
                code: code,
                members: { [user.id]: 'owner' } // Security Rules critical
            });

            // 2. Create Owner Player Profile
            const playerProfileData = {
                name: user.displayName || 'Owner',
                userId: user.id,
                position: 'MID',
                status: 'active',
                goals: 0,
                assists: 0,
                matchesPlayed: 0,
                photoURL: user.photoURL || null
            };
            const newPlayerRef = await addDoc(collection(db, 'teams', newTeamRef.id, 'players'), playerProfileData);
            const playerProfile = { id: newPlayerRef.id, ...playerProfileData } as Player;

            // 3. Update User Doc
            await updateDoc(doc(db, 'users', user.id), {
                lastActiveTeamId: newTeamRef.id // UX preference
            });

            // 4. Update Store (State Migration)
            setTeamContext(newTeamRef.id, teamName, 'owner', playerProfile);

        } catch (e: any) {
            console.error(e);
            Alert.alert('Erro', 'Não foi possível criar o time.');
        } finally {
            setLoading(false);
        }
    };

    const handleJoinTeam = async () => {
        if (!inviteCode || !user) return;
        setLoading(true);

        try {
            const q = query(
                collection(db, 'teams'),
                where('code', '==', inviteCode.trim().toUpperCase()),
                limit(1)
            );
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                Alert.alert('Time não encontrado', 'Verifique o código.');
                setLoading(false);
                return;
            }

            const teamDoc = querySnapshot.docs[0];
            const teamData = teamDoc.data();
            const teamId = teamDoc.id;

            // Check if player profile exists
            let playerProfile: Player | null = null;
            const pQuery = query(collection(db, 'teams', teamId, 'players'), where('userId', '==', user.id), limit(1));
            const pSnap = await getDocs(pQuery);

            if (pSnap.empty) {
                const newProfile = {
                    name: user.displayName || 'Novo Jogador',
                    userId: user.id,
                    position: 'MID',
                    status: 'active',
                    goals: 0,
                    assists: 0,
                    matchesPlayed: 0,
                    photoURL: user.photoURL || null
                };
                const ref = await addDoc(collection(db, 'teams', teamId, 'players'), newProfile);
                playerProfile = { id: ref.id, ...newProfile } as any;
            } else {
                playerProfile = { id: pSnap.docs[0].id, ...pSnap.docs[0].data() } as Player;
            }

            // Update Team Members map
            await updateDoc(doc(db, 'teams', teamId), {
                [`members.${user.id}`]: 'player'
            });

            // Update User Doc
            await updateDoc(doc(db, 'users', user.id), {
                lastActiveTeamId: teamId
            });

            // Update Store
            setTeamContext(teamId, teamData.name, 'player', playerProfile);

        } catch (e: any) {
            console.error(e);
            Alert.alert('Erro', 'Não foi possível entrar no time.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Title style={styles.title}>Bem-vindo ao MatchPro!</Title>
            <Paragraph style={styles.subtitle}>
                Para começar, você precisa fazer parte de um time.
            </Paragraph>

            <View style={styles.toggleContainer}>
                <Button
                    mode={mode === 'create' ? 'contained' : 'outlined'}
                    onPress={() => setMode('create')}
                    style={styles.toggleBtn}
                >
                    Criar Time
                </Button>
                <Button
                    mode={mode === 'join' ? 'contained' : 'outlined'}
                    onPress={() => setMode('join')}
                    style={styles.toggleBtn}
                >
                    Entrar num Time
                </Button>
            </View>

            {mode === 'create' ? (
                <View style={styles.form}>
                    <TextInput
                        label="Nome do Seu Time"
                        value={teamName}
                        onChangeText={setTeamName}
                        mode="outlined"
                    />
                    <Button
                        mode="contained"
                        onPress={handleCreateTeam}
                        loading={loading}
                        disabled={loading}
                        style={styles.actionBtn}
                    >
                        Criar Time
                    </Button>
                </View>
            ) : (
                <View style={styles.form}>
                    <TextInput
                        label="Código do Time (Convite)"
                        value={inviteCode}
                        onChangeText={setInviteCode}
                        mode="outlined"
                        placeholder="Ex: A1B2C3"
                        autoCapitalize="characters"
                    />
                    <Button
                        mode="contained"
                        onPress={handleJoinTeam}
                        loading={loading}
                        disabled={loading}
                        style={styles.actionBtn}
                    >
                        Entrar no Time
                    </Button>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    title: {
        textAlign: 'center',
        fontSize: 24,
        fontWeight: 'bold',
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: 30,
        color: '#666',
    },
    toggleContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 20,
        gap: 10,
    },
    toggleBtn: {
        flex: 1,
    },
    form: {
        gap: 15,
    },
    actionBtn: {
        marginTop: 10,
        paddingVertical: 5,
    },
});
