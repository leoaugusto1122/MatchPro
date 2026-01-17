import React, { useEffect, useState } from 'react';
import { View, ScrollView, Alert, TouchableOpacity, Text, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
// import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { doc, getDoc, addDoc, collection, updateDoc } from 'firebase/firestore';
import { Player } from '@/types/models';
import { ChevronLeft, User, Shield, Activity, DollarSign, Target, Trophy, Star, Edit3, CheckCircle, XCircle } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// 1. Simulação de Role (Estado Global)
const CURRENT_USER_ROLE = 'owner'; // Testar com 'player' depois

export default function PlayerDetailsScreen({ route, navigation }: any) {
    const teamId = useTeamStore(state => state.teamId);

    // Simulação de permissão baseada na role
    const canManage = ['owner', 'coach', 'staff'].includes(CURRENT_USER_ROLE);

    const { playerId, mode = 'view' } = route.params || {};

    const [isEditing, setIsEditing] = useState(mode === 'create' || (mode === 'edit' && canManage));

    const [name, setName] = useState('');
    const [position, setPosition] = useState('MID');
    const [status, setStatus] = useState('active');
    const [paymentMode, setPaymentMode] = useState<string>('monthly');

    const [overallRating, setOverallRating] = useState<number>(0);
    const [fanRating, setFanRating] = useState<number>(0);
    const [coachRating, setCoachRating] = useState<number>(0);

    const [stats, setStats] = useState({ goals: 0, assists: 0, matchesPlayed: 0 });
    const [financialSummary, setFinancialSummary] = useState<{ totalPaid: number, totalPending: number } | null>(null);
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
                        setPaymentMode(data.paymentMode || 'monthly');

                        setOverallRating(data.overallRating || 0);
                        setFanRating(data.fanRating || 0);
                        setCoachRating(data.coachRating || 0);

                        setStats({
                            goals: data.goals || 0,
                            assists: data.assists || 0,
                            matchesPlayed: data.matchesPlayed || 0
                        });
                        if (data.financialSummary) setFinancialSummary(data.financialSummary);
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    setInitialLoading(false);
                }
            };
            fetchPlayer();
        } else {
            setInitialLoading(false);
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
                paymentMode,
                ...(mode === 'create' ? { goals: 0, assists: 0, matchesPlayed: 0, overallRating: 80 } : {})
            };

            if (mode === 'create') {
                await addDoc(collection(db, 'teams', teamId, 'players'), playerData);
            } else {
                await updateDoc(doc(db, 'teams', teamId, 'players', playerId), playerData);
                setIsEditing(false);
            }

            if (mode === 'create') navigation.goBack();
        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Falha ao salvar');
        } finally {
            setLoading(false);
        }
    };

    const handleSettleDebt = async () => {
        if (!teamId || !playerId) return;

        Alert.alert(
            "Confirmar Pagamento",
            "Deseja zerar o débito deste jogador?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Confirmar",
                    onPress: async () => {
                        setLoading(true);
                        try {
                            await updateDoc(doc(db, 'teams', teamId, 'players', playerId), {
                                "financialSummary.totalPending": 0
                            });
                            setFinancialSummary(prev => prev ? ({ ...prev, totalPending: 0 }) : null);
                            Alert.alert("Sucesso", "Débito zerado!");
                        } catch (e) {
                            Alert.alert("Erro", "Falha ao lançar pagamento");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const getPaymentModeLabel = (mode: string) => {
        switch (mode) {
            case 'monthly': return 'Mensalista';
            case 'per_game': return 'Diarista';
            case 'exempt': return 'Isento';
            default: return 'Mensalista';
        }
    };

    if (initialLoading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-[#F8FAFC]">
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                {/* Header Profile */}
                <View className="pt-12 px-6 pb-8 bg-white border-b border-slate-100 shadow-sm mb-6">
                    <View className="flex-row justify-between items-center mb-6">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center">
                            <ChevronLeft size={20} color="#94A3B8" />
                            <Text className="ml-1 font-black italic text-slate-400 uppercase tracking-widest text-[10px]">Atletas</Text>
                        </TouchableOpacity>

                        {/* Edit Button (Visible only to Managers and if not already editing/creating) */}
                        {canManage && !isEditing && mode !== 'create' && (
                            <TouchableOpacity onPress={() => setIsEditing(true)} className="bg-slate-100 p-2 rounded-full">
                                <Edit3 size={16} color="#475569" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View className="flex-row items-center">
                        <View className="w-24 h-24 bg-slate-900 rounded-[2rem] items-center justify-center shadow-lg shadow-slate-300">
                            <User size={48} color="white" />
                        </View>
                        <View className="ml-6 flex-1">
                            <Text className="text-2xl font-black italic text-slate-900 uppercase tracking-tighter" numberOfLines={2}>
                                {name || 'Novo Atleta'}
                            </Text>
                            <View className="flex-row gap-2 mt-2">
                                <Badge label={position} color="bg-blue-50" textColor="text-blue-600" />
                                <Badge label={status === 'active' ? 'TITULAR' : 'RESERVA'} color={status === 'active' ? 'bg-emerald-50' : 'bg-orange-50'} textColor={status === 'active' ? 'text-emerald-700' : 'text-orange-600'} />
                            </View>
                        </View>
                        {overallRating > 0 && (
                            <View className="items-end">
                                <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest">OVR</Text>
                                <Text className="text-4xl font-black italic text-[#006400] leading-none">{overallRating}</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View className="px-6 gap-6">

                    {/* Stats & Ratings Grid (Visible to Everyone) */}
                    {!isEditing && (
                        <>
                            <View className="flex-row gap-3">
                                <Card className="flex-1 p-4 items-center">
                                    <Target size={18} color="#006400" />
                                    <Text className="text-2xl font-black italic text-slate-900 mt-1">{stats.goals}</Text>
                                    <Text className="text-[8px] font-black uppercase text-slate-400 tracking-widest">GOLS</Text>
                                </Card>
                                <Card className="flex-1 p-4 items-center">
                                    <Trophy size={18} color="#00BFFF" />
                                    <Text className="text-2xl font-black italic text-slate-900 mt-1">{stats.assists}</Text>
                                    <Text className="text-[8px] font-black uppercase text-slate-400 tracking-widest">ASSIST</Text>
                                </Card>
                                <Card className="flex-1 p-4 items-center">
                                    <Activity size={18} color="#64748B" />
                                    <Text className="text-2xl font-black italic text-slate-900 mt-1">{stats.matchesPlayed}</Text>
                                    <Text className="text-[8px] font-black uppercase text-slate-400 tracking-widest">JOGOS</Text>
                                </Card>
                            </View>

                            <View className="flex-row gap-3">
                                <Card className="flex-1 p-4 flex-row items-center justify-between">
                                    <View>
                                        <Text className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">MÉDIA GALERA</Text>
                                        <Text className="text-xl font-black italic text-slate-900">{fanRating > 0 ? fanRating.toFixed(1) : '-'}</Text>
                                    </View>
                                    <View className="bg-yellow-50 p-2 rounded-full">
                                        <Star size={16} color="#CA8A04" fill="#CA8A04" />
                                    </View>
                                </Card>
                                <Card className="flex-1 p-4 flex-row items-center justify-between">
                                    <View>
                                        <Text className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">NOTA TÉCNICA</Text>
                                        <Text className="text-xl font-black italic text-slate-900">{coachRating > 0 ? coachRating.toFixed(1) : '-'}</Text>
                                    </View>
                                    <View className="bg-blue-50 p-2 rounded-full">
                                        <Shield size={16} color="#2563EB" />
                                    </View>
                                </Card>
                            </View>
                        </>
                    )}

                    {/* Financial Card (Restricted: Manager Only) */}
                    {canManage && (
                        <Card className="bg-[#0F172A] p-6 border-0 overflow-hidden relative">
                            {/* Background Decoration */}
                            <View className="absolute -right-4 -bottom-4 opacity-5">
                                <DollarSign size={100} color="white" />
                            </View>

                            <View className="flex-row justify-between items-start mb-6">
                                <View>
                                    <Text className="text-white font-black italic text-lg uppercase tracking-tighter">Financeiro</Text>
                                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Acesso Restrito</Text>
                                </View>
                                <Badge
                                    label={getPaymentModeLabel(paymentMode)}
                                    color="bg-slate-800"
                                    textColor="text-slate-300"
                                />
                            </View>

                            <View className="flex-row gap-6 mb-6">
                                <View className="flex-1">
                                    <View className="flex-row items-center mb-1">
                                        <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">STATUS ATUAL</Text>
                                    </View>
                                    <View className="flex-row items-center">
                                        {financialSummary && financialSummary.totalPending > 0 ? (
                                            <XCircle size={16} color="#F87171" className="mr-2" />
                                        ) : (
                                            <CheckCircle size={16} color="#10B981" className="mr-2" />
                                        )}
                                        <Text className={`text-xl font-black italic ${financialSummary && financialSummary.totalPending > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {financialSummary && financialSummary.totalPending > 0 ? 'Pendente' : 'Em Dia'}
                                        </Text>
                                    </View>
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row items-center mb-1">
                                        <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">DÉBITO TOTAL</Text>
                                    </View>
                                    <Text className="text-white text-2xl font-black italic">
                                        R$ {financialSummary?.totalPending.toFixed(2) || '0.00'}
                                    </Text>
                                </View>
                            </View>

                            {/* Action: Settle Debt */}
                            {financialSummary && financialSummary.totalPending > 0 && (
                                <TouchableOpacity
                                    onPress={handleSettleDebt}
                                    className="bg-emerald-500 py-3 rounded-xl items-center flex-row justify-center space-x-2"
                                >
                                    <CheckCircle size={16} color="#064E3B" />
                                    <Text className="text-[#064E3B] font-black uppercase text-xs tracking-widest">Lançar Pagamento</Text>
                                </TouchableOpacity>
                            )}
                        </Card>
                    )}

                    {/* Edit Form */}
                    {isEditing && (
                        <Card className="p-6">
                            <Text className="text-xs font-black italic text-slate-900 tracking-widest uppercase mb-4">Editar Informações</Text>

                            <View className="gap-6">
                                <View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">NOME COMPLETO</Text>
                                    <TextInput
                                        className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900"
                                        value={name} onChangeText={setName}
                                        placeholder="Nome do atleta"
                                    />
                                </View>

                                <View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">POSIÇÃO</Text>
                                    <View className="flex-row bg-slate-50 p-1 rounded-xl">
                                        {['GK', 'DEF', 'MID', 'FWD'].map((pos) => (
                                            <TouchableOpacity
                                                key={pos}
                                                onPress={() => setPosition(pos)}
                                                className={`flex-1 py-3 rounded-lg items-center ${position === pos ? 'bg-slate-900' : 'bg-transparent'}`}
                                            >
                                                <Text className={`font-black italic text-[10px] ${position === pos ? 'text-white' : 'text-slate-400'}`}>{pos}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">STATUS</Text>
                                    <View className="flex-row bg-slate-50 p-1 rounded-xl">
                                        {[
                                            { id: 'active', label: 'TITULAR' },
                                            { id: 'reserve', label: 'RESERVA' }
                                        ].map((s) => (
                                            <TouchableOpacity
                                                key={s.id}
                                                onPress={() => setStatus(s.id)}
                                                className={`flex-1 py-3 rounded-lg items-center ${status === s.id ? 'bg-slate-900' : 'bg-transparent'}`}
                                            >
                                                <Text className={`font-black italic text-[10px] ${status === s.id ? 'text-white' : 'text-slate-400'}`}>{s.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">MODO DE PAGAMENTO</Text>
                                    <View className="bg-slate-50 p-1 rounded-xl">
                                        {[
                                            { id: 'monthly', label: 'MENSALISTA' },
                                            { id: 'per_game', label: 'DIARISTA' },
                                            { id: 'exempt', label: 'ISENTO' }
                                        ].map((pm) => (
                                            <TouchableOpacity
                                                key={pm.id}
                                                onPress={() => setPaymentMode(pm.id)}
                                                className={`py-3 rounded-lg items-center flex-row px-4 mb-1 ${paymentMode === pm.id ? 'bg-slate-900' : 'bg-transparent'}`}
                                            >
                                                <View className={`w-4 h-4 rounded-full border-2 mr-3 justify-center items-center ${paymentMode === pm.id ? 'border-emerald-400' : 'border-slate-300'}`}>
                                                    {paymentMode === pm.id && <View className="w-2 h-2 rounded-full bg-emerald-400" />}
                                                </View>
                                                <Text className={`font-black italic text-[10px] ${paymentMode === pm.id ? 'text-white' : 'text-slate-400'}`}>{pm.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        </Card>
                    )}

                    {isEditing && (
                        <View className="flex-row gap-4 mb-10">
                            <TouchableOpacity onPress={() => mode === 'create' ? navigation.goBack() : setIsEditing(false)} className="flex-1 py-4 items-center">
                                <Text className="text-slate-400 font-black italic uppercase text-xs tracking-widest">CANCELAR</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={loading}
                                className={`flex-2 bg-[#006400] px-8 py-4 rounded-2xl items-center shadow-lg shadow-green-900/20 ${loading ? 'opacity-50' : ''}`}
                            >
                                {loading ? <ActivityIndicator color="white" size="small" /> : <Text className="text-white font-black italic uppercase text-xs tracking-widest">SALVAR DADOS</Text>}
                            </TouchableOpacity>
                        </View>
                    )}

                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
