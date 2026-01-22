import React, { useEffect, useState, useMemo } from 'react';
import { View, ScrollView, Alert, TouchableOpacity, Text, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Linking } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { usePermissions } from '@/hooks/usePermissions';
import { db } from '@/services/firebase';
import { doc, getDoc, addDoc, collection, updateDoc } from 'firebase/firestore';
import { Player, Transaction } from '@/types/models';
import { TransactionService } from '@/services/transactionService';
import { MemberService } from '@/services/memberService';
import { format } from 'date-fns';
import { ChevronLeft, User, Activity, DollarSign, Target, Trophy, Edit3, CheckCircle, XCircle, Share2, Receipt } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function PlayerDetailsScreen({ route, navigation }: any) {
    const teamId = useTeamStore(state => state.teamId);

    // Simulação de permissão baseada na role
    // In a real scenario, use usePermissions hook or actual user role from store
    const { myPlayerProfile } = useTeamStore(state => state);
    const { isStaff: canManage } = usePermissions();

    const { playerId, mode = 'view', isGhost = false } = route.params || {};

    const [isEditing, setIsEditing] = useState(mode === 'create' || (mode === 'edit' && canManage));

    const [name, setName] = useState('');
    const [position, setPosition] = useState('MID');
    const [status, setStatus] = useState('active');
    const [playerUserId, setPlayerUserId] = useState<string | undefined>(undefined);
    const [isAthlete, setIsAthlete] = useState(true);
    const [isStaff, setIsStaff] = useState(false);
    const [role, setRole] = useState<'owner' | 'coach' | 'staff' | 'player'>('player');
    const [paymentMode, setPaymentMode] = useState<string>('monthly');
    const [teamBillingMode, setTeamBillingMode] = useState<'PER_GAME' | 'MONTHLY' | 'MONTHLY_PLUS_GAME'>('PER_GAME');

    const [overallRating, setOverallRating] = useState<number>(0);

    const [stats, setStats] = useState({ goals: 0, assists: 0, matchesPlayed: 0 });
    // const [financialSummary, setFinancialSummary] = useState<{ totalPaid: number, totalPending: number } | null>(null); // Legacy
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(!!playerId);

    // Modals
    const [showStatement, setShowStatement] = useState(false);

    useEffect(() => {
        if (teamId) {
            const fetchTeamAndPlayer = async () => {
                try {
                    // Fetch Team First to get Billing Mode
                    const teamDoc = await getDoc(doc(db, 'teams', teamId));
                    let currentTeamMode: 'PER_GAME' | 'MONTHLY' | 'MONTHLY_PLUS_GAME' = 'PER_GAME';

                    if (teamDoc.exists()) {
                        const tData = teamDoc.data() as any;
                        if (tData.billingMode) {
                            currentTeamMode = tData.billingMode;
                            setTeamBillingMode(currentTeamMode);
                        }
                    }

                    if (playerId) {
                        const docRef = doc(db, 'teams', teamId, 'players', playerId);
                        const snap = await getDoc(docRef);
                        if (snap.exists()) {
                            const data = snap.data() as Player;
                            setName(data.name);
                            setPosition(data.position || 'MID');
                            setStatus(data.status || 'active');
                            setIsAthlete(data.isAthlete !== undefined ? data.isAthlete : true);
                            setRole(data.role || 'player');
                            setIsStaff(data.isStaff || ['owner', 'coach', 'staff'].includes(data.role || 'player'));
                            setPlayerUserId(data.userId || data.authId);
                            setPaymentMode(data.paymentMode || (currentTeamMode === 'PER_GAME' ? 'per_game' : 'monthly'));

                            setOverallRating(data.overallRating || 0);

                            setStats({
                                goals: data.goals || 0,
                                assists: data.assists || 0,
                                matchesPlayed: data.matchesPlayed || 0
                            });
                        }
                    } else if (mode === 'create') {
                        setPaymentMode(currentTeamMode === 'PER_GAME' ? 'per_game' : 'monthly');
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    setInitialLoading(false);
                }
            };
            fetchTeamAndPlayer();
        } else {
            setInitialLoading(false);
        }
    }, [playerId, teamId]);

    // Financial Subscription
    useEffect(() => {
        if (!teamId || !playerId || mode === 'create') return;

        const unsub = TransactionService.subscribeToPlayerTransactions(teamId, playerId, (list) => {
            setTransactions(list);
        });

        return () => unsub();
    }, [teamId, playerId, mode]);

    // Financial Calculation
    const { totalPending } = useMemo(() => {
        const pending = transactions.filter(t => t.status === 'pending');
        const sum = pending.reduce((acc, t) => acc + t.amount, 0);
        return { totalPending: sum };
    }, [transactions]);


    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Erro', 'Nome é obrigatório');
            return;
        }
        if (!teamId) return;

        setLoading(true);
        try {
            // Validation: Must have at least one function
            if (!isAthlete && !isStaff && role !== 'owner') {
                Alert.alert("Atenção", "O usuário deve ser pelo menos Jogador ou Staff.");
                setLoading(false);
                return;
            }

            // Legacy Role Calculation (for backward compatibility)
            // Owner > Staff > Player
            let derivedRole = 'player';
            if (role === 'owner') derivedRole = 'owner';
            else if (isStaff) derivedRole = 'staff';
            else if (isAthlete) derivedRole = 'player';

            const playerData: any = {
                name,
                position: isAthlete ? position : null,
                status,
                isAthlete,
                isStaff, // Explicit Flag
                role: derivedRole,
                paymentMode,
                ...(mode === 'create' ? { goals: 0, assists: 0, matchesPlayed: 0, overallRating: 80 } : {})
            };

            if (isGhost) {
                playerData.isGhost = true;
                playerData.authId = null;
                playerData.userId = null;
            }

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

    const handleBillPlayer = () => {
        if (totalPending <= 0) {
            Alert.alert("Tudo certo", "Este jogador não possui pendências.");
            return;
        }

        const pendingItems = transactions
            .filter(t => t.status === 'pending')
            .map(t => `- ${t.description} (R$ ${t.amount})`)
            .join('\n');

        const message = `Olá ${name}, você possui pendências no ${'Time'}:\n\n${pendingItems}\n\nTotal: R$ ${totalPending.toFixed(2)}`;
        Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
    };

    const handleConfirmPayment = (transaction: Transaction) => {
        Alert.alert(
            "Confirmar Recebimento",
            `Deseja confirmar o recebimento de R$ ${transaction.amount.toFixed(2)}?\n\nIsso lançará uma entrada no caixa do time.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Confirmar e Receber",
                    onPress: async () => {
                        try {
                            if (!teamId) return;
                            await TransactionService.markAsPaid(teamId, transaction.id);
                            Alert.alert("Sucesso", "Pagamento recebido e registrado no caixa!");
                        } catch (error) {
                            Alert.alert("Erro", "Não foi possível processar o pagamento.");
                            console.error(error);
                        }
                    }
                }
            ]
        );
    };

    const handleReintegrate = async () => {
        if (!teamId || !playerId || !myPlayerProfile) return;

        Alert.alert(
            "Reintegrar Jogador",
            "Deseja reintegrar este jogador ao time? Ele terá o status restaurado para ATIVO.",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Reintegrar",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await MemberService.reintegrateMember(teamId, {
                                id: playerId,
                                name,
                                userId: playerUserId
                            } as Player, {
                                id: myPlayerProfile.id,
                                name: myPlayerProfile.name
                            });
                            setStatus('active');
                            Alert.alert("Sucesso", "Jogador reintegrado ao time.");
                        } catch (e) {
                            console.error(e);
                            Alert.alert("Erro", "Falha ao reintegrar jogador.");
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

    const getAvailablePaymentModes = () => {
        const options = [
            { id: 'monthly', label: 'MENSALISTA' },
            { id: 'per_game', label: 'DIARISTA' },
            { id: 'exempt', label: 'ISENTO' }
        ];

        if (teamBillingMode === 'PER_GAME') {
            return options.filter(o => o.id === 'per_game' || o.id === 'exempt');
        }
        if (teamBillingMode === 'MONTHLY') {
            return options.filter(o => o.id === 'monthly' || o.id === 'exempt');
        }
        // Hybrid: All options
        return options;
    };

    const paymentOptions = getAvailablePaymentModes();

    if (initialLoading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-[#F8FAFC]">

            {/* Statement Modal */}
            <Modal visible={showStatement} animationType="slide" presentationStyle="pageSheet">
                <View className="flex-1 bg-slate-50">
                    <View className="p-6 bg-white border-b border-slate-200 flex-row justify-between items-center">
                        <View>
                            <Text className="text-xl font-black italic text-slate-900 uppercase">Extrato Financeiro</Text>
                            <Text className="text-slate-500 font-bold text-sm">{name}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setShowStatement(false)} className="p-2 bg-slate-100 rounded-full">
                            <Text className="font-bold text-slate-500">X</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView className="p-6">
                        {transactions.length > 0 ? (
                            transactions.map(t => (
                                <Card key={t.id} className="mb-3 p-4 border border-slate-100 shadow-sm">
                                    <View className="flex-row justify-between items-start">
                                        <View className="flex-1 mr-4">
                                            <Text className="font-bold text-slate-800 text-xs uppercase">{t.description}</Text>
                                            <Text className="text-[10px] text-slate-400 font-bold mt-1">
                                                {t.date && t.date.seconds ? format(new Date(t.date.seconds * 1000), 'dd/MM/yyyy') : '-'}
                                            </Text>
                                        </View>
                                        <View className="items-end">
                                            <Text className={`font-black italic text-sm ${t.status === 'paid' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                R$ {t.amount.toFixed(2)}
                                            </Text>
                                            <Badge
                                                label={t.status === 'paid' ? 'PAGO' : 'PENDENTE'}
                                                color={t.status === 'paid' ? 'bg-emerald-100' : 'bg-red-100'}
                                                textColor={t.status === 'paid' ? 'text-emerald-700' : 'text-red-700'}
                                                className="mt-1"
                                            />
                                        </View>
                                    </View>

                                    {t.status === 'pending' && canManage && (
                                        <TouchableOpacity
                                            onPress={() => handleConfirmPayment(t)}
                                            className="mt-3 bg-emerald-50 py-2 rounded-lg border border-emerald-100 flex-row justify-center items-center active:bg-emerald-100"
                                        >
                                            <CheckCircle size={14} color="#059669" />
                                            <Text className="text-emerald-700 font-black text-[10px] uppercase ml-2 tracking-wide">CONFIRMAR PAGAMENTO</Text>
                                        </TouchableOpacity>
                                    )}
                                </Card>
                            ))
                        ) : (
                            <Text className="text-center text-slate-400 italic mt-10">Nenhuma transação registrada.</Text>
                        )}
                    </ScrollView>
                </View>
            </Modal>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                {/* Header Profile */}
                <View className="pt-12 px-6 pb-8 bg-white border-b border-slate-100 shadow-sm mb-6">
                    <View className="flex-row justify-between items-center mb-6">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center">
                            <ChevronLeft size={20} color="#94A3B8" />
                            <Text className="ml-1 font-black italic text-slate-400 uppercase tracking-widest text-[10px]">Atletas</Text>
                        </TouchableOpacity>

                        {/* Edit Button - Disabled if Expelled */}
                        {canManage && !isEditing && mode !== 'create' && status !== 'expelled' && (
                            <TouchableOpacity onPress={() => setIsEditing(true)} className="bg-slate-100 p-2 rounded-full">
                                <Edit3 size={16} color="#475569" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View className="flex-row items-center">
                        <View className="w-24 h-24 bg-slate-900 rounded-[2rem] items-center justify-center shadow-lg shadow-slate-300">
                            {/* Show Alert Icon on Avatar if Pending */}
                            <User size={48} color="white" />
                            {totalPending > 0 && (
                                <View className="absolute -top-2 -right-2 bg-red-500 w-8 h-8 rounded-full items-center justify-center border-4 border-white">
                                    <Text className="text-white text-[10px] font-black">!</Text>
                                </View>
                            )}
                        </View>
                        <View className="ml-6 flex-1">
                            <Text className="text-2xl font-black italic text-slate-900 uppercase tracking-tighter" numberOfLines={2}>
                                {name || 'Novo Atleta'}
                            </Text>
                            <View className="flex-row gap-2 mt-2">
                                <Badge label={position} color="bg-blue-50" textColor="text-blue-600" />
                                {status === 'expelled' ? (
                                    <Badge label="EXPULSO" color="bg-red-100" textColor="text-red-700" />
                                ) : (
                                    <Badge label={status === 'active' ? 'ATIVO' : 'INATIVO'} color={status === 'active' ? 'bg-emerald-50' : 'bg-slate-100'} textColor={status === 'active' ? 'text-emerald-700' : 'text-slate-500'} />
                                )}
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

                    {/* Expelled Warning */}
                    {status === 'expelled' && (
                        <Card className="bg-red-50 border border-red-100 p-4 mb-2">
                            <Text className="text-red-800 font-bold text-sm mb-1">JOGADOR EXPULSO</Text>
                            <Text className="text-red-600 text-xs">
                                Este jogador foi expulso do time. Os dados abaixo são apenas para consulta e não podem ser editados.
                            </Text>
                            {/* Reintegrate Button (Owner Only) */}
                            {myPlayerProfile?.role === 'owner' && (
                                <TouchableOpacity
                                    onPress={handleReintegrate}
                                    disabled={loading}
                                    className="mt-4 bg-red-600 py-3 rounded-lg items-center shadow-sm active:bg-red-700"
                                >
                                    {loading ? (
                                        <ActivityIndicator color="white" size="small" />
                                    ) : (
                                        <Text className="text-white font-black uppercase text-xs tracking-widest">REINTEGRAR JOGADOR</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        </Card>
                    )}

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
                        </>
                    )}

                    {/* Financial Card (Restricted: Manager Only OR if it's the player himself) */}
                    {(canManage || (myPlayerProfile?.id === playerId)) && (
                        <Card className="bg-[#0F172A] p-6 border-0 overflow-hidden relative">
                            <View className="absolute -right-4 -bottom-4 opacity-5">
                                <DollarSign size={100} color="white" />
                            </View>

                            <View className="flex-row justify-between items-start mb-6">
                                <View>
                                    <Text className="text-white font-black italic text-lg uppercase tracking-tighter">Financeiro</Text>
                                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                                        {canManage ? 'Gestão Financeira' : 'Meu Extrato'}
                                    </Text>
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
                                        {totalPending > 0 ? (
                                            <XCircle size={16} color="#F87171" className="mr-2" />
                                        ) : (
                                            <CheckCircle size={16} color="#10B981" className="mr-2" />
                                        )}
                                        <Text className={`text-xl font-black italic ${totalPending > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {totalPending > 0 ? 'Pendente' : 'Em Dia'}
                                        </Text>
                                    </View>
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row items-center mb-1">
                                        <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">DÉBITO TOTAL</Text>
                                    </View>
                                    <Text className="text-white text-2xl font-black italic">
                                        R$ {totalPending.toFixed(2)}
                                    </Text>
                                </View>
                            </View>

                            <View className="flex-row gap-3">
                                {totalPending > 0 && canManage && (
                                    <TouchableOpacity
                                        onPress={handleBillPlayer}
                                        className="flex-1 bg-emerald-500 py-3 rounded-xl items-center flex-row justify-center space-x-2"
                                    >
                                        <Share2 size={16} color="#064E3B" />
                                        <Text className="text-[#064E3B] font-black uppercase text-[10px] tracking-widest ml-2">COBRAR</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    onPress={() => setShowStatement(true)}
                                    className="flex-1 bg-slate-700 py-3 rounded-xl items-center flex-row justify-center space-x-2"
                                >
                                    <Receipt size={16} color="white" />
                                    <Text className="text-white font-black uppercase text-[10px] tracking-widest ml-2">EXTRATO</Text>
                                </TouchableOpacity>
                            </View>
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

                                {/* Function Selection */}
                                <View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">FUNÇÕES NO TIME</Text>
                                    <View className="bg-slate-50 p-4 rounded-xl space-y-4">
                                        {/* Athlete Toggle */}
                                        <View className="flex-row items-center justify-between">
                                            <View>
                                                <Text className="text-sm font-black italic text-slate-800">JOGADOR</Text>
                                                <Text className="text-[10px] text-slate-400 font-medium">Participa de partidas e estatísticas</Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => setIsAthlete(!isAthlete)}
                                                className={`w-12 h-7 rounded-full items-center flex-row px-1 ${isAthlete ? 'bg-[#006400]' : 'bg-slate-200'}`}
                                            >
                                                <View className={`w-5 h-5 rounded-full bg-white shadow-sm transform ${isAthlete ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                                            </TouchableOpacity>
                                        </View>

                                        {/* Staff Toggle */}
                                        {role !== 'owner' && (
                                            <View className="flex-row items-center justify-between pt-4 border-t border-slate-200">
                                                <View>
                                                    <Text className="text-sm font-black italic text-slate-800">STAFF / GESTÃO</Text>
                                                    <Text className="text-[10px] text-slate-400 font-medium">Pode editar dados e gerenciar jogos</Text>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => setIsStaff(!isStaff)}
                                                    className={`w-12 h-7 rounded-full items-center flex-row px-1 ${isStaff ? 'bg-slate-900' : 'bg-slate-200'}`}
                                                >
                                                    <View className={`w-5 h-5 rounded-full bg-white shadow-sm transform ${isStaff ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        {role === 'owner' && (
                                            <View className="flex-row items-center justify-between pt-4 border-t border-slate-200 opacity-50">
                                                <View>
                                                    <Text className="text-sm font-black italic text-slate-800">DONO DO TIME</Text>
                                                    <Text className="text-[10px] text-slate-400 font-medium">Acesso total (Imutável)</Text>
                                                </View>
                                                <View className="bg-slate-900 px-2 py-1 rounded">
                                                    <Text className="text-[8px] text-white font-bold">OWNER</Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                {isAthlete && (
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
                                )}

                                <View>
                                    <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 ml-1">STATUS</Text>
                                    <View className="flex-row bg-slate-50 p-1 rounded-xl">
                                        {[
                                            { id: 'active', label: 'ATIVO' },
                                            { id: 'inactive', label: 'INATIVO' }
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
                                        {paymentOptions.map((pm) => (
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
        </KeyboardAvoidingView >
    );
}
