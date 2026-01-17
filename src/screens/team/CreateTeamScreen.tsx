import React, { useState } from 'react';
import { View, Alert, TouchableOpacity, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { db, storage, firebaseConfig } from '@/services/firebase';
import { collection, addDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { useTeamStore } from '@/stores/teamStore';
import { Player, Team } from '@/types/models';
import { ArrowLeft, CheckCircle2, Shield, Camera } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { ButtonPrimary } from '@/components/ui/ButtonPrimary';

const TEAM_COLORS = [
    { name: 'Verde', value: '#006400' },
    { name: 'Azul', value: '#1E40AF' },
    { name: 'Vermelho', value: '#B91C1C' },
    { name: 'Preto', value: '#111827' },
    { name: 'Roxo', value: '#6B21A8' },
];

export default function CreateTeamScreen({ navigation }: any) {
    const { user } = useAuthStore();
    const setTeamContext = useTeamStore(state => state.setTeamContext);

    const [teamName, setTeamName] = useState('');
    const [selectedColor, setSelectedColor] = useState(TEAM_COLORS[0].value);
    const [shieldUri, setShieldUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<'form' | 'success'>('form');

    const handlePickShield = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            setShieldUri(result.assets[0].uri);
        }
    };

    const uploadShield = async (uri: string, teamId: string): Promise<string | null> => {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const filename = `shields/${teamId}_${Date.now()}.jpg`;
            const storageRef = ref(storage, filename);
            await uploadBytes(storageRef, blob);
            return await getDownloadURL(storageRef);
        } catch (error) {
            console.error("Upload failed", error);
            return null;
        }
    };

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
                billingMode: 'PER_GAME',
                perGameAmount: 0,
                primaryColor: selectedColor,
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

            let uploadedShieldUrl = null;
            if (shieldUri) {
                uploadedShieldUrl = await uploadShield(shieldUri, newTeamRef.id);
                if (uploadedShieldUrl) {
                    await updateDoc(newTeamRef, { badgeURL: uploadedShieldUrl });
                }
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

                        {/* Shield Upload */}
                        <TouchableOpacity onPress={handlePickShield} className="items-center mb-8 relative">
                            <View className="w-24 h-24 bg-slate-50 rounded-full items-center justify-center shadow-inner border border-slate-200 overflow-hidden">
                                {shieldUri ? (
                                    <Image source={{ uri: shieldUri }} className="w-full h-full" resizeMode="cover" />
                                ) : (
                                    <Shield size={40} color={selectedColor} />
                                )}
                            </View>
                            <View className="absolute bottom-0 right-0 bg-slate-900 w-8 h-8 rounded-full items-center justify-center border-2 border-white">
                                <Camera size={14} color="white" />
                            </View>
                        </TouchableOpacity>

                        <Text className="text-slate-900 font-bold text-center text-lg mb-2">
                            Defina a identidade
                        </Text>

                        {/* Team Name */}
                        <View className="w-full mb-6">
                            <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">NOME DO CLUBE</Text>
                            <TextInput
                                className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-black text-xl"
                                placeholder="Ex: Galáticos FC"
                                placeholderTextColor="#CBD5E1"
                                value={teamName}
                                onChangeText={setTeamName}
                                autoCapitalize="words"
                            />
                        </View>

                        {/* Colors */}
                        <View className="w-full mb-8">
                            <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 ml-1">COR PRINCIPAL</Text>
                            <View className="flex-row justify-between">
                                {TEAM_COLORS.map((c) => (
                                    <TouchableOpacity
                                        key={c.value}
                                        onPress={() => setSelectedColor(c.value)}
                                        className={`w-10 h-10 rounded-full border-2 items-center justify-center ${selectedColor === c.value ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                                    >
                                        <View className="w-8 h-8 rounded-full" style={{ backgroundColor: c.value }} />
                                    </TouchableOpacity>
                                ))}
                            </View>
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
