import React, { useState } from 'react';
import { View, TouchableOpacity, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { User, Mail, Lock, ChevronLeft, Eye, EyeOff } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { ButtonPrimary } from '@/components/ui/ButtonPrimary';

export default function RegisterScreen({ navigation }: any) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [secureTextEntry, setSecureTextEntry] = useState(true);

    const handleRegister = async () => {
        if (!name || !email || !password) {
            setError('Preencha todos os campos.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await updateProfile(user, { displayName: name });

            await setDoc(doc(db, 'users', user.uid), {
                email: user.email,
                displayName: name,
                role: 'owner',
                createdAt: new Date(),
            });
        } catch (e: any) {
            setError(e.message);
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-[#F8FAFC]"
        >
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingVertical: 60 }}>
                <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center mb-8">
                    <ChevronLeft size={20} color="#94A3B8" />
                    <Text className="ml-2 font-black italic text-slate-400 uppercase tracking-widest text-[10px]">Voltar para login</Text>
                </TouchableOpacity>

                <View className="mb-12">
                    <Header title="CADASTRO" subtitle="Comece sua Jornada Elite" />
                    <Text className="text-slate-400 font-medium italic mt-2">Crie sua conta gratuita em segundos e revolucione a gestão do seu time.</Text>
                </View>

                <View className="gap-6">
                    {/* Name Input */}
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

                    {/* Email Input */}
                    <View>
                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">EMAIL PROFISSIONAL</Text>
                        <View className="flex-row items-center bg-white border border-slate-100 rounded-2xl px-5 py-2 shadow-sm">
                            <Mail size={18} color="#94A3B8" />
                            <TextInput
                                className="flex-1 ml-3 h-12 text-slate-900 font-bold"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                placeholder="seu@email.com"
                                placeholderTextColor="#CBD5E1"
                            />
                        </View>
                    </View>

                    {/* Password Input */}
                    <View>
                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">SENHA SEGURA</Text>
                        <View className="flex-row items-center bg-white border border-slate-100 rounded-2xl px-5 py-2 shadow-sm">
                            <Lock size={18} color="#94A3B8" />
                            <TextInput
                                className="flex-1 ml-3 h-12 text-slate-900 font-bold"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={secureTextEntry}
                                placeholder="••••••"
                                placeholderTextColor="#CBD5E1"
                            />
                            <TouchableOpacity onPress={() => setSecureTextEntry(!secureTextEntry)}>
                                {secureTextEntry ? <Eye size={20} color="#94A3B8" /> : <EyeOff size={20} color="#94A3B8" />}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {error ? (
                        <View className="bg-red-50 p-4 rounded-xl border border-red-100">
                            <Text className="text-red-600 text-xs font-bold text-center">{error}</Text>
                        </View>
                    ) : null}

                    <ButtonPrimary
                        label={loading ? "CRIANDO CONTA..." : "CRIAR CONTA AGORA"}
                        onPress={handleRegister}
                        disabled={loading}
                    />

                    <Text className="text-slate-400 text-center font-medium italic text-xs mt-4">
                        Ao se cadastrar, você concorda com nossos Termos de Uso e Política de Privacidade.
                    </Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
