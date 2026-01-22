import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { useAuthStore } from '@/stores/authStore';
import { MemberService } from '@/services/memberService';
import { Header } from '@/components/ui/Header';
import { Player, MemberHistory } from '@/types/models';
import { Trash2, UserPlus, LogOut, XCircle } from 'lucide-react-native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function TeamMembersScreen({ navigation }: any) {
    const { teamId, currentRole, myPlayerProfile } = useTeamStore();
    const { authUser } = useAuthStore();
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
    const [members, setMembers] = useState<Player[]>([]);
    const [history, setHistory] = useState<MemberHistory[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, [activeTab, teamId]);

    const loadData = async () => {
        if (!teamId) return;
        setLoading(true);
        try {
            if (activeTab === 'active') {
                const data = await MemberService.getActiveMembers(teamId);
                // Sort by role (Owner first, then Staff, then Player) and then name
                setMembers(data.sort((a, b) => {
                    const rolePriority = { owner: 3, coach: 2, staff: 2, player: 1 };
                    const roleA = rolePriority[a.role || 'player'] || 0;
                    const roleB = rolePriority[b.role || 'player'] || 0;
                    if (roleA !== roleB) return roleB - roleA;
                    return a.name.localeCompare(b.name);
                }));
            } else {
                const data = await MemberService.getHistory(teamId);
                setHistory(data);
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Erro", "Falha ao carregar dados.");
        } finally {
            setLoading(false);
        }
    };

    const handleKick = (player: Player) => {
        if (currentRole !== 'owner') return;
        if (player.id === myPlayerProfile?.id) {
            Alert.alert("Erro", "Você não pode expulsar a si mesmo.");
            return;
        }

        Alert.alert(
            "Expulsar Membro",
            `Deseja realmente expulsar ${player.name} do time? Essa ação removerá o acesso dele mas manterá o histórico financeiro e estatístico.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Expulsar",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const currentUserData = {
                                id: authUser?.uid || 'unknown',
                                name: myPlayerProfile?.name || 'Dono'
                            };
                            await MemberService.kickMember(teamId!, player, currentUserData);
                            Alert.alert("Sucesso", `${player.name} foi removido do time.`);
                            loadData(); // Refresh list
                        } catch (error) {
                            Alert.alert("Erro", "Não foi possível expulsar o jogador.");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const renderMemberItem = ({ item }: { item: Player }) => {
        const isMe = item.id === myPlayerProfile?.id;
        const canKick = currentRole === 'owner' && !isMe;

        return (
            <View className="flex-row items-center justify-between p-4 bg-white mb-2 rounded-2xl border border-slate-100">
                <View className="flex-row items-center flex-1">
                    <View className="w-10 h-10 rounded-full bg-slate-100 items-center justify-center mr-3 overflow-hidden">
                        {item.photoURL ? (
                            <Image source={{ uri: item.photoURL }} className="w-full h-full" />
                        ) : (
                            <Text className="font-bold text-slate-400 text-sm">
                                {item.name.substring(0, 2).toUpperCase()}
                            </Text>
                        )}
                    </View>
                    <View>
                        <Text className="font-bold text-slate-800 text-sm">{item.name}</Text>
                        <View className="flex-row items-center">
                            <Text className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full self-start mt-1 
                                ${item.role === 'owner' ? 'bg-yellow-100 text-yellow-700' :
                                    item.role === 'staff' || item.role === 'coach' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                {item.role === 'owner' ? 'Dono' : item.role === 'coach' ? 'Técnico' : item.role === 'staff' ? 'Staff' : 'Jogador'}
                            </Text>
                        </View>
                    </View>
                </View>

                {canKick && (
                    <TouchableOpacity
                        onPress={() => handleKick(item)}
                        className="p-2 bg-red-50 rounded-xl"
                    >
                        <Trash2 size={18} color="#EF4444" />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const renderHistoryItem = ({ item }: { item: MemberHistory }) => {
        let icon = <UserPlus size={20} color="#22C55E" />;
        let bgColor = "bg-green-100";
        let text = `${item.playerName} entrou no time`;

        if (item.action === 'LEAVE') {
            icon = <LogOut size={20} color="#64748B" />;
            bgColor = "bg-slate-100";
            text = `${item.playerName} saiu do time`;
        } else if (item.action === 'KICK') {
            icon = <XCircle size={20} color="#EF4444" />;
            bgColor = "bg-red-100";
            text = `${item.playerName} foi expulso por ${item.performedByName || 'Admin'}`;
        }

        const dateStr = item.createdAt?.seconds
            ? format(new Date(item.createdAt.seconds * 1000), "d 'de' MMMM", { locale: ptBR })
            : 'Recentemente';

        return (
            <View className="flex-row items-center p-4 bg-white mb-2 rounded-2xl border border-slate-100">
                <View className={`w-10 h-10 rounded-full ${bgColor} items-center justify-center mr-3`}>
                    {icon}
                </View>
                <View className="flex-1">
                    <Text className="font-bold text-slate-800 text-xs mb-1">{text}</Text>
                    <Text className="text-[10px] text-slate-400 font-medium">{dateStr}</Text>
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1 bg-[#F8FAFC]">
            <Header title="Gestão de Membros" onBack={() => navigation.goBack()} />

            <View className="flex-row px-6 mt-4 mb-4">
                <TouchableOpacity
                    onPress={() => setActiveTab('active')}
                    className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'active' ? 'border-[#006400]' : 'border-transparent'}`}
                >
                    <Text className={`text-xs font-black uppercase tracking-widest ${activeTab === 'active' ? 'text-[#006400]' : 'text-slate-300'}`}>
                        Membros Ativos
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setActiveTab('history')}
                    className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'history' ? 'border-[#006400]' : 'border-transparent'}`}
                >
                    <Text className={`text-xs font-black uppercase tracking-widest ${activeTab === 'history' ? 'text-[#006400]' : 'text-slate-300'}`}>
                        Histórico
                    </Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#006400" />
                </View>
            ) : (
                <FlatList
                    data={(activeTab === 'active' ? members : history) as any[]}
                    keyExtractor={(item) => item.id}
                    renderItem={activeTab === 'active' ? renderMemberItem as any : renderHistoryItem as any}
                    contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-10">
                            <Text className="text-slate-400">Nenhum registro encontrado.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}
