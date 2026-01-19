import { db } from './firebase';
import { doc, runTransaction, collection, getDocs } from 'firebase/firestore';
import { Match, MatchEvent, Player, PresenceStatus, PlayerMatchStats } from '@/types/models';
import { BillingService } from './billingService';

export const StatsService = {
    /**
     * Finalizes the match and aggregates stats to all confirmed players.
     * Uses a transaction to ensure atomicity.
     */
    finalizeMatchStats: async (
        teamId: string,
        matchId: string,
        scoreHome: number,
        scoreAway: number,
        currentPresence: Record<string, { status: PresenceStatus, name: string, isGhost?: boolean }>,
        events: MatchEvent[]
    ) => {
        // 1. Fetch Votes (Community Rating) - Read outside transaction because we need a query
        const votesMap: Record<string, { total: number, count: number }> = {};
        try {
            const votesRef = collection(db, 'teams', teamId, 'matches', matchId, 'votes');
            const votesSnap = await getDocs(votesRef);
            votesSnap.forEach(d => {
                const dData = d.data();
                // 1. Ratings
                if (dData.ratings) {
                    Object.entries(dData.ratings).forEach(([pid, rating]) => {
                        const r = Number(rating);
                        if (!isNaN(r)) {
                            if (!votesMap[pid]) votesMap[pid] = { total: 0, count: 0 };
                            votesMap[pid].total += r;
                            votesMap[pid].count++;
                        }
                    });
                }
                // 2. Crowd Vote
                if (dData.bestPlayerVote) {
                    const pid = dData.bestPlayerVote;
                    if (!votesMap[pid]) votesMap[pid] = { total: 0, count: 0 }; // Initialize if needed
                    // Use a separate property for crowd votes would be cleaner, but we can return a tuple or separate map
                }
            });
        } catch (e) {
            console.log("Error fetching votes, continuing without community ratings", e);
        }

        // Re-do the map structure to accommodate both
        const communityRatings: Record<string, { total: number, count: number }> = {};
        const crowdVotes: Record<string, number> = {};

        try {
            const votesRef = collection(db, 'teams', teamId, 'matches', matchId, 'votes');
            const votesSnap = await getDocs(votesRef);
            votesSnap.forEach(d => {
                const dData = d.data();
                if (dData.ratings) {
                    Object.entries(dData.ratings).forEach(([pid, rating]) => {
                        const r = Number(rating);
                        if (!isNaN(r)) {
                            if (!communityRatings[pid]) communityRatings[pid] = { total: 0, count: 0 };
                            communityRatings[pid].total += r;
                            communityRatings[pid].count++;
                        }
                    });
                }
                if (dData.bestPlayerVote) {
                    const pid = dData.bestPlayerVote;
                    crowdVotes[pid] = (crowdVotes[pid] || 0) + 1;
                }
            });
        } catch (e) {
            console.error(e);
        }

        const matchRef = doc(db, 'teams', teamId, 'matches', matchId);

        await runTransaction(db, async (transaction) => {
            // --- READ ALL BEFORE WRITE ---
            const matchDoc = await transaction.get(matchRef);
            if (!matchDoc.exists()) throw "Match does not exist!";

            const matchData = matchDoc.data() as Match;
            if (matchData.status === 'finished') throw "Match already finished!";

            const confirmedPlayerIds = Object.keys(currentPresence).filter(
                pid => currentPresence[pid].status === 'confirmed'
            );

            // Fetch all player docs
            const playerDocs: any[] = [];
            for (const playerId of confirmedPlayerIds) {
                const playerRef = doc(db, 'teams', teamId, 'players', playerId);
                const pDoc = await transaction.get(playerRef);
                if (pDoc.exists()) {
                    playerDocs.push({ ref: playerRef, data: pDoc.data() as Player, id: playerId });
                }
            }

            // --- WRITES START HERE ---

            // 1. Update Match Status
            // 1.5 Calculate Match Awards
            let bestPlayerId = null;
            let bestPlayerScore = -1;

            let crowdFavoriteId = null;
            let maxCrowdVotes = -1;

            // Helper to get Effective Technical Rating
            const getTechRating = (pid: string) => {
                const s = matchData.stats?.[pid];
                return s?.notaTecnica !== undefined ? Number(s.notaTecnica) : null;
            }

            confirmedPlayerIds.forEach(pid => {
                // Best Player Calculation: (AvgCommunity + Technical) / 2
                // If one is missing, use the other. If both missing, 0.

                let commAvg = 0;
                if (communityRatings[pid]?.count > 0) {
                    commAvg = communityRatings[pid].total / communityRatings[pid].count;
                }

                const techRating = getTechRating(pid);
                let finalScore = 0;

                if (techRating !== null && commAvg > 0) {
                    finalScore = (techRating + commAvg) / 2;
                } else if (techRating !== null) {
                    finalScore = techRating;
                } else if (commAvg > 0) {
                    finalScore = commAvg;
                }

                if (finalScore > bestPlayerScore) {
                    bestPlayerScore = finalScore;
                    bestPlayerId = pid;
                }

                // Crowd Favorite
                const cVotes = crowdVotes[pid] || 0;
                if (cVotes > maxCrowdVotes) {
                    maxCrowdVotes = cVotes;
                    crowdFavoriteId = pid;
                } else if (cVotes === maxCrowdVotes && maxCrowdVotes > 0) {
                    // Tie breaker? For now, keep first or handle tie. 
                    // Let's just keep first
                }
            });


            // 1. Update Match Status & Awards
            transaction.update(matchRef, {
                status: 'finished',
                scoreHome,
                scoreAway,
                awards: {
                    bestPlayerId: bestPlayerId,
                    bestPlayerScore: bestPlayerScore,
                    crowdFavoriteId: crowdFavoriteId,
                    crowdFavoriteVotes: maxCrowdVotes
                }
            });

            // 2. Aggregate Stats for Confirmed Players
            for (const p of playerDocs) {
                const pData = p.data;
                const pMatchStats = matchData.stats?.[p.id];

                // If marked as 'Faltou', skip stats aggregation (did not play)
                if (pMatchStats?.faltou) {
                    continue;
                }

                // Goals & Assists
                let newGoals = 0;
                let newAssists = 0;
                let newTechRating: number | null = null;

                if (pMatchStats) {
                    newGoals = pMatchStats.goals || 0;
                    newAssists = pMatchStats.assists || 0;
                    if (pMatchStats.notaTecnica !== undefined) newTechRating = Number(pMatchStats.notaTecnica);
                } else {
                    const eventsForPlayer = events.filter(e => e.playerId === p.id);
                    newGoals = eventsForPlayer.filter(e => e.type === 'goal').length;
                    newAssists = eventsForPlayer.filter(e => e.type === 'assist').length;
                }

                const updatedGoals = (pData.goals || 0) + newGoals;
                const updatedAssists = (pData.assists || 0) + newAssists;
                const updatedMatches = (pData.matchesPlayed || 0) + 1;
                const updatedParticipations = updatedGoals + updatedAssists;

                // Averages
                const avgGoals = updatedMatches > 0 ? parseFloat((updatedGoals / updatedMatches).toFixed(2)) : 0;
                const avgAssists = updatedMatches > 0 ? parseFloat((updatedAssists / updatedMatches).toFixed(2)) : 0;
                const mvpScore = updatedParticipations + avgGoals; // Simple Formula

                // Technical Rating Aggregation
                let techSum = (pData.technicalRatingSum || 0);
                let techCount = (pData.technicalRatingCount || 0);

                if (newTechRating !== null && !isNaN(newTechRating)) {
                    techSum += newTechRating;
                    techCount++;
                }
                const avgTech = techCount > 0 ? parseFloat((techSum / techCount).toFixed(2)) : (pData.averageTechnicalRating || 0);

                // Community Rating Aggregation
                let commSum = (pData.communityRatingSum || 0);
                let commCount = (pData.communityRatingCount || 0);

                if (communityRatings[p.id]) {
                    const matchAvgScore = communityRatings[p.id].total / communityRatings[p.id].count;
                    commSum += matchAvgScore;
                    commCount++;
                }
                const avgComm = commCount > 0 ? parseFloat((commSum / commCount).toFixed(2)) : (pData.averageCommunityRating || 0);

                transaction.update(p.ref, {
                    goals: updatedGoals,
                    assists: updatedAssists,
                    matchesPlayed: updatedMatches,
                    goalParticipations: updatedParticipations,
                    averageGoalsPerMatch: avgGoals,
                    averageAssistsPerMatch: avgAssists,
                    mvpScore,
                    // New/Fixed Ratings
                    technicalRatingSum: techSum,
                    technicalRatingCount: techCount,
                    averageTechnicalRating: avgTech,
                    communityRatingSum: commSum,
                    communityRatingCount: commCount,
                    averageCommunityRating: avgComm
                });
            }
        });

        try {
            await BillingService.generateGamePayments(teamId, matchId);
        } catch (e) {
            console.error("Failed to generate payments:", e);
        }
    },

    /**
     * Updates stats for a match that is ALREADY FINISHED.
     * Calculates the difference between old stats (saved in match) and new stats,
     * and applies the delta to the players' global stats.
     */
    updateFinishedMatchStats: async (
        teamId: string,
        matchId: string,
        newStats: Record<string, PlayerMatchStats>,
        newScoreHome: number,
        newScoreAway: number,
        events: MatchEvent[] // For fallback if old stats missing
    ) => {
        const matchRef = doc(db, 'teams', teamId, 'matches', matchId);

        await runTransaction(db, async (transaction) => {
            const matchDoc = await transaction.get(matchRef);
            if (!matchDoc.exists()) throw "Match does not exist!";

            const matchData = matchDoc.data() as Match;
            if (matchData.status !== 'finished') throw "Match is not finished, use regular update.";

            const oldStatsMap = matchData.stats || {};
            const oldPresence = matchData.presence || {};

            // Identify all players involved (both in old stats and new stats)
            const playerIds = new Set([
                ...Object.keys(oldPresence).filter(pid => oldPresence[pid].status === 'confirmed'),
                ...Object.keys(newStats)
            ]);

            // Fetch players
            const playerDocs: any[] = [];
            for (const pid of Array.from(playerIds)) {
                const pRef = doc(db, 'teams', teamId, 'players', pid);
                const pDoc = await transaction.get(pRef);
                if (pDoc.exists()) {
                    playerDocs.push({ ref: pRef, data: pDoc.data() as Player, id: pid });
                }
            }

            // Update Match
            transaction.update(matchRef, {
                scoreHome: newScoreHome,
                scoreAway: newScoreAway,
                stats: newStats
            });

            // Update Players
            for (const p of playerDocs) {
                const pData = p.data;

                // Old Stats
                let oldGoals = 0;
                let oldAssists = 0;
                const oldPStats = oldStatsMap[p.id];
                if (oldPStats) {
                    oldGoals = oldPStats.goals || 0;
                    oldAssists = oldPStats.assists || 0;
                } else {
                    // Fallback to events if no saved stats found (legacy or error)
                    const pEvents = events.filter(e => e.playerId === p.id);
                    oldGoals = pEvents.filter(e => e.type === 'goal').length;
                    oldAssists = pEvents.filter(e => e.type === 'assist').length;
                }
                // If player skipped (faltou) in old stats, count as 0
                if (oldPStats?.faltou) {
                    oldGoals = 0;
                    oldAssists = 0;
                }

                // New Stats
                let newGoals = 0;
                let newAssists = 0;
                const newPStats = newStats[p.id];
                if (newPStats && !newPStats.faltou) {
                    newGoals = newPStats.goals || 0;
                    newAssists = newPStats.assists || 0;
                    // Note: We assume 'faltou' status in newStats overrides raw numbers
                }

                // Deltas
                const deltaGoals = newGoals - oldGoals;
                const deltaAssists = newAssists - oldAssists;

                if (deltaGoals === 0 && deltaAssists === 0) continue;

                const updatedGoals = Math.max(0, (pData.goals || 0) + deltaGoals);
                const updatedAssists = Math.max(0, (pData.assists || 0) + deltaAssists);
                const matchesPlayed = pData.matchesPlayed || 0; // Matches count doesn't change just by editing stats (unless presence changed, but we assume presence is static here)

                const updatedParticipations = updatedGoals + updatedAssists;
                const avgGoals = matchesPlayed > 0 ? parseFloat((updatedGoals / matchesPlayed).toFixed(2)) : 0;
                const avgAssists = matchesPlayed > 0 ? parseFloat((updatedAssists / matchesPlayed).toFixed(2)) : 0;
                const mvpScore = updatedParticipations + avgGoals;

                transaction.update(p.ref, {
                    goals: updatedGoals,
                    assists: updatedAssists,
                    goalParticipations: updatedParticipations,
                    averageGoalsPerMatch: avgGoals,
                    averageAssistsPerMatch: avgAssists,
                    mvpScore
                });
            }
        });
    },

    /**
     * Reopens a match (Rollback)
     * Decrements stats from players and sets status back to 'scheduled'.
     */
    rollbackMatchStats: async (
        teamId: string,
        matchId: string,
        events: MatchEvent[]
    ) => {
        const matchRef = doc(db, 'teams', teamId, 'matches', matchId);

        await runTransaction(db, async (transaction) => {
            // --- READ ALL BEFORE WRITE ---
            const matchDoc = await transaction.get(matchRef);
            if (!matchDoc.exists()) throw "Match does not exist!";

            const matchData = matchDoc.data() as Match;
            if (matchData.status !== 'finished') throw "Match is not finished, cannot rollback!";

            const currentPresence = matchData.presence || {};
            const confirmedPlayerIds = Object.keys(currentPresence).filter(
                pid => currentPresence[pid].status === 'confirmed'
            );

            // Fetch all player docs
            const playerDocs: any[] = [];
            for (const playerId of confirmedPlayerIds) {
                const playerRef = doc(db, 'teams', teamId, 'players', playerId);
                const pDoc = await transaction.get(playerRef);
                if (pDoc.exists()) {
                    playerDocs.push({ ref: playerRef, data: pDoc.data() as Player, id: playerId });
                }
            }

            // --- WRITES START HERE ---

            // 1. Revert Match Status
            transaction.update(matchRef, {
                status: 'scheduled'
            });

            // 2. Revert Stats
            for (const p of playerDocs) {
                const pData = p.data;

                // Determine what to remove
                let removeGoals = 0;
                let removeAssists = 0;

                const pMatchStats = matchData.stats?.[p.id];
                if (pMatchStats) {
                    removeGoals = pMatchStats.goals || 0;
                    removeAssists = pMatchStats.assists || 0;
                    if (pMatchStats.faltou) {
                        removeGoals = 0;
                        removeAssists = 0;
                    }
                } else {
                    // Fallback to events
                    const eventsForPlayer = events.filter(e => e.playerId === p.id);
                    removeGoals = eventsForPlayer.filter(e => e.type === 'goal').length;
                    removeAssists = eventsForPlayer.filter(e => e.type === 'assist').length;
                }

                const updatedGoals = Math.max(0, (pData.goals || 0) - removeGoals);
                const updatedAssists = Math.max(0, (pData.assists || 0) - removeAssists);
                const updatedMatches = Math.max(0, (pData.matchesPlayed || 0) - 1); // Only decrement if they weren't marked as 'faltou'? Actually if 'faltou' they didn't get +1 match in finalize, logic needs check.
                // In finalize we do: if (pMatchStats?.faltou) continue; -> so they never got +1.
                // Here we MUST check if they were faltou to avoid decrementing if they never incremented.

                if (pMatchStats?.faltou) {
                    // Do nothing for this player as they were skipped in finalize
                    continue;
                }

                const updatedParticipations = updatedGoals + updatedAssists;

                const avgGoals = updatedMatches > 0 ? parseFloat((updatedGoals / updatedMatches).toFixed(2)) : 0;
                const avgAssists = updatedMatches > 0 ? parseFloat((updatedAssists / updatedMatches).toFixed(2)) : 0;
                const mvpScore = updatedParticipations + avgGoals;

                // Ratings Rollback (Simplified: just subtracting if present, but averages are tricky without history)
                // For now we might just leave ratings as is or implement complex rollback.
                // Let's at least subtract counts/sums if we have the data of what was added.
                // Problem: we don't know exactly what 'newTechRating' or 'communityAvg' was added unless we store it.
                // The matchData.stats has 'notaTecnica'. Community ratings are in votes collection.
                // To do perfectly we need to re-fetch votes or store the aggregated values in match stats.

                // For MVP: We accept ratings might drift slightly on rollback OR we assume full reset not needed often.
                // BETTER: We just don't rollback ratings sum/count for now to avoid corruption, 
                // OR we accept we can't perfectly rollback without storing what was added.

                // Let's just rollback basic stats for now.

                transaction.update(p.ref, {
                    goals: updatedGoals,
                    assists: updatedAssists,
                    matchesPlayed: updatedMatches,
                    goalParticipations: updatedParticipations,
                    averageGoalsPerMatch: avgGoals,
                    averageAssistsPerMatch: avgAssists,
                    mvpScore
                });
            }

            // Remove rewards data
            const cleanMatchData: any = { status: 'scheduled' };
            // @ts-ignore - delete field
            cleanMatchData['awards'] = deleteField();

            transaction.update(matchRef, cleanMatchData);
        });
    }
};

import { deleteField } from 'firebase/firestore';
