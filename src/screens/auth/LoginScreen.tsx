import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { auth } from '@/services/firebase';
import { Mail, Lock, ChevronRight } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { ButtonPrimary } from '@/components/ui/ButtonPrimary';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }: any) {
    const [email, setEmail] = useState('teste@gmail.com');
    const [password, setPassword] = useState('123456');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [request, response, promptAsync] = Google.useAuthRequest({
        clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
    });

    useEffect(() => {
        if (response?.type === 'success') {
            const { id_token } = response.params;

            if (id_token) {
                const credential = GoogleAuthProvider.credential(id_token);
                setLoading(true);
                signInWithCredential(auth, credential)
                    .catch((err) => {
                        console.error(err);
                        setError('Erro ao autenticar com Google.');
                        setLoading(false);
                    });
            }
        } else if (response?.type === 'error') {
            setError('Erro no login com Google.');
            setLoading(false);
        }
    }, [response]);

    const handleLogin = async () => {
        if (!email || !password) return;

        setLoading(true);
        setError('');

        try {
            console.log("Attempting login...");
            await signInWithEmailAndPassword(auth, email, password);
            console.log("Login successful, waiting for auth state change...");
            setLoading(false); // Clear loading state so button enables if redirection lags
            // Navigation will be handled by onAuthStateChanged in AppNavigator
        } catch (e: any) {
            console.error("Login error:", e);
            setError('Credenciais inválidas. Verifique seu email e senha.');
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        try {
            await promptAsync();
        } catch (error: any) {
            console.error(error);
            setError('Falha ao iniciar login com Google.');
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-[#F8FAFC]"
        >
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
                <View className="mb-12">
                    <Header title="MATCHPRO" subtitle="Elite Sports Management" />
                    <Text className="text-slate-400 font-medium italic mt-2">Bem-vindo de volta! Acesse sua conta para gerenciar seu time.</Text>
                </View>

                <View className="gap-6">
                    {/* Email Input */}
                    <View>
                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">EMAIL</Text>
                        <View className="flex-row items-center bg-white border border-slate-100 rounded-2xl px-5 py-2">
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
                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">SENHA</Text>
                        <View className="flex-row items-center bg-white border border-slate-100 rounded-2xl px-5 py-2">
                            <Lock size={18} color="#94A3B8" />
                            <TextInput
                                className="flex-1 ml-3 h-12 text-slate-900 font-bold"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                                placeholder="••••••"
                                placeholderTextColor="#CBD5E1"
                            />
                        </View>
                    </View>

                    {error ? (
                        <View className="bg-red-50 p-4 rounded-xl border border-red-100">
                            <Text className="text-red-600 text-xs font-bold text-center">{error}</Text>
                        </View>
                    ) : null}

                    <ButtonPrimary
                        label={loading ? "AUTENTICANDO..." : "ENTRAR NO CLUBE"}
                        onPress={handleLogin}
                        disabled={loading}
                    />

                    {/* Divider */}
                    <View className="flex-row items-center my-2">
                        <View className="flex-1 h-[1px] bg-slate-200" />
                        <Text className="mx-4 text-slate-300 font-black text-[10px] uppercase tracking-widest">ou</Text>
                        <View className="flex-1 h-[1px] bg-slate-200" />
                    </View>

                    {/* Google Button */}
                    <TouchableOpacity
                        onPress={handleGoogleLogin}
                        disabled={!request || loading}
                        className="bg-slate-900 h-14 rounded-2xl flex-row items-center justify-center shadow-lg shadow-slate-200"
                    >
                        {/* Simple G icon representation or text since we don't have an SVG asset handy, or use a generic icon */}
                        <View className="w-6 h-6 rounded-full bg-white items-center justify-center mr-3">
                            <Text className="font-bold text-slate-900 text-xs">G</Text>
                        </View>
                        <Text className="text-white font-bold italic tracking-wide text-sm">ENTRAR COM GOOGLE</Text>
                    </TouchableOpacity>

                    <View className="flex-row items-center justify-center mt-6">
                        <Text className="text-slate-400 font-medium italic">Não tem uma conta?</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Register')} className="ml-2 flex-row items-center">
                            <Text className="text-[#006400] font-black italic uppercase text-xs tracking-widest">Cadastre-se</Text>
                            <ChevronRight size={14} color="#006400" />
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
