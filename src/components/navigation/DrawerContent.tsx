import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useTeamStore } from '@/stores/teamStore';
import { Home, Users, Bell, User, LogOut, Shield, Settings, Wallet, Trophy, Activity, DollarSign, RefreshCw, Power } from 'lucide-react-native';
import { auth, db } from '@/services/firebase';
import { doc, updateDoc, arrayRemove, deleteField } from 'firebase/firestore';
import { MemberService } from '@/services/memberService';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function DrawerContent(props: any) {
    const { onNavigate } = props;
    const { teamId, teamName, currentRole, clearTeamContext, myPlayerProfile } = useTeamStore();
    const insets = useSafeAreaInsets();

    const handleLogout = async () => {
        try {
            await auth.signOut();
            clearTeamContext();
            props.navigation.closeDrawer();
        } catch (error) {
            console.error(error);
        }
    };

    const handleSwitchTeam = () => {
        clearTeamContext();
        props.navigation.closeDrawer();
        if (onNavigate) onNavigate('TeamSelection');
    };

    const handleExitTeam = () => {
        Alert.alert(
            "Sair do Time",
            `Tem certeza que deseja sair do time "${teamName || 'Seu Time'}"? Você precisará de um convite para entrar novamente.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sair",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            if (!auth.currentUser || !teamId) return;

                            const userId = auth.currentUser.uid;

                            // Log BEFORE removing access
                            if (myPlayerProfile) {
                                await MemberService.logEvent(teamId, 'LEAVE', {
                                    id: myPlayerProfile.id,
                                    name: myPlayerProfile.name,
                                    userId: userId
                                });
                            }

                            // Remove access
                            const teamRef = doc(db, 'teams', teamId);
                            await updateDoc(teamRef, {
                                memberIds: arrayRemove(userId),
                                [`members.${userId}`]: deleteField()
                            });

                            clearTeamContext();
                            props.navigation.closeDrawer();
                            if (onNavigate) onNavigate('TeamSelection');
                        } catch (error) {
                            console.error("Error exiting team:", error);
                            Alert.alert("Erro", "Falha ao sair do time.");
                        }
                    }
                }
            ]
        );
    };
    // ... (keep all other handlers unchanged until return)

    const getRoleLabel = () => {
        if (currentRole === 'owner') return 'Dono do Time';
        if (currentRole === 'staff') return 'Staff';
        if (currentRole === 'coach') return 'Técnico';
        return 'Jogador';
    };

    const getRoleColor = () => {
        if (currentRole === 'owner') return 'bg-yellow-400';
        if (currentRole === 'staff') return 'bg-purple-400';
        if (currentRole === 'coach') return 'bg-blue-400';
        return 'bg-emerald-400';
    }

    return (
        <View className="flex-1 bg-[#111827]">
            <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
                {/* Header Profile Section */}
                <View
                    className="pb-8 px-6 bg-[#0F172A] mb-2 border-b border-slate-800"
                    style={{ paddingTop: Math.max(insets.top, 20) + 20 }}
                >
                    <View className="flex-row items-center mb-6">
                        <View className="w-14 h-14 bg-slate-800 rounded-2xl items-center justify-center border border-slate-700 shadow-xl overflow-hidden mr-4">
                            {/* Shield or Team Logo could go here */}
                            <Shield size={28} color="#94A3B8" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Logado em</Text>
                            <Text className="text-white text-xl font-black italic tracking-tighter leading-6" numberOfLines={1}>
                                {teamName || 'Seu Time'}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row gap-2">
                        <View className="flex-row items-center px-3 py-1.5 bg-slate-800 rounded-full border border-slate-700 self-start">
                            <View className={`w-1.5 h-1.5 rounded-full mr-2 ${getRoleColor()}`} />
                            <Text className="text-slate-300 text-[10px] font-black uppercase tracking-wider">
                                {getRoleLabel()}
                            </Text>
                        </View>
                        {currentRole === 'owner' && (
                            <View className="flex-row items-center px-3 py-1.5 bg-yellow-900/20 rounded-full border border-yellow-700/30 self-start">
                                <Text className="text-yellow-500 text-[10px] font-black uppercase tracking-wider">ADMIN</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Menu Items */}
                <View className="px-3">
                    <Text className="ml-4 mb-2 text-[10px] font-black uppercase text-slate-400 tracking-widest mt-2">Navegação Geral</Text>
                    <DrawerItem
                        icon={Home}
                        label="Home"
                        onPress={() => {
                            // Navigate to Main with Dashboard tab
                            if (onNavigate) onNavigate('Main', { tab: 'Dashboard' });
                            props.navigation.closeDrawer();
                        }}
                        active={false}
                    />
                    <DrawerItem
                        icon={Users}
                        label="Meus Times"
                        onPress={handleSwitchTeam}
                        active={false}
                    />
                    <DrawerItem
                        icon={Bell}
                        label="Alertas"
                        onPress={() => {
                            props.navigation.closeDrawer();
                            if (onNavigate) onNavigate('Alerts');
                        }}
                        active={false}
                    />
                    <DrawerItem
                        icon={User}
                        label="Meu Perfil"
                        onPress={() => {
                            props.navigation.closeDrawer();
                            if (onNavigate) onNavigate('ProfileSetup');
                        }}
                        active={false}
                    />

                    {/* SEÇÃO 2 - CONTEXTO DO TIME */}
                    <View className="mt-6 mb-2">
                        <View className="h-[1px] bg-slate-100 mx-4 mb-4" />
                        <Text className="ml-4 mb-2 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            {currentRole === 'owner' ? 'Administração' : currentRole === 'player' ? 'Menu do Atleta' : 'Gestão'}
                        </Text>
                    </View>

                    {/* OWNER ACTIONS */}
                    {currentRole === 'owner' && (
                        <>
                            <DrawerItem
                                icon={Settings}
                                label="Configurações"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    if (onNavigate) onNavigate('TeamSettings');
                                }}
                                active={false}
                            />
                            <DrawerItem
                                icon={Users}
                                label="Gestão de Membros"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    if (onNavigate) onNavigate('TeamMembers');
                                }}
                                active={false}
                            />
                            <DrawerItem
                                icon={Wallet}
                                label="Financeiro"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    if (onNavigate) onNavigate('Main', { tab: 'Financeiro' });
                                }}
                                active={false}
                            />
                            {/* History implicit in Alerts/Matches for now ?? Or maybe Matches? */}
                            {/* Prompt asked for History. Let's redirect to Matches or Alerts. Owner usually checks Matches for history. */}
                        </>
                    )}

                    {/* STAFF actions */}
                    {(currentRole === 'staff' || currentRole === 'coach') && (
                        <>
                            <DrawerItem
                                icon={Users}
                                label="Elenco"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    if (onNavigate) onNavigate('Main', { tab: 'Elenco' });
                                }}
                                active={false}
                            />
                            <DrawerItem
                                icon={Trophy}
                                label="Partidas"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    if (onNavigate) onNavigate('Main', { tab: 'Partidas' });
                                }}
                                active={false}
                            />
                            <DrawerItem
                                icon={Wallet}
                                label="Financeiro"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    if (onNavigate) onNavigate('Main', { tab: 'Financeiro' });
                                }}
                                active={false}
                            />
                        </>
                    )}

                    {/* PLAYER actions */}
                    {currentRole === 'player' && (
                        <>
                            <DrawerItem
                                icon={Trophy}
                                label="Partidas"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    if (onNavigate) onNavigate('Main', { tab: 'Partidas' });
                                }}
                                active={false}
                            />
                            <DrawerItem
                                icon={Activity}
                                label="Minhas Estatísticas"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    // Navigate to PlayerDetails in 'view' mode for self
                                    // Use 'myPlayerProfile' from store if available, else try to find by auth logic?
                                    // We'll rely on store having it.
                                    if (onNavigate) onNavigate('PlayerDetails', { playerId: useTeamStore.getState().myPlayerProfile?.id, mode: 'view' });
                                }}
                                active={false}
                            />
                            <DrawerItem
                                icon={DollarSign}
                                label="Meus Pagamentos"
                                onPress={() => {
                                    props.navigation.closeDrawer();
                                    if (onNavigate) onNavigate('PlayerDetails', { playerId: useTeamStore.getState().myPlayerProfile?.id, mode: 'view' });
                                }}
                                active={false}
                            />
                        </>
                    )}

                </View>
            </DrawerContentScrollView>

            {/* SEÇÃO 3 -- AÇÕES CRÍTICAS */}
            <View className="p-4 border-t border-slate-800 mb-6 bg-[#0F172A]">
                <Text className="ml-4 mb-2 text-[10px] font-black uppercase text-slate-500 tracking-widest">Ações da Conta</Text>

                {/* 1. Trocar de Time */}
                <TouchableOpacity
                    onPress={handleSwitchTeam}
                    className="flex-row items-center p-3 rounded-xl mb-1 active:bg-slate-800"
                >
                    <RefreshCw size={20} color="#94A3B8" />
                    <Text className="ml-4 font-bold text-sm uppercase tracking-wider text-slate-400">
                        Trocar de Time
                    </Text>
                </TouchableOpacity>

                {/* 2. Sair do Time (Permanente) */}
                {currentRole !== 'owner' && (
                    <TouchableOpacity
                        onPress={handleExitTeam}
                        className="flex-row items-center p-3 rounded-xl mb-1 active:bg-red-900/20 group"
                    >
                        <LogOut size={20} color="#EF4444" />
                        <Text className="ml-4 font-bold text-sm uppercase tracking-wider text-red-500">
                            Sair do Time
                        </Text>
                    </TouchableOpacity>
                )}

                {/* 3. Deslogar */}
                <TouchableOpacity
                    onPress={handleLogout}
                    className="flex-row items-center p-3 rounded-xl active:bg-slate-800"
                >
                    <Power size={20} color="#94A3B8" />
                    <Text className="ml-4 font-bold text-sm uppercase tracking-wider text-slate-500">
                        Deslogar
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const DrawerItem = ({ icon: Icon, label, onPress, active }: any) => (
    <TouchableOpacity
        onPress={onPress}
        className={`flex-row items-center p-4 rounded-xl mb-1 ${active ? 'bg-slate-800 border border-slate-700' : 'transparent border border-transparent'}`}
    >
        <Icon size={20} color={active ? '#4ADE80' : '#94A3B8'} strokeWidth={active ? 2.5 : 2} />
        <Text className={`ml-4 font-bold text-sm uppercase tracking-wider ${active ? 'text-white' : 'text-slate-400'}`}>
            {label}
        </Text>
    </TouchableOpacity>
);
