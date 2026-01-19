import React, { useEffect, useState, useMemo } from 'react';
import { View, ScrollView, Alert, TouchableOpacity, Text, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useTeamStore } from '@/stores/teamStore';
import { db } from '@/services/firebase';
import { doc, updateDoc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { Match, MatchEvent, PlayerMatchStats } from '@/types/models';
import { ChevronLeft, Save } from 'lucide-react-native';
import { StatsService } from '@/services/statsService';

export default function MatchSummaryScreen({ route, navigation }: any) {
    const { matchId } = route.params;
    const teamId = useTeamStore(state => state.teamId);
    const myPlayerProfile = useTeamStore(state => state.myPlayerProfile);

    const [loading, setLoading] = useState(false);
    const [match, setMatch] = useState<Match | null>(null);
    const [events, setEvents] = useState<MatchEvent[]>([]);

    // Local state for edits before saving
    // keys are playerIds
    const [localStats, setLocalStats] = useState<Record<string, PlayerMatchStats>>({});

    const [scoreHome, setScoreHome] = useState(0);
    const [scoreAway, setScoreAway] = useState(0);

    useEffect(() => {
        if (!teamId || !matchId) return;

        const matchRef = doc(db, 'teams', teamId, 'matches', matchId);
        const unsubMatch = onSnapshot(matchRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data() as Match;
                setMatch({ ...data, id: snap.id });

                // Initialize local stats from existing match stats
                const initialStats: Record<string, PlayerMatchStats> = data.stats || {};
                setLocalStats(initialStats);

                // Initialize score if zero (handling existing matches)
                setScoreHome(prev => prev === 0 && data.scoreHome ? data.scoreHome : prev);
                setScoreAway(prev => prev === 0 && data.scoreAway ? data.scoreAway : prev);
            }
        });

        const eventsRef = collection(db, 'teams', teamId, 'matches', matchId, 'events');
        const q = query(eventsRef, orderBy('createdAt', 'asc'));
        const unsubEvents = onSnapshot(q, (snap) => {
            const list: MatchEvent[] = [];
            snap.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as MatchEvent);
            });
            setEvents(list);
        });

        return () => {
            unsubMatch();
            unsubEvents();
        };
    }, [matchId, teamId]);

    // Calculate derived stats from events if not present in "stats" field
    const effectiveStats = useMemo(() => {
        if (!match) return {};
        const confirmed = Object.entries(match.presence || {})
            .filter(([_, p]) => p.status === 'confirmed')
            .map(([id]) => id);

        const combined: Record<string, PlayerMatchStats> = {};

        confirmed.forEach(pid => {
            // Priority: Local State (Edits) -> Match.stats (Saved) -> Events (Calculated)
            if (localStats[pid]) {
                combined[pid] = localStats[pid];
                return;
            }

            // Calculate from events
            const playerEvents = events.filter(e => e.playerId === pid);
            const goals = playerEvents.filter(e => e.type === 'goal').length;
            const assists = playerEvents.filter(e => e.type === 'assist').length;

            combined[pid] = {
                goals,
                assists,
                notaTecnica: undefined,
                avaliadorTecnicoId: undefined,
                faltou: false
            };
        });

        return combined;
    }, [match?.presence, events, localStats]);

    // Helper to calculate total assigned goals from localStats + effectiveStats
    const calculateCurrentTotalGoals = (excludePlayerId?: string, simulateValue?: number) => {
        let total = 0;
        const players = Object.keys(effectiveStats); // All relevant players
        players.forEach(pid => {
            if (excludePlayerId && pid === excludePlayerId) return;
            // Use localStat if exists, else effectiveStat (which includes localStat override logic anyway, but avoiding recursion if using raw effectiveStats)
            // Wait, effectiveStats ALREADY includes localStats overrides.
            // But if we are IN THE MIDDLE of an update (simulateValue), we need to exclude the target player's current effective stat?
            const stat = effectiveStats[pid];
            total += (stat?.goals || 0);
        });

        if (excludePlayerId) {
            // Subtract the excluded player's CURRENT goal count from the total derived above
            const currentStat = effectiveStats[excludePlayerId];
            total -= (currentStat?.goals || 0);
        }

        if (simulateValue !== undefined) total += simulateValue;
        return total;
    };

    const handleScoreChange = (type: 'home' | 'away', value: string) => {
        const val = parseInt(value);
        if (isNaN(val)) return; // Allow empty intermediate? No, parse int or 0.
        // Actually for empty string we might want to allow it to be 0 or empty. but state is number.

        if (type === 'home') {
            // If reducing score, check if it goes below currently assigned goals
            const currentAssigned = calculateCurrentTotalGoals();
            if (val < currentAssigned) {
                Alert.alert("Ação Inválida", `Não é possível definir placar menor que o total de gols já atribuídos aos jogadores (${currentAssigned}).`);
                return;
            }
            setScoreHome(val);
        } else {
            setScoreAway(val);
        }
    };

    const handleStatChange = (playerId: string, field: keyof PlayerMatchStats, value: any) => {
        // Validation for Goals
        if (field === 'goals') {
            const newGoals = value as number;
            const currentTotal = calculateCurrentTotalGoals(playerId, newGoals);
            if (currentTotal > scoreHome) {
                Alert.alert("Limite Atingido", `O número total de gols dos jogadores (${currentTotal}) não pode exceder o placar do time (${scoreHome}). Aumente o placar primeiro.`);
                return;
            }
        }

        setLocalStats(prev => {
            const current = prev[playerId] || effectiveStats[playerId] || { goals: 0, assists: 0 };

            // Logic for Technical Rating locking
            if (field === 'notaTecnica') {
                // Check if it's already set by SOMEONE ELSE
                if (current.notaTecnica !== undefined && current.avaliadorTecnicoId && current.avaliadorTecnicoId !== myPlayerProfile?.userId) {
                    // Locked
                    return prev;
                }
                return {
                    ...prev,
                    [playerId]: {
                        ...current,
                        notaTecnica: value,
                        avaliadorTecnicoId: myPlayerProfile?.userId // Set me as the evaluator
                    }
                };
            }

            return {
                ...prev,
                [playerId]: {
                    ...current,
                    [field]: value
                }
            };
        });
    };

    const handleSaveSummary = async () => {
        if (!teamId || !matchId) return;
        setLoading(true);
        try {
            if (match?.status === 'finished') {
                await StatsService.updateFinishedMatchStats(
                    teamId,
                    matchId,
                    effectiveStats,
                    scoreHome,
                    scoreAway,
                    events
                );
            } else {
                await updateDoc(doc(db, 'teams', teamId, 'matches', matchId), {
                    stats: effectiveStats,
                    scoreHome,
                    scoreAway
                });
            }

            Alert.alert("Sucesso", "Súmula atualizada com sucesso.");
            navigation.goBack();
        } catch (e) {
            console.error(e);
            Alert.alert("Erro", "Falha ao salvar súmula.");
        } finally {
            setLoading(false);
        }
    };

    const confirmedPlayers = useMemo(() => {
        if (!match?.presence) return [];
        return Object.entries(match.presence)
            .filter(([_, p]) => p.status === 'confirmed')
            .map(([id, p]) => ({ id, ...p }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [match?.presence]);

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAFC]">
                <ActivityIndicator size="large" color="#006400" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-[#F8FAFC]">
            <View className="pt-12 px-6 pb-4 bg-white border-b border-slate-100 shadow-sm z-10">
                <View className="flex-row items-center justify-between mb-4">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center">
                        <ChevronLeft size={24} color="#0F172A" />
                        <Text className="text-lg font-black italic text-slate-900 ml-2">FECHAR SÚMULA</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSaveSummary} className="bg-[#006400] px-4 py-2 rounded-lg flex-row items-center">
                        <Save size={16} color="white" />
                        <Text className="text-white font-bold text-xs ml-2 uppercase">SALVAR</Text>
                    </TouchableOpacity>
                </View>

                {/* Score Editor */}
                <View className="flex-row justify-center items-center gap-4 mb-4">
                    <View className="items-center">
                        <Text className="text-[10px] font-black uppercase text-slate-400 mb-1">MEU TIME</Text>
                        <TextInput
                            className="bg-slate-100 w-16 h-16 rounded-2xl text-center text-3xl font-black italic text-slate-900"
                            keyboardType="numeric"
                            value={scoreHome.toString()}
                            onChangeText={(t) => handleScoreChange('home', t)}
                        />
                    </View>
                    <Text className="text-2xl font-black text-slate-300">X</Text>
                    <View className="items-center">
                        <Text className="text-[10px] font-black uppercase text-slate-400 mb-1">ADVERSÁRIO</Text>
                        <TextInput
                            className="bg-slate-100 w-16 h-16 rounded-2xl text-center text-3xl font-black italic text-slate-900"
                            keyboardType="numeric"
                            value={scoreAway.toString()}
                            onChangeText={(t) => handleScoreChange('away', t)}
                        />
                    </View>
                </View>

                <Text className="text-slate-500 text-xs text-center">Gerencie gols, assistências, faltas e avaliações técnicas.</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
                {confirmedPlayers.map(player => {
                    const stats = effectiveStats[player.id] || { goals: 0, assists: 0 };
                    const isMissed = stats.faltou;
                    const isLockedRating = stats.notaTecnica !== undefined && stats.avaliadorTecnicoId && stats.avaliadorTecnicoId !== myPlayerProfile?.userId;

                    return (
                        <View key={player.id} className={`bg-white p-4 rounded-xl mb-4 border ${isMissed ? 'border-red-200 bg-red-50' : 'border-slate-100'}`}>
                            <View className="flex-row justify-between items-start mb-4">
                                <View>
                                    <Text className={`text-base font-bold ${isMissed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{player.name}</Text>
                                    {isMissed && <Text className="text-[10px] text-red-500 font-bold uppercase mt-1">MARCADO COMO FALTA</Text>}
                                </View>
                                <View className="flex-row items-center bg-slate-100 rounded-lg p-1">
                                    <Text className={`text-[10px] font-bold mr-2 uppercase ${isMissed ? 'text-red-500' : 'text-slate-500'}`}>FALTOU?</Text>
                                    <Switch
                                        trackColor={{ false: "#CBD5E1", true: "#EF4444" }}
                                        value={isMissed || false}
                                        onValueChange={(val) => handleStatChange(player.id, 'faltou', val)}
                                        thumbColor={"#FFFFFF"}
                                    />
                                </View>
                            </View>

                            {/* Stats Inputs (Disabled if missed) */}
                            <View className={`flex-row gap-4 ${isMissed ? 'opacity-30' : ''}`} pointerEvents={isMissed ? 'none' : 'auto'}>
                                {/* Goals */}
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-slate-400 uppercase mb-1">GOLS</Text>
                                    <TextInput
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-center"
                                        keyboardType="numeric"
                                        value={stats.goals?.toString()}
                                        onChangeText={(text) => handleStatChange(player.id, 'goals', parseInt(text) || 0)}
                                    />
                                </View>
                                {/* Assists */}
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-slate-400 uppercase mb-1">ASSIST</Text>
                                    <TextInput
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-center"
                                        keyboardType="numeric"
                                        value={stats.assists?.toString()}
                                        onChangeText={(text) => handleStatChange(player.id, 'assists', parseInt(text) || 0)}
                                    />
                                </View>
                                {/* Tech Rating */}
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-slate-400 uppercase mb-1">NOTA TÉC. (0-10)</Text>
                                    <TextInput
                                        className={`bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-center ${isLockedRating ? 'text-slate-400 bg-slate-100' : 'text-blue-600'}`}
                                        keyboardType="numeric"
                                        maxLength={3} // 10 or 9.9
                                        value={stats.notaTecnica?.toString() || ''}
                                        editable={!isLockedRating}
                                        placeholder="-"
                                        onChangeText={(text) => {
                                            if (text === '') {
                                                handleStatChange(player.id, 'notaTecnica', undefined);
                                                return;
                                            }
                                            const val = parseFloat(text);
                                            // Handle potential NaN if user types invalid chars (though keyboardType helps)
                                            if (isNaN(val)) return;
                                            if (val < 0 || val > 10) return;
                                            handleStatChange(player.id, 'notaTecnica', val);
                                        }}
                                    />
                                    <View className="absolute top-[-8px] right-[-4px]">
                                        <View className="bg-blue-100 rounded-full w-4 h-4 items-center justify-center border border-blue-200">
                                            <Text className="text-[8px] font-bold text-blue-600">i</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>

                            {isLockedRating && (
                                <Text className="text-[8px] text-slate-400 mt-2 italic text-right">
                                    Nota travada por outro avaliador.
                                </Text>
                            )}
                        </View>
                    );
                })}

                <View className="h-20" />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
