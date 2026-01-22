import React, { useEffect, useState } from 'react';
import { View, ScrollView, Alert, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { db } from '@/services/firebase';
import { doc, getDoc, Timestamp, setDoc } from 'firebase/firestore';
import { Match, Player } from '@/types/models';
import { ChevronLeft, Send } from 'lucide-react-native';
import { AlertService } from '@/services/alertService';

export default function MatchVotingScreen({ route, navigation }: any) {
    const { matchId } = route.params;
    const teamId = useTeamStore(state => state.teamId);
    const myPlayerProfile = useTeamStore(state => state.myPlayerProfile);

    // State
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [hasVoted, setHasVoted] = useState(false);

    const [candidates, setCandidates] = useState<Player[]>([]);
    const [votes, setVotes] = useState<Record<string, number>>({}); // targetPlayerId -> rating

    // Crowd Vote State
    const [bestPlayerVote, setBestPlayerVote] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [matchId, teamId]);

    const loadData = async () => {
        if (!teamId || !matchId || !myPlayerProfile) return;
        setLoading(true);
        try {
            // ... (existing match fetch ) ...
            const matchRef = doc(db, 'teams', teamId, 'matches', matchId);
            const matchSnap = await getDoc(matchRef);
            if (!matchSnap.exists()) {
                Alert.alert("Erro", "Partida não encontrada.");
                navigation.goBack();
                return;
            }
            const matchData = matchSnap.data() as Match;

            // ... (eligibility checks) ...
            const myPresence = matchData.presence?.[myPlayerProfile.id];
            const myStats = matchData.stats?.[myPlayerProfile.id];

            if (myPresence?.status !== 'confirmed') {
                Alert.alert("Acesso Negado", "Apenas jogadores confirmados podem votar.");
                navigation.goBack();
                return;
            }
            // Ensure it is an Athlete voting
            if (!myPlayerProfile.isAthlete) {
                Alert.alert("Acesso Negado", "Apenas jogadores podem votar.");
                navigation.goBack();
                return;
            }
            if (myStats?.faltou) {
                Alert.alert("Acesso Negado", "Você foi marcado como ausente e não pode votar.");
                navigation.goBack();
                return;
            }

            // ... (candidates list preparation - essentially same as before) ...
            const confirmedIds = Object.keys(matchData.presence || {}).filter(
                pid => matchData.presence![pid].status === 'confirmed'
            );
            const candidatesList: Player[] = [];
            for (const pid of confirmedIds) {
                if (pid === myPlayerProfile.id) continue;
                const pStats = matchData.stats?.[pid];
                if (pStats?.faltou) continue;

                const pRef = doc(db, 'teams', teamId, 'players', pid);
                const pSnap = await getDoc(pRef);
                if (pSnap.exists()) {
                    candidatesList.push({ ...pSnap.data(), id: pid } as Player);
                } else {
                    candidatesList.push({
                        id: pid,
                        name: matchData.presence![pid].name,
                        status: 'active',
                        goals: 0, assists: 0, matchesPlayed: 0
                    });
                }
            }
            setCandidates(candidatesList.sort((a, b) => a.name.localeCompare(b.name)));

            // Check if I already voted
            if (myPlayerProfile.userId) {
                const myVoteRef = doc(db, 'teams', teamId, 'matches', matchId, 'votes', myPlayerProfile.userId);
                const myVoteSnap = await getDoc(myVoteRef);
                if (myVoteSnap.exists()) {
                    const data = myVoteSnap.data();
                    setVotes(data.ratings || {});
                    setBestPlayerVote(data.bestPlayerVote || null);
                    setHasVoted(true); // MARK AS VOTED
                }
            }

        } catch (e) {
            console.error(e);
            Alert.alert("Erro", "Falha ao carregar dados.");
        } finally {
            setLoading(false);
        }
    };

    const handleRating = (playerId: string, rating: number) => {
        setVotes(prev => ({ ...prev, [playerId]: rating }));
    };

    const handleSubmit = async () => {
        if (!teamId || !matchId || !myPlayerProfile?.userId) {
            Alert.alert("Erro", "Erro de identificação.");
            return;
        }

        if (Object.keys(votes).length === 0 && !bestPlayerVote) {
            Alert.alert("Aviso", "Avalie ao menos um jogador ou escolha o Craque da Galera.");
            return;
        }

        setSubmitting(true);
        try {
            const voteDocData = {
                userId: myPlayerProfile.userId,
                playerId: myPlayerProfile.id,
                matchId: matchId,
                ratings: votes,
                bestPlayerVote: bestPlayerVote, // Save crowd vote
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            await setDoc(doc(db, 'teams', teamId, 'matches', matchId, 'votes', myPlayerProfile.userId), voteDocData);

            // Resolve Alert immediately
            const alertId = `vote_${matchId}_${myPlayerProfile.userId}`;
            await AlertService.resolveAlert(teamId, alertId);

            Alert.alert("Sucesso", "Votos enviados! Obrigado.");
            navigation.goBack();
        } catch (e) {
            console.error(e);
            Alert.alert("Erro", "Falha ao enviar votos.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#F8FAFC]">
            <View className="pt-12 px-6 pb-4 bg-white border-b border-slate-100 shadow-sm z-10">
                <View className="flex-row items-center justify-between mb-2">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center">
                        <ChevronLeft size={24} color="#0F172A" />
                        <Text className="text-lg font-black italic text-slate-900 ml-2">AVALIAR ATLETAS</Text>
                    </TouchableOpacity>
                </View>
                <Text className="text-slate-500 text-xs">Dê uma nota de 1 a 10 para o desempenho dos seus companheiros.</Text>
                <Text className="text-red-500 text-[10px] font-bold mt-1">ATENÇÃO: Uma vez salva, a avaliação NÃO poderá ser desfeita ou alterada.</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

                {/* Crowd Vote Section */}
                <View className="mb-8">
                    <Text className="text-xs font-black italic text-[#006400] tracking-widest uppercase mb-4 ml-1">QUEM FOI O CRAQUE DA GALERA?</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                        {candidates.map(player => (
                            <TouchableOpacity
                                key={player.id}
                                onPress={() => !hasVoted && setBestPlayerVote(player.id)}
                                activeOpacity={hasVoted ? 1 : 0.7}
                                className={`mr-4 items-center p-3 rounded-2xl border-2 ${bestPlayerVote === player.id ? 'bg-green-50 border-[#006400]' : 'bg-white border-transparent'} ${hasVoted ? 'opacity-80' : ''}`}
                                style={{ width: 100 }}
                            >
                                <View className={`w-14 h-14 rounded-full items-center justify-center mb-2 ${bestPlayerVote === player.id ? 'bg-[#006400]' : 'bg-slate-900'}`}>
                                    <Text className="text-white font-black text-lg">{player.name.substring(0, 2).toUpperCase()}</Text>
                                </View>
                                <Text numberOfLines={1} className={`font-bold text-xs ${bestPlayerVote === player.id ? 'text-[#006400]' : 'text-slate-600'}`}>
                                    {player.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <Text className="text-xs font-black italic text-slate-900 tracking-widest uppercase mb-4 ml-1">NOTAS INDIVIDUAIS</Text>
                {candidates.map(player => {
                    const currentRating = votes[player.id] || 0;

                    return (
                        <View key={player.id} className="bg-white p-4 rounded-xl mb-3 shadow-sm flex-row items-center justify-between">
                            <View className="flex-row items-center flex-1">
                                <View className="w-10 h-10 bg-slate-900 rounded-full items-center justify-center mr-3">
                                    <Text className="text-white font-black">{player.name.substring(0, 2).toUpperCase()}</Text>
                                </View>
                                <Text className="font-bold text-slate-800 text-sm">{player.name}</Text>
                            </View>

                            <View className="flex-row items-center gap-1">
                                <TouchableOpacity
                                    onPress={() => handleRating(player.id, Math.max(0, currentRating - 0.5))}
                                    disabled={hasVoted}
                                    className={`p-2 rounded-lg ${hasVoted ? 'bg-slate-50 opacity-50' : 'bg-slate-100'}`}
                                >
                                    <Text className="font-black text-slate-500">-</Text>
                                </TouchableOpacity>

                                <View className="w-12 items-center">
                                    <Text className="text-xl font-black italic text-[#006400]">{currentRating > 0 ? currentRating.toFixed(1) : '-'}</Text>
                                </View>

                                <TouchableOpacity
                                    onPress={() => handleRating(player.id, Math.min(10, currentRating + 0.5))}
                                    disabled={hasVoted}
                                    className={`p-2 rounded-lg ${hasVoted ? 'bg-slate-50 opacity-50' : 'bg-slate-100'}`}
                                >
                                    <Text className="font-black text-slate-500">+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>

            <View className="absolute bottom-6 left-6 right-6">
                {hasVoted ? (
                    <View className="bg-slate-200 py-4 rounded-2xl flex-row justify-center items-center">
                        <Send size={20} color="#94A3B8" />
                        <Text className="text-slate-400 font-black italic uppercase ml-2 tracking-widest">AVALIAÇÃO ENVIADA</Text>
                    </View>
                ) : (
                    <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={submitting}
                        className="bg-[#006400] py-4 rounded-2xl flex-row justify-center items-center shadow-lg shadow-green-900/20"
                    >
                        {submitting ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <Send size={20} color="white" />
                                <Text className="text-white font-black italic uppercase ml-2 tracking-widest">ENVIAR AVALIAÇÃO</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
