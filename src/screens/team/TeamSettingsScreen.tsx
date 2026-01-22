import React, { useEffect, useState } from 'react';
import { View, ScrollView, Alert, TouchableOpacity, Text, TextInput, Share, Image } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTeamStore } from '@/stores/teamStore';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/services/firebase';
import { Team, Player } from '@/types/models';
import { ChevronLeft, DollarSign, Calendar, Wallet, LogOut, Copy, Share2, Hash, RefreshCw } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ButtonPrimary } from '@/components/ui/ButtonPrimary';
// import { useAuthStore } from '@/stores/authStore'; // Unused

export default function TeamSettingsScreen({ navigation }: any) {
    const { teamId, currentRole, clearTeamContext } = useTeamStore();

    // Unused
    // const { user } = useAuthStore();

    const [team, setTeam] = useState<Team | null>(null);

    // Finance
    const [billingMode, setBillingMode] = useState<'PER_GAME' | 'MONTHLY' | 'MONTHLY_PLUS_GAME'>('PER_GAME');
    const [perGameAmount, setPerGameAmount] = useState('');
    const [monthlyAmount, setMonthlyAmount] = useState('');
    const [billingDay, setBillingDay] = useState('');
    const [loading, setLoading] = useState(false);

    // Unused monthly check logic can be removed or kept if planned for future
    // const [monthlyGenerated, setMonthlyGenerated] = useState(false);

    // const currentMonthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    useEffect(() => {
        const fetchTeamData = async () => {
            if (!teamId) return;
            try {
                // Team Doc
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
                console.error("Error fetching team data", e);
            }
        };
        fetchTeamData();
    }, [teamId]);

    const handleCopyCode = async () => {
        if (team?.code) {
            await Clipboard.setStringAsync(team.code);
            Alert.alert('Sucesso', 'Código copiado!');
        }
    };

    const handleShareLink = async () => {
        if (team) {
            // New Convite Link Structure
            const url = team.inviteLink || `https://matchpro.app/convite/${team.id}`;
            try {
                await Share.share({
                    message: `Partiu jogo? Entra no ${team.name} usando o código *${team.code || ''}* ou pelo link: ${url}`,
                    url: url,
                });
            } catch (error) {
                console.error(error);
            }
        }
    };

    const handleRotateInvite = () => {
        Alert.alert(
            'Redefinir Convites',
            'Isso invalidará o código anterior e o link antigo continuará funcionando apenas se for baseado no ID (mas o código muda). Deseja continuar?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Gerar Novos',
                    onPress: async () => {
                        if (!team) return;
                        setLoading(true);
                        try {
                            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                            const appId = firebaseConfig.appId;

                            // 1. Update Core Data
                            await updateDoc(doc(db, 'teams', team.id), {
                                code: newCode
                            });

                            // 2. Sync to Public Artifact (Required for Search)
                            if (appId) {
                                const publicPath = `artifacts/${appId}/public/data/teams/${team.id}`;
                                await setDoc(doc(db, publicPath), {
                                    id: team.id,
                                    inviteCode: newCode, // Changed from code to inviteCode per requirements
                                    name: team.name,
                                    status: 'active',
                                    inviteLink: team.inviteLink || '',
                                    updatedAt: new Date()
                                }, { merge: true });
                            }

                            setTeam(prev => prev ? ({ ...prev, code: newCode }) : null);
                            Alert.alert('Sucesso', 'Novo código de acesso gerado.');
                        } catch (e) {
                            Alert.alert('Erro', 'Falha ao gerar novo código.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };


    const handleSaveFinance = async () => {
        if (!team || currentRole !== 'owner') return;
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
            Alert.alert('Erro', 'Falha ao salvar.');
        } finally {
            setLoading(false);
        }
    };

    const handleSwitchTeam = () => {
        Alert.alert(
            'Trocar de Time',
            'Deseja voltar para a seleção de times?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Sair e Trocar',
                    onPress: () => clearTeamContext()
                }
            ]
        );
    };

    return (
        <ScrollView className="flex-1 bg-[#F8FAFC]" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <View className="pt-12 px-6 pb-6 bg-white border-b border-slate-100 mb-6 shadow-sm">
                <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center mb-6">
                    <ChevronLeft size={20} color="#94A3B8" />
                    <Text className="ml-1 font-black italic text-slate-400 uppercase tracking-widest text-[10px]">Voltar</Text>
                </TouchableOpacity>
                <Header title="CONFIGURAÇÕES" subtitle="Gestão do Clube" />
            </View>

            <View className="px-6 gap-6">

                {/* Team Code & Invite - Owner Only */}
                {currentRole === 'owner' && team && (
                    <Card className="p-6">
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-xs font-black italic text-slate-900 tracking-widest uppercase">Passe de Acesso</Text>
                            <View className="flex-row gap-2">
                                <TouchableOpacity onPress={handleRotateInvite} className="bg-slate-100 p-2 rounded-full">
                                    <RefreshCw size={14} color="#64748B" />
                                </TouchableOpacity>
                                <Badge label="ÚNICO" color="bg-blue-50" textColor="text-blue-500" />
                            </View>
                        </View>

                        <View className="bg-slate-900 rounded-2xl p-6 items-center mb-4 relative overflow-hidden">
                            <Hash size={100} color="white" className="absolute -bottom-4 -right-4 opacity-5" />
                            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">CÓDIGO DO TIME</Text>
                            <Text className="text-4xl font-black text-white tracking-widest">{team.code || '---'}</Text>
                        </View>

                        <Text className="text-center text-xs text-slate-400 mb-4 px-4">
                            Este código expira se você gerar um novo.
                        </Text>

                        <View className="flex-row gap-3">
                            <TouchableOpacity onPress={handleCopyCode} className="flex-1 bg-slate-100 py-3 rounded-xl flex-row items-center justify-center border border-slate-200">
                                <Copy size={16} color="#475569" />
                                <Text className="ml-2 font-black text-slate-600 text-[10px] uppercase">Copiar Código</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleShareLink} className="flex-1 bg-[#006400] py-3 rounded-xl flex-row items-center justify-center">
                                <Share2 size={16} color="white" />
                                <Text className="ml-2 font-black text-white text-[10px] uppercase">Enviar Convite</Text>
                            </TouchableOpacity>
                        </View>
                    </Card>
                )}


                {/* Finance Settings - Owner Only */}
                {currentRole === 'owner' && (
                    <Card className="p-6">
                        <Text className="text-xs font-black italic text-slate-900 tracking-widest uppercase mb-4">Financeiro</Text>
                        <View className="gap-3">
                            {[
                                { id: 'PER_GAME', label: 'POR JOGO', desc: 'Paga apenas quando joga' },
                                { id: 'MONTHLY', label: 'MENSALIDADE', desc: 'Valor fixo mensal' },
                                { id: 'MONTHLY_PLUS_GAME', label: 'HÍBRIDO', desc: 'Mensalidade + Jogo' }
                            ].map((m) => (
                                <TouchableOpacity
                                    key={m.id}
                                    onPress={() => setBillingMode(m.id as any)}
                                    className={`flex-row items-center p-4 rounded-2xl border ${billingMode === m.id ? 'bg-[#006400]/5 border-[#006400]' : 'bg-slate-50 border-slate-100'}`}
                                >
                                    <View className={`w-4 h-4 rounded-full border items-center justify-center ${billingMode === m.id ? 'border-[#006400]' : 'border-slate-300'}`}>
                                        {billingMode === m.id && <View className="w-2 h-2 rounded-full bg-[#006400]" />}
                                    </View>
                                    <View className="ml-4 flex-1">
                                        <Text className={`font-black italic text-xs uppercase tracking-widest ${billingMode === m.id ? 'text-[#006400]' : 'text-slate-500'}`}>{m.label}</Text>
                                        <Text className="text-[9px] text-slate-400 font-medium">{m.desc}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View className="gap-4 mt-6">
                            {(billingMode === 'PER_GAME' || billingMode === 'MONTHLY_PLUS_GAME') && (
                                <View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">VALOR POR JOGO</Text>
                                    <View className="flex-row items-center bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                                        <DollarSign size={16} color="#94A3B8" />
                                        <TextInput className="flex-1 ml-2 font-bold text-slate-900" value={perGameAmount} onChangeText={setPerGameAmount} keyboardType="numeric" placeholder="0.00" />
                                    </View>
                                </View>
                            )}
                            {(billingMode === 'MONTHLY' || billingMode === 'MONTHLY_PLUS_GAME') && (
                                <>
                                    <View>
                                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">VALOR MENSALIDADE</Text>
                                        <View className="flex-row items-center bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                                            <Wallet size={16} color="#94A3B8" />
                                            <TextInput className="flex-1 ml-2 font-bold text-slate-900" value={monthlyAmount} onChangeText={setMonthlyAmount} keyboardType="numeric" placeholder="0.00" />
                                        </View>
                                    </View>
                                    <View>
                                        <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">DIA DO VENCIMENTO</Text>
                                        <View className="flex-row items-center bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                                            <Calendar size={16} color="#94A3B8" />
                                            <TextInput className="flex-1 ml-2 font-bold text-slate-900" value={billingDay} onChangeText={setBillingDay} keyboardType="numeric" placeholder="Ex: 5" />
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>

                        <View className="mt-6">
                            <ButtonPrimary label={loading ? "SALVANDO..." : "SALVAR FINANCEIRO"} onPress={handleSaveFinance} disabled={loading} />
                        </View>
                    </Card>
                )}

                {/* Switch Team Button */}
                <Card className="p-6 border-red-100 bg-red-50 mb-8">
                    <TouchableOpacity
                        onPress={handleSwitchTeam}
                        className="flex-row items-center justify-center p-2"
                    >
                        <LogOut size={20} color="#EF4444" />
                        <Text className="ml-2 font-black italic text-red-500 uppercase tracking-widest text-xs">TROCAR DE TIME</Text>
                    </TouchableOpacity>
                </Card>
            </View>
        </ScrollView>
    );
}
