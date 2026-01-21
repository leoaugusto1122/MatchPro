import React, { useEffect, useState } from 'react';
import { View, FlatList, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { db } from '@/services/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Match } from '@/types/models';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Clock } from 'lucide-react-native';

import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function MatchesScreen({ navigation }: any) {
    const teamId = useTeamStore(state => state.teamId);

    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('upcoming'); // upcoming | past

    useEffect(() => {
        if (!teamId) return;

        setLoading(true);
        const q = query(collection(db, 'teams', teamId, 'matches'), orderBy('date', viewMode === 'upcoming' ? 'asc' : 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Match[] = [];
            const now = new Date();

            snapshot.forEach((doc) => {
                const data = doc.data();
                const matchDate = data.date?.toDate ? data.date.toDate() : new Date(data.date);

                if (viewMode === 'upcoming') {
                    if (matchDate >= now) {
                        list.push({ id: doc.id, ...data, date: matchDate } as Match);
                    }
                } else {
                    if (matchDate < now) {
                        list.push({ id: doc.id, ...data, date: matchDate } as Match);
                    }
                }
            });
            setMatches(list);
            setLoading(false);
        }, (error) => {
            console.error(error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [teamId, viewMode]);



    const renderItem = ({ item }: { item: Match }) => (
        <Card className="mb-4" onTouchEnd={() => navigation.navigate('MatchDetails', { matchId: item.id, mode: 'view' })}>
            <View className="flex-row justify-between mb-2">
                <Badge
                    label={item.status === 'finished' ? 'FINALIZADA' : (item.status === 'scheduled' ? 'AGENDADA' : 'CANCELADA')}
                    color={item.status === 'finished' ? 'bg-slate-900' : (item.status === 'canceled' ? 'bg-red-100' : 'bg-emerald-100')}
                    textColor={item.status === 'finished' ? 'text-white' : (item.status === 'canceled' ? 'text-red-600' : 'text-emerald-800')}
                />
                <Text className="text-xs font-bold text-slate-400">
                    {format(item.date, "dd MMM HH:mm", { locale: ptBR }).toUpperCase()}
                </Text>
            </View>

            <View className="flex-row items-center justify-between mt-2">
                <Text className="text-xl font-black italic text-slate-800 uppercase flex-1">
                    VS {item.opponent || 'Adversário'}
                </Text>

                {item.status === 'finished' && (
                    <View className="bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                        <Text className="text-2xl font-black italic text-slate-900">
                            {item.scoreHome} - {item.scoreAway}
                        </Text>
                    </View>
                )}
            </View>

            <View className="flex-row items-center mt-3">
                <MapPin size={12} color="#94A3B8" />
                <Text className="text-xs font-bold text-slate-500 ml-1 uppercase">{item.location || 'Local a definir'}</Text>
            </View>
        </Card>
    );

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#F8FAFC] pt-12 px-5">
            <Header title="PARTIDAS" subtitle="Agenda de Jogos" />

            <View className="flex-row bg-white p-1 rounded-2xl border border-slate-100 mb-6">
                <TouchableOpacity
                    className={`flex-1 py-3 rounded-xl items-center ${viewMode === 'upcoming' ? 'bg-slate-900' : 'bg-transparent'}`}
                    onPress={() => setViewMode('upcoming')}
                >
                    <Text className={`font-bold text-xs uppercase tracking-widest ${viewMode === 'upcoming' ? 'text-white' : 'text-slate-400'}`}>Próximas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    className={`flex-1 py-3 rounded-xl items-center ${viewMode === 'past' ? 'bg-slate-900' : 'bg-transparent'}`}
                    onPress={() => setViewMode('past')}
                >
                    <Text className={`font-bold text-xs uppercase tracking-widest ${viewMode === 'past' ? 'text-white' : 'text-slate-400'}`}>Resultados</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={matches}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View className="py-10 items-center">
                        <Clock size={48} color="#CBD5E1" />
                        <Text className="text-slate-400 mt-4 font-medium italic">Nenhuma partida encontrada.</Text>
                    </View>
                }
            />


        </View>
    );
}
