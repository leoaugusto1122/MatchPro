import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
// import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { doc, getDoc, addDoc, collection, query, where, getDocs, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, firebaseConfig } from '@/services/firebase';
import { ButtonPrimary } from '@/components/ui/ButtonPrimary';
import { CheckCircle2, Trophy, ArrowLeft, Hash, Shield, User as UserIcon } from 'lucide-react-native';
import { Team } from '@/types/models';
import { Header } from '@/components/ui/Header';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function JoinTeamScreen({ route, navigation }: any) {
    // const route = useRoute<any>(); // Removed
    // const navigation = useNavigation<any>(); // Removed
    const { user, authUser } = useAuthStore();

    // Steps:
    // 'input-code': Initial state, search
    // 'summoning': Found team, show "You are summoned" + Quick Form
    // 'processing': Joining
    // 'success': Joined
    // 'error': Failed
    const [step, setStep] = useState<'input-code' | 'loading' | 'summoning' | 'processing' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Verificando convite...');
    const [teamData, setTeamData] = useState<Team | null>(null);
    const [code, setCode] = useState('');

    // Form Stats (Merged into Summoning Screen)
    const [nickname, setNickname] = useState('');
    const [position, setPosition] = useState<'GK' | 'DEF' | 'MID' | 'FWD'>('MID');
    const [dominantFoot, setDominantFoot] = useState<'Destro' | 'Canhoto' | 'Ambidestro'>('Destro');

    const { teamId, team, token, id } = route.params || {};

    useEffect(() => {
        // Web "Catch-all" fix for query params
        if (Platform.OS === 'web') {
            const searchParams = new URLSearchParams(window.location.search);
            const urlTeamId = searchParams.get('teamId') || searchParams.get('team');
            if (urlTeamId && !teamId && !team) {
                fetchTeamById(urlTeamId);
                return;
            }
        }

        const targetId = teamId || team || id;

        if (targetId) {
            fetchTeamById(targetId);
        } else {
            setStep('input-code');
        }
    }, [teamId, team, token, id]);

    useEffect(() => {
        if (step === 'summoning') {
            prefillForm();
        }
    }, [step]);

    const prefillForm = () => {
        if (user?.nickname) setNickname(user.nickname);
        else if (user?.displayName) setNickname(user.displayName.split(' ')[0]);
        else if (authUser?.displayName) setNickname(authUser.displayName.split(' ')[0]);
    };

    const fetchTeamById = async (id: string) => {
        setStep('loading');
        setMessage('Buscando time...');
        try {
            // Fetch from Source of Truth for direct ID access
            const teamRef = doc(db, 'teams', id);
            const teamSnap = await getDoc(teamRef);

            if (!teamSnap.exists()) {
                throw new Error('Time não encontrado.');
            }

            const data = teamSnap.data() as Team;
            setTeamData({ ...data, id: teamSnap.id });
            setStep('summoning');

        } catch (error: any) {
            console.error("Fetch Error:", error);
            setStep('error');
            setMessage(error.message || 'Erro ao carregar time.');
        }
    };

    const handleSearchByCode = async () => {
        if (!code.trim()) {
            Alert.alert('Código Inválido', 'Digite o código do time.');
            return;
        }

        setStep('loading');
        setMessage('Localizando time...');

        try {
            const appId = firebaseConfig.appId;
            if (!appId) throw new Error("Configuração de Apps incompleta");

            // 1. Simplified Search in Artifacts Public Data
            // "Regra de Ouro: Sem Índices Compostos" - Query only by code
            const publicTeamsRef = collection(db, 'artifacts', appId, 'public', 'data', 'teams');
            const q = query(publicTeamsRef, where("inviteCode", "==", code.trim().toUpperCase()));

            const snapshot = await getDocs(q);

            // 2. Client-side filtering
            const validDocs = snapshot.docs.filter(doc => {
                const data = doc.data();
                return data.status !== 'archived'; // Filter by status in JS
            });

            if (validDocs.length === 0) {
                setStep('input-code');
                Alert.alert('Não encontrado', 'Nenhum time ativado encontrado com este código.');
                return;
            }

            // Assume the first valid match is the correct one
            const docFound = validDocs[0];
            // We use the ID from the artifact to look up the real team or use the artifact data if sufficient.
            // Assuming Artifact ID mirrors Team ID.
            setTeamData({ id: docFound.id, ...docFound.data() } as Team);
            setStep('summoning');

        } catch (error: any) {
            console.error(error);
            setStep('input-code');
            Alert.alert('Erro', 'Falha ao buscar time: ' + error.message);
        }
    };

    const handleConfirmJoin = async () => {
        if (!authUser) {
            // Save pending invite logic
            try {
                await AsyncStorage.setItem('pendingInvite', JSON.stringify({ team: teamData?.id }));
            } catch (e) {
                console.error("Failed to save pending invite", e);
            }

            Alert.alert(
                'Login Necessário',
                'Faça login para aceitar a convocação.',
                [{
                    text: 'Ir para Login',
                    onPress: () => navigation.navigate('Login', { returnScreen: 'JoinTeam' })
                }]
            );
            return;
        }

        if (!nickname.trim()) {
            Alert.alert('Ops!', 'Confirme seu nome ou apelido de jogo.');
            return;
        }

        if (!teamData) return;

        setStep('processing');
        setMessage('Assinando contrato...');

        try {
            const teamId = teamData.id;

            // 1. Check for Duplicity in Team Members
            // Since we are moving to arrayUnion, we treat members as potentially an array or map.
            // We check the source of truth 'teams' collection.
            const teamRef = doc(db, 'teams', teamId);
            const teamSnap = await getDoc(teamRef);

            if (teamSnap.exists()) {
                const realData = teamSnap.data();
                const members = realData.members;

                let isMember = false;
                if (Array.isArray(members)) {
                    isMember = members.includes(authUser.uid);
                } else if (members && typeof members === 'object') {
                    isMember = !!members[authUser.uid];
                }

                if (isMember) {
                    // Already member, just sync context
                    finishJoin({ id: authUser.uid, name: nickname } as any); // Mock profile for existing
                    return;
                }
            }

            // 2. Create Player Profile (Subcollection)
            const playersRef = collection(db, 'teams', teamId, 'players');
            // Check if player profile already exists (idempotency)
            const qPlayer = query(playersRef, where('authId', '==', authUser.uid));
            const existingPlayer = await getDocs(qPlayer);

            let playerRefId = '';
            let finalPlayerData = null;

            if (!existingPlayer.empty) {
                const pDoc = existingPlayer.docs[0];
                playerRefId = pDoc.id;
                finalPlayerData = pDoc.data();
            } else {
                const newPlayer = {
                    name: user?.displayName || authUser.displayName || nickname,
                    nickname: nickname,
                    position: position,
                    dominantFoot: dominantFoot,
                    authId: authUser.uid,
                    role: 'player',
                    status: 'active',
                    goals: 0,
                    assists: 0,
                    matchesPlayed: 0,
                    createdAt: new Date(),
                    userId: user?.id || authUser.uid
                };
                const docRef = await addDoc(playersRef, newPlayer);
                playerRefId = docRef.id;
                finalPlayerData = newPlayer;
            }

            // 3. Update Team Members (Array Union for Query + Map for Role)
            await updateDoc(teamRef, {
                memberIds: arrayUnion(authUser.uid),
                [`members.${authUser.uid}`]: 'player'
            });

            finishJoin({ id: playerRefId, ...finalPlayerData });

        } catch (error: any) {
            console.error("Join Error:", error);
            setStep('error');
            setMessage('Erro ao realizar vínculo: ' + error.message);
        }
    };

    const finishJoin = (playerProfile: any) => {
        const { setTeamContext } = useTeamStore.getState();
        setTeamContext(
            teamData!.id,
            teamData!.name,
            'player',
            playerProfile
        );
        setStep('success');
        setMessage(`BEM-VINDO AO ELENCO!`);
        setTimeout(() => {
            navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }, 2000);
    };

    const renderInputCode = () => (
        <View className="flex-1 px-6 pt-12">
            <TouchableOpacity onPress={() => navigation.goBack()} className="mb-8">
                <ArrowLeft size={24} color="#94A3B8" />
            </TouchableOpacity>

            <Header title="ENTRAR NO TIME" subtitle="Localize seu time" />

            <View className="mt-8 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 items-center">
                <View className="w-16 h-16 bg-blue-50 rounded-full items-center justify-center mb-6">
                    <Hash size={32} color="#3B82F6" />
                </View>

                <Text className="text-slate-900 font-bold text-center text-lg mb-2">
                    Código do Time
                </Text>
                <Text className="text-slate-400 text-center text-sm mb-8 px-4">
                    Digite o código fornecido pelo seu capitão (ex: #GALO24).
                </Text>

                <TextInput
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-center text-2xl font-black text-slate-800 uppercase tracking-widest mb-6"
                    placeholder="CÓDIGO"
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="characters"
                    maxLength={10}
                />

                <ButtonPrimary
                    label="LOCALIZAR"
                    onPress={handleSearchByCode}
                />
            </View>
        </View>
    );

    const renderSummoning = () => (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
            <View className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100">
                {/* Header Section */}
                <View className="bg-[#006400] p-8 items-center relative overflow-hidden">
                    <View className="absolute top-0 left-0 w-full h-full opacity-10 bg-black" />
                    <Trophy size={48} color="white" className="mb-4" />
                    <Text className="text-white font-black italic text-2xl uppercase tracking-tighter text-center">
                        VOCÊ FOI CONVOCADO!
                    </Text>
                    <Text className="text-green-200 font-medium text-center mt-2">
                        O time <Text className="font-bold text-white uppercase">{teamData?.name}</Text> quer você no elenco.
                    </Text>
                </View>

                {/* Form / Confirmation Section */}
                <View className="p-8">
                    <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest text-center mb-6">
                        CONFIRME SEUS DADOS
                    </Text>

                    {/* Compact Form */}
                    <View className="mb-4">
                        <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                            <UserIcon size={20} color="#94A3B8" className="mr-3" />
                            <TextInput
                                className="flex-1 font-bold text-slate-800"
                                placeholder="Seu Apelido"
                                value={nickname}
                                onChangeText={setNickname}
                            />
                        </View>
                    </View>

                    <View className="mb-6">
                        <View className="flex-row gap-2">
                            {['GK', 'DEF', 'MID', 'FWD'].map((pos) => (
                                <TouchableOpacity
                                    key={pos}
                                    onPress={() => setPosition(pos as any)}
                                    className={`flex-1 py-3 rounded-xl border items-center justify-center ${position === pos ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200'}`}
                                >
                                    <Text className={`font-black italic text-[10px] ${position === pos ? 'text-white' : 'text-slate-400'}`}>
                                        {pos}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View className="mb-6">
                        <View className="flex-row gap-2">
                            {['Destro', 'Canhoto', 'Ambidestro'].map((foot) => (
                                <TouchableOpacity
                                    key={foot}
                                    onPress={() => setDominantFoot(foot as any)}
                                    className={`flex-1 py-3 rounded-xl border items-center justify-center ${dominantFoot === foot ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200'}`}
                                >
                                    <Text className={`font-black italic text-[10px] uppercase ${dominantFoot === foot ? 'text-white' : 'text-slate-400'}`}>
                                        {foot}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <ButtonPrimary
                        label="ACEITAR CONVOCAÇÃO"
                        onPress={handleConfirmJoin}
                    />

                    <TouchableOpacity onPress={() => setStep('input-code')} className="mt-6 self-center">
                        <Text className="text-slate-400 font-bold text-xs uppercase">Não é este time? Cancelar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-[#F8FAFC]"
        >
            {step === 'loading' || step === 'processing' ? (
                <View className="flex-1 items-center justify-center p-6">
                    <ActivityIndicator size="large" color="#006400" className="mb-6" />
                    <Text className="text-slate-400 font-bold italic uppercase tracking-widest text-xs animate-pulse">
                        {message}
                    </Text>
                </View>
            ) : step === 'success' ? (
                <View className="flex-1 items-center justify-center p-6 bg-[#006400]">
                    <CheckCircle2 size={80} color="white" className="mb-6" />
                    <Text className="text-3xl font-black italic text-white uppercase text-center mb-2">
                        {message}
                    </Text>
                    <Text className="text-green-200 font-medium text-center">
                        Você agora faz parte do {teamData?.name}
                    </Text>
                </View>
            ) : step === 'error' ? (
                <View className="flex-1 items-center justify-center p-6">
                    <Shield size={64} color="#EF4444" className="mb-6 opacity-50" />
                    <Text className="text-xl font-black italic text-slate-800 uppercase text-center mb-2">
                        ERRO
                    </Text>
                    <Text className="text-slate-500 text-center mb-8 px-8">
                        {message}
                    </Text>
                    <ButtonPrimary label="TENTAR NOVAMENTE" onPress={() => setStep('input-code')} />
                </View>
            ) : step === 'summoning' ? (
                renderSummoning()
            ) : (
                renderInputCode()
            )}
        </KeyboardAvoidingView>
    );
}
