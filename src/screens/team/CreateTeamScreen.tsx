import React, { useState } from 'react';
import { View, Alert, TouchableOpacity, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { db, firebaseConfig } from '@/services/firebase';
import { collection, addDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { useTeamStore } from '@/stores/teamStore';
import { Player, Team } from '@/types/models';
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { ButtonPrimary } from '@/components/ui/ButtonPrimary';

export default function CreateTeamScreen({ navigation }: any) {
    const { user } = useAuthStore();
    const setTeamContext = useTeamStore(state => state.setTeamContext);

    const [teamName, setTeamName] = useState('');
    const [billingMode, setBillingMode] = useState<'PER_GAME' | 'MONTHLY' | 'MONTHLY_PLUS_GAME'>('PER_GAME');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<'form' | 'success'>('form');



    const handleCreateTeam = async () => {
        if (!teamName.trim() || !user) {
            Alert.alert('Nome inválido', 'Digite o nome do seu time.');
            return;
        }
        setLoading(true);

        try {
            // Generate Short Code (6 chars)
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();

            // 1. Generate Doc Ref first to get ID
            const newTeamRef = doc(collection(db, 'teams'));
            const inviteLink = `https://matchpro.app/convite/${newTeamRef.id}`;

            await setDoc(newTeamRef, {
                name: teamName.trim(),
                ownerId: user.id,
                createdAt: new Date(),
                code: code,
                inviteLink: inviteLink,
                status: 'active',
                members: { [user.id]: 'owner' },
                memberIds: [user.id],
                billingMode: billingMode,
                perGameAmount: 0,
                primaryColor: '#006400',
                id: newTeamRef.id,
                // shieldURL will be updated after if exists
            } as Team);

            // Sync to Public Artifact (For Search)
            const appId = firebaseConfig.appId;
            if (appId) {
                const publicPath = `artifacts/${appId}/public/data/teams/${newTeamRef.id}`;
                await setDoc(doc(db, publicPath), {
                    id: newTeamRef.id,
                    name: teamName.trim(),
                    inviteCode: code, // Changed to inviteCode
                    status: 'active',
                    inviteLink: inviteLink,
                    createdAt: new Date(),
                    ownerId: user.id
                }, { merge: true });
            }



            // 2. Create Owner Player Profile
            const playerProfileData = {
                name: user.displayName || 'Owner',
                nickname: user.nickname || 'Capitão',
                userId: user.id,
                authId: user.id,
                position: 'MID', // Default
                status: 'active',
                role: 'owner',
                goals: 0,
                assists: 0,
                matchesPlayed: 0,
                photoURL: user.photoURL || null,
                createdAt: new Date()
            };

            const newPlayerRef = await addDoc(collection(db, 'teams', newTeamRef.id, 'players'), playerProfileData);
            const playerProfile = { id: newPlayerRef.id, ...playerProfileData } as Player;

            // 3. Update User Context
            await updateDoc(doc(db, 'users', user.id), {
                lastActiveTeamId: newTeamRef.id
            });

            // 4. Set Global State
            setTeamContext(newTeamRef.id, teamName.trim(), 'owner', playerProfile);

            setStep('success');

            // Auto-navigate after delay handled by AppNavigator listener usually, 
            // but we can force it just in case logic differs.
            setTimeout(() => {
                // Determine where to go - likely MainTab is handled by AppNavigator listening to teamId changes
            }, 1500);

        } catch (e: any) {
            console.error(e);
            Alert.alert('Erro', 'Não foi possível criar o time.');
            setLoading(false);
        }
    };

    if (step === 'success') {
        return (
            <View className="flex-1 items-center justify-center p-6 bg-[#006400]">
                <CheckCircle2 size={80} color="white" className="mb-6" />
                <Text className="text-3xl font-black italic text-white uppercase text-center mb-2">
                    TIME CRIADO!
                </Text>
                <Text className="text-green-200 font-medium text-center">
                    O {teamName} já está pronto para a temporada.
                </Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#F8FAFC]">
            <View className="pt-12 px-6">
                <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center mb-6">
                    <ArrowLeft size={20} color="#94A3B8" />
                    <Text className="ml-2 font-black italic text-slate-400 uppercase tracking-widest text-[10px]">Voltar</Text>
                </TouchableOpacity>
                <Header title="NOVO CLUBE" subtitle="Fundar seu time" />
            </View>

            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">

                    <View className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 items-center">

                        <Text className="text-slate-900 font-bold text-center text-lg mb-6">
                            Nome do Clube
                        </Text>

                        {/* Team Name */}
                        <View className="w-full mb-8">
                            <TextInput
                                className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-black text-xl text-center"
                                placeholder="Ex: Galáticos FC"
                                placeholderTextColor="#CBD5E1"
                                value={teamName}
                                onChangeText={setTeamName}
                                autoCapitalize="words"
                            />
                        </View>

                        {/* Billing Mode Selection */}
                        <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-3">
                            Modelo Financeiro
                        </Text>
                        <View className="w-full mb-8 flex-row gap-2">
                            {[
                                { id: 'PER_GAME', label: 'POR JOGO', icon: 'TICKET' },
                                { id: 'MONTHLY', label: 'MENSAL', icon: 'CALENDAR' },
                                { id: 'MONTHLY_PLUS_GAME', label: 'HÍBRIDO', icon: 'MIX' },
                            ].map((mode: any) => (
                                <TouchableOpacity
                                    key={mode.id}
                                    onPress={() => setBillingMode(mode.id)}
                                    className={`flex-1 p-3 rounded-xl border items-center justify-center ${billingMode === mode.id ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                                >
                                    <Text className={`font-black text-[10px] italic ${billingMode === mode.id ? 'text-white' : 'text-slate-400'}`}>
                                        {mode.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>


                        <ButtonPrimary
                            label={loading ? "FUNDANDO CLUBE..." : "CRIAR TIME ELITE"}
                            onPress={handleCreateTeam}
                            disabled={loading}
                        />
                    </View>
                </KeyboardAvoidingView>
            </ScrollView>
        </View>
    );
}
