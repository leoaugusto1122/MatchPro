import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/services/firebase';
import { useAuthStore } from '@/stores/authStore';
import { User } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { ButtonPrimary } from '@/components/ui/ButtonPrimary';

export default function ProfileSetupScreen() {
    const { authUser, setUserData } = useAuthStore();
    const [name, setName] = useState(authUser?.displayName || '');
    const [nickname, setNickname] = useState('');
    const [preferredFoot, setPreferredFoot] = useState('Destro');
    const role = 'owner'; // Default role, specific team roles handled later
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSaveProfile = async () => {
        if (!name.trim() || !nickname.trim()) {
            setError('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        if (!authUser) {
            setError('Usuário não autenticado.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Update Auth Profile
            if (authUser.displayName !== name) {
                await updateProfile(authUser, { displayName: name });
            }

            // Path requested: /artifacts/{appId}/users/{uid}/profile/data
            const appId = firebaseConfig.appId;
            if (!appId) throw new Error('App ID configuration is missing.');

            const profilePath = `artifacts/${appId}/users/${authUser.uid}/profile/data`;

            const userData = {
                id: authUser.uid,
                email: authUser.email || '',
                displayName: name,
                nickname: nickname,
                preferredFoot: preferredFoot,
                photoURL: authUser.photoURL || '',
                role: role,
                createdAt: new Date(),
            };

            // Write to Firestore (Primary)
            await setDoc(doc(db, profilePath), userData);

            // Legacy/Sync path support
            await setDoc(doc(db, 'users', authUser.uid), userData);

            // Update Store
            setUserData(userData as any);

        } catch (e: any) {
            console.error(e);
            setError('Erro ao salvar perfil. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-[#F8FAFC]"
        >
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
                <View className="mb-12">
                    <Header title="PERFIL" subtitle="Complete seu Cadastro" />
                    <Text className="text-slate-400 font-medium italic mt-2">
                        Para continuar, precisamos de algumas informações básicas.
                    </Text>
                </View>

                <View className="gap-6">
                    <View>
                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">NOME COMPLETO</Text>
                        <View className="flex-row items-center bg-white border border-slate-100 rounded-2xl px-5 py-2 shadow-sm">
                            <User size={18} color="#94A3B8" />
                            <TextInput
                                className="flex-1 ml-3 h-12 text-slate-900 font-bold"
                                value={name}
                                onChangeText={setName}
                                placeholder="Seu nome"
                                placeholderTextColor="#CBD5E1"
                            />
                        </View>
                    </View>

                    <View>
                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">APELIDO NO JOGO</Text>
                        <View className="flex-row items-center bg-white border border-slate-100 rounded-2xl px-5 py-2 shadow-sm">
                            <User size={18} color="#94A3B8" />
                            <TextInput
                                className="flex-1 ml-3 h-12 text-slate-900 font-bold"
                                value={nickname}
                                onChangeText={setNickname}
                                placeholder="Como você quer ser chamado"
                                placeholderTextColor="#CBD5E1"
                            />
                        </View>
                    </View>

                    <View>
                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">PÉ PREFERIDO</Text>
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setPreferredFoot('Destro')}
                                className={`flex-1 p-4 rounded-2xl border ${preferredFoot === 'Destro' ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-100'} items-center`}
                            >
                                <Text className={`font-black uppercase tracking-widest text-xs ${preferredFoot === 'Destro' ? 'text-white' : 'text-slate-400'}`}>DESTRO</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setPreferredFoot('Canhoto')}
                                className={`flex-1 p-4 rounded-2xl border ${preferredFoot === 'Canhoto' ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-100'} items-center`}
                            >
                                <Text className={`font-black uppercase tracking-widest text-xs ${preferredFoot === 'Canhoto' ? 'text-white' : 'text-slate-400'}`}>CANHOTO</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {error ? (
                        <View className="bg-red-50 p-4 rounded-xl border border-red-100">
                            <Text className="text-red-600 text-xs font-bold text-center">{error}</Text>
                        </View>
                    ) : null}

                    <ButtonPrimary
                        label={loading ? "SALVANDO..." : "CONTINUAR"}
                        onPress={handleSaveProfile}
                        disabled={loading}
                    />
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
