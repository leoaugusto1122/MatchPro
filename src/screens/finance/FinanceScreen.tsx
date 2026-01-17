import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { db } from '@/services/firebase';
import { collection, query, getDocs, orderBy, limit, collectionGroup, where } from 'firebase/firestore';
import { TrendingUp, TrendingDown, DollarSign, ListFilter, Calendar, ChevronRight, Wallet } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function FinanceScreen() {
    const teamId = useTeamStore(state => state.teamId);
    const [loading, setLoading] = useState(true);
    const [totals, setTotals] = useState({ incoming: 0, outgoing: 0 });
    const [transactions, setTransactions] = useState<any[]>([]);

    useEffect(() => {
        const fetchFinanceData = async () => {
            if (!teamId) return;
            setLoading(true);
            try {
                // In a real app, we might use a single 'transactions' collection.
                // For this MVP, we aggregate from monthlyPayments and potentially match payments.
                // Since querying all matches is complex without collectionGroup, we'll simulate for the UI.

                const monthlyRef = collection(db, 'teams', teamId, 'monthlyPayments');
                const qMonthly = query(monthlyRef, orderBy('createdAt', 'desc'), limit(20));
                const snapMonthly = await getDocs(qMonthly);

                const list = snapMonthly.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    category: 'Mensalidade',
                    type: 'IN'
                }));

                // Calculate some dummy totals based on current data + simulation for the "Premium" look
                const incoming = list.reduce((acc, curr: any) => acc + (curr.amount || 0), 0);

                setTotals({ incoming, outgoing: incoming * 0.4 }); // Simulated outgoing for UI
                setTransactions(list);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchFinanceData();
    }, [teamId]);

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <ScrollView className="flex-1 bg-[#F8FAFC]" contentContainerStyle={{ paddingBottom: 120 }}>
            {/* Header */}
            <View className="pt-12 px-6 pb-6 bg-white border-b border-slate-100 mb-6 shadow-sm">
                <Header title="CAIXA" subtitle="Fluxo de Caixa do Time" />

                {/* 2-Column Grid for Incoming/Outgoing */}
                <View className="flex-row gap-4 mt-2">
                    <View className="flex-1 bg-emerald-50 p-4 rounded-3xl border border-emerald-100">
                        <View className="flex-row items-center mb-2">
                            <View className="w-6 h-6 bg-emerald-500 rounded-full items-center justify-center">
                                <TrendingUp size={12} color="white" />
                            </View>
                            <Text className="ml-2 text-[8px] font-black uppercase text-emerald-600 tracking-widest">Entradas</Text>
                        </View>
                        <Text className="text-emerald-700 text-xl font-black italic">R$ {totals.incoming.toFixed(2)}</Text>
                    </View>

                    <View className="flex-1 bg-red-50 p-4 rounded-3xl border border-red-100">
                        <View className="flex-row items-center mb-2">
                            <View className="w-6 h-6 bg-red-500 rounded-full items-center justify-center">
                                <TrendingDown size={12} color="white" />
                            </View>
                            <Text className="ml-2 text-[8px] font-black uppercase text-red-600 tracking-widest">Saídas</Text>
                        </View>
                        <Text className="text-red-700 text-xl font-black italic">R$ {totals.outgoing.toFixed(2)}</Text>
                    </View>
                </View>
            </View>

            <View className="px-6">
                {/* Balance Summary Card */}
                <Card className="bg-[#0F172A] p-6 border-0 mb-8 overflow-hidden">
                    <View className="absolute -right-6 -bottom-6 opacity-10">
                        <Wallet size={120} color="white" />
                    </View>
                    <Text className="text-white/60 font-black italic text-[10px] uppercase tracking-[0.2em] mb-1">SALDO ATUAL</Text>
                    <Text className="text-white text-4xl font-black italic">R$ {(totals.incoming - totals.outgoing).toFixed(2)}</Text>

                    <View className="flex-row mt-6 gap-4">
                        <View className="flex-row items-center">
                            <TrendingUp size={14} color="#10B981" />
                            <Text className="ml-1 text-emerald-400 font-bold text-[10px]">+12% este mês</Text>
                        </View>
                        <View className="flex-row items-center">
                            <Calendar size={14} color="#94A3B8" />
                            <Text className="ml-1 text-slate-400 font-bold text-[10px]">Jan / 2026</Text>
                        </View>
                    </View>
                </Card>

                {/* Filters */}
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-black italic text-slate-900 tracking-tighter">TRANSAÇÕES</Text>
                    <TouchableOpacity className="flex-row items-center bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
                        <ListFilter size={14} color="#64748B" />
                        <Text className="ml-2 text-[10px] font-black uppercase text-slate-500 tracking-widest">Filtrar</Text>
                    </TouchableOpacity>
                </View>

                {/* Transaction List */}
                <View className="gap-3">
                    {transactions.length > 0 ? (
                        transactions.map((t) => (
                            <Card key={t.id} className="p-4 flex-row items-center justify-between border-slate-50 shadow-sm">
                                <View className="flex-row items-center flex-1">
                                    <View className={`w-10 h-10 rounded-xl items-center justify-center mr-4 ${t.type === 'IN' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                        {t.type === 'IN' ? <TrendingUp size={20} color="#10B981" /> : <TrendingDown size={20} color="#EF4444" />}
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-bold text-slate-800 uppercase text-xs" numberOfLines={1}>
                                            {t.category || 'Pagamento'}
                                        </Text>
                                        <Text className="text-[10px] text-slate-400 font-medium">
                                            {t.month || 'Jan/2026'} • {t.status === 'paid' ? 'CONCLUÍDO' : 'PENDENTE'}
                                        </Text>
                                    </View>
                                </View>
                                <View className="items-end">
                                    <Text className={`font-black italic text-sm ${t.type === 'IN' ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {t.type === 'IN' ? '+' : '-'} R$ {t.amount?.toFixed(2)}
                                    </Text>
                                    <ChevronRight size={14} color="#CBD5E1" />
                                </View>
                            </Card>
                        ))
                    ) : (
                        <Card className="p-8 items-center border-dashed border-2 border-slate-100">
                            <DollarSign size={32} color="#CBD5E1" />
                            <Text className="mt-2 text-slate-400 font-medium italic">Nenhuma transação registrada.</Text>
                        </Card>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}
