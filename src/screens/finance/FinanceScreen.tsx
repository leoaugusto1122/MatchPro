import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, Text, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { Transaction, Player } from '@/types/models';
import { TransactionService } from '@/services/transactionService';
import { format, isSameDay, subDays, startOfMonth, isAfter } from 'date-fns';
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, X, CheckCircle } from 'lucide-react-native';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { db } from '@/services/firebase';
import { collection, getDocs, query } from 'firebase/firestore';

export default function FinanceScreen({ route }: any) {
    const teamId = useTeamStore(state => state.teamId);
    const { currentRole } = useTeamStore(state => state);
    const isAdmin = currentRole === 'owner' || currentRole === 'staff';

    const [loading, setLoading] = useState(true);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [playerMap, setPlayerMap] = useState<Record<string, string>>({});

    // Filters
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'pending'>('all');

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [txType, setTxType] = useState<'income' | 'expense'>('expense');
    const [desc, setDesc] = useState('');
    const [amount, setAmount] = useState('');

    useEffect(() => {
        if (route?.params?.action) {
            setEditId(null); // Ensure new
            setDesc('');
            setAmount('');
            if (route.params.action === 'new_income') {
                setTxType('income');
                setShowModal(true);
            } else if (route.params.action === 'new_expense') {
                setTxType('expense');
                setShowModal(true);
            }
            // Reset params to avoid reopening (optional, but good practice if nav persists)
            // In this custom nav, params might persist until overwritten.
        }
    }, [route?.params]);

    useEffect(() => {
        if (!teamId) return;
        setLoading(true);

        // Fetch Transactions
        const unsub = TransactionService.subscribeToAllTransactions(teamId, (data) => {
            setAllTransactions(data);
            setLoading(false);
        });

        // Fetch Players for Lookup
        const fetchPlayers = async () => {
            try {
                const q = query(collection(db, 'teams', teamId, 'players'));
                const snap = await getDocs(q);
                const map: Record<string, string> = {};
                snap.forEach(doc => {
                    const p = doc.data() as Player;
                    map[doc.id] = p.name;
                });
                setPlayerMap(map);
            } catch (e) {
                console.error("Error fetching players for finance lookup", e);
            }
        };
        fetchPlayers();

        return () => unsub();
    }, [teamId]);

    // Derived State
    const { filteredList, summary } = useMemo(() => {
        let list = [...allTransactions];
        const now = new Date();

        // 1. Filter by Date
        if (dateFilter === 'today') {
            list = list.filter(t => {
                const d = t.date?.seconds ? new Date(t.date.seconds * 1000) : null;
                return d && isSameDay(d, now);
            });
        } else if (dateFilter === 'week') {
            const lastWeek = subDays(now, 7);
            list = list.filter(t => {
                const d = t.date?.seconds ? new Date(t.date.seconds * 1000) : null;
                return d && isAfter(d, lastWeek);
            });
        } else if (dateFilter === 'month') {
            const startMonth = startOfMonth(now);
            list = list.filter(t => {
                const d = t.date?.seconds ? new Date(t.date.seconds * 1000) : null;
                return d && isAfter(d, startMonth);
            });
        }

        // 2. Filter by Type
        if (typeFilter === 'income') list = list.filter(t => t.type === 'income');
        if (typeFilter === 'expense') list = list.filter(t => t.type === 'expense');
        if (typeFilter === 'pending') list = list.filter(t => t.status === 'pending');

        // 3. Calculate Summary (Always based on FULL list for Balance, but filtered for Pending count?)
        // Requirement: "Saldo deve ser calculado dinamicamente em memória... dos dados do Firestore"
        // Usually Balance is total history. So we calculate balance from ALL transactions, not just filtered.

        let totalIncome = 0;
        let totalExpense = 0;
        let pendingCount = 0;

        allTransactions.forEach(t => {
            if (t.status === 'paid') {
                if (t.type === 'income') totalIncome += t.amount;
                if (t.type === 'expense') totalExpense += t.amount;
            } else if (t.status === 'pending') {
                pendingCount++;
            }
        });

        return {
            filteredList: list,
            summary: {
                balance: totalIncome - totalExpense,
                income: totalIncome,
                expense: totalExpense,
                pendingCount
            }
        };
    }, [allTransactions, dateFilter, typeFilter]);

    const handleEdit = (t: Transaction) => {
        if (!isAdmin) return;
        setEditId(t.id);
        setTxType(t.type);
        setDesc(t.description);
        setAmount(t.amount.toString());
        setShowModal(true);
    };

    const handleDelete = async () => {
        if (!editId || !teamId) return;
        Alert.alert('Excluir', 'Tem certeza?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Sim, excluir',
                style: 'destructive',
                onPress: async () => {
                    await TransactionService.deleteTransaction(teamId, editId);
                    setShowModal(false);
                    setEditId(null);
                }
            }
        ]);
    };

    // New Function to Receive Payment
    const handleReceivePayment = async (t: Transaction) => {
        if (!teamId) return;
        Alert.alert(
            'Receber Pagamento',
            `Confirmar o recebimento de R$ ${t.amount.toFixed(2)} referente a " ${t.description} "?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar Recebimento',
                    onPress: async () => {
                        try {
                            await TransactionService.markAsPaid(teamId, t.id);
                            Alert.alert("Sucesso", "Pagamento recebido!");
                        } catch (e) {
                            Alert.alert("Erro", "Falha ao receber pagamento.");
                        }
                    }
                }
            ]
        );
    };

    const handleSave = async () => {
        if (!amount || !desc || !teamId) return;
        try {
            const val = parseFloat(amount.replace(',', '.'));

            if (editId) {
                // Update
                await TransactionService.updateTransaction(teamId, editId, {
                    type: txType,
                    amount: val,
                    description: desc
                });
                Alert.alert('Sucesso', 'Lançamento atualizado!');
            } else {
                // Create
                await TransactionService.createTransaction(teamId, {
                    type: txType,
                    amount: val,
                    description: desc,
                    category: 'other',
                    date: new Date(),
                    status: 'paid'
                } as any);
                Alert.alert('Sucesso', 'Lançamento registrado!');
            }
            setShowModal(false);
            setEditId(null);
            setAmount('');
            setDesc('');
        } catch (error) {
            Alert.alert('Erro', 'Falha ao salvar.');
        }
    };

    if (loading && allTransactions.length === 0) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#F8FAFC] pt-10">
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Header */}
                <View className="px-6 mb-6">
                    <Header title="CAIXA" subtitle="Gestão Financeira" />
                </View>

                {/* Dashboard Cards */}
                <View className="px-6 mb-6">
                    <View className="bg-[#0F172A] p-6 rounded-3xl overflow-hidden shadow-lg shadow-slate-300">
                        <View className="absolute -right-4 -bottom-4 opacity-10">
                            <Wallet size={120} color="white" />
                        </View>
                        <Text className="text-white/60 font-black italic text-[10px] uppercase tracking-[0.2em] mb-1">SALDO ATUAL</Text>
                        <Text className={`text-4xl font-black italic mb-6 ${summary.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                            R$ {summary.balance.toFixed(2)}
                        </Text>

                        <View className="flex-row gap-4">
                            <View className="flex-1 bg-white/10 p-3 rounded-xl">
                                <View className="flex-row items-center mb-1">
                                    <TrendingUp size={12} color="#4ADE80" />
                                    <Text className="text-white/80 font-bold text-[10px] uppercase ml-1">Entradas</Text>
                                </View>
                                <Text className="text-white font-black">R$ {summary.income.toFixed(2)}</Text>
                            </View>
                            <View className="flex-1 bg-white/10 p-3 rounded-xl">
                                <View className="flex-row items-center mb-1">
                                    <TrendingDown size={12} color="#F87171" />
                                    <Text className="text-white/80 font-bold text-[10px] uppercase ml-1">Saídas</Text>
                                </View>
                                <Text className="text-white font-black">R$ {summary.expense.toFixed(2)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Pending Alert */}
                {summary.pendingCount > 0 && (
                    <TouchableOpacity onPress={() => setTypeFilter('pending')} className="mx-6 mb-6 bg-amber-100 p-4 rounded-xl flex-row items-center border border-amber-200">
                        <AlertTriangle size={20} color="#D97706" />
                        <View className="ml-3 flex-1">
                            <Text className="text-amber-800 font-bold text-xs uppercase">Atenção Necessária</Text>
                            <Text className="text-amber-900 font-black italic text-sm">Existe(m) {summary.pendingCount} pendência(s).</Text>
                        </View>
                        <Text className="text-amber-700 font-bold text-[10px] underline">Ver Lista</Text>
                    </TouchableOpacity>
                )}

                {/* Filters */}
                <View className="px-6 mb-4">
                    <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-3">Filtros</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
                        {/* Date Filters */}
                        {[
                            { label: 'Todos', value: 'all' },
                            { label: 'Hoje', value: 'today' },
                            { label: '7 Dias', value: 'week' },
                            { label: 'Mês', value: 'month' },
                        ].map(f => (
                            <TouchableOpacity
                                key={f.value}
                                onPress={() => setDateFilter(f.value as any)}
                                className={`px-4 py-2 rounded-full border ${dateFilter === f.value ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                            >
                                <Text className={`text-[10px] font-bold uppercase ${dateFilter === f.value ? 'text-white' : 'text-slate-500'}`}>{f.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2 mt-2">
                        {/* Type Filters */}
                        {[
                            { label: 'Tudo', value: 'all' },
                            { label: 'Entradas', value: 'income' },
                            { label: 'Saídas', value: 'expense' },
                            { label: 'Pendentes', value: 'pending' },
                        ].map(f => (
                            <TouchableOpacity
                                key={f.value}
                                onPress={() => setTypeFilter(f.value as any)}
                                className={`px-4 py-2 rounded-full border ${typeFilter === f.value ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                            >
                                <Text className={`text-[10px] font-bold uppercase ${typeFilter === f.value ? 'text-white' : 'text-slate-500'}`}>{f.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Transactions List */}
                <View className="px-6 gap-3">
                    {filteredList.length === 0 ? (
                        <Text className="text-center text-slate-400 italic text-xs py-10">Nenhum lançamento encontrado.</Text>
                    ) : (
                        filteredList.map(t => (
                            <TouchableOpacity
                                key={t.id}
                                activeOpacity={isAdmin ? 0.7 : 1}
                                onPress={() => isAdmin && handleEdit(t)}
                            >
                                <Card className="p-4 flex-row items-center border-l-4 border-l-transparent" style={{ borderLeftColor: t.status === 'pending' ? '#F59E0B' : t.type === 'income' ? '#10B981' : '#EF4444' }}>
                                    <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${t.type === 'income' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                        {t.type === 'income' ? <TrendingUp size={16} color="#10B981" /> : <TrendingDown size={16} color="#EF4444" />}
                                    </View>
                                    <View className="flex-1 pr-2">
                                        <Text className="font-bold text-slate-800 text-xs uppercase" numberOfLines={1}>{t.description}</Text>

                                        {/* Player Name if available */}
                                        {t.playerId && playerMap[t.playerId] && (
                                            <Text className="text-[10px] text-slate-500 italic mt-0.5">
                                                Pago por: <Text className="font-bold">{playerMap[t.playerId]}</Text>
                                            </Text>
                                        )}

                                        <Text className="text-[10px] text-slate-400 font-bold mt-0.5">
                                            {t.date && t.date.seconds ? format(new Date(t.date.seconds * 1000), 'dd/MM') : 'Hoje'} • <Text className={t.status === 'pending' ? 'text-amber-500' : 'text-slate-500'}>{t.status === 'pending' ? 'PENDENTE' : 'PAGO'}</Text>
                                        </Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className={`font-black italic text-sm text-right ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {t.type === 'income' ? '+' : '-'} R$ {Number(t.amount).toFixed(2)}
                                        </Text>

                                        {/* Action Buttons Row */}
                                        <View className="flex-row items-center mt-2 gap-2">
                                            {isAdmin && t.status === 'pending' && t.type === 'income' && (
                                                <TouchableOpacity
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        handleReceivePayment(t);
                                                    }}
                                                    className="bg-emerald-100 flex-row items-center px-2 py-1 rounded-full"
                                                >
                                                    <CheckCircle size={10} color="#059669" />
                                                    <Text className="text-[8px] font-bold text-emerald-700 ml-1 uppercase">RECEBER</Text>
                                                </TouchableOpacity>
                                            )}

                                            {isAdmin && <Text className="text-[8px] text-slate-300 font-bold uppercase">Editar</Text>}
                                        </View>
                                    </View>
                                </Card>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            </ScrollView>

            {/* Modal */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View className="flex-1 bg-black/60 justify-end">
                    <View className="bg-white p-6 rounded-t-3xl">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-black italic text-slate-900 uppercase">
                                {editId ? 'Editar Lançamento' : (txType === 'income' ? 'Nova Entrada' : 'Nova Saída')}
                            </Text>
                            <View className="flex-row gap-2">
                                {editId && (
                                    <TouchableOpacity onPress={handleDelete} className="bg-red-100 p-2 rounded-full">
                                        <Text className="text-red-600 font-bold text-[10px] px-2">EXCLUIR</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={() => { setShowModal(false); setEditId(null); }} className="bg-slate-100 p-2 rounded-full">
                                    <X size={20} color="#64748B" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Descrição</Text>
                        <TextInput
                            value={desc}
                            onChangeText={setDesc}
                            className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 mb-4 font-bold text-slate-800"
                            placeholder="Ex: Aluguel, Patrocínio"
                        />

                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Valor (R$)</Text>
                        <TextInput
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                            className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 mb-6 font-bold text-slate-800"
                            placeholder="0.00"
                        />

                        <TouchableOpacity onPress={handleSave} className={`py-4 rounded-xl items-center ${txType === 'income' ? 'bg-emerald-600' : 'bg-red-500'}`}>
                            <Text className="text-white font-black italic text-sm uppercase tracking-widest">
                                {editId ? 'Salvar Alterações' : 'Confirmar'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
