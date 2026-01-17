import { db } from './firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { Match, MatchEvent, Player, PresenceStatus } from '@/types/models';
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
            transaction.update(matchRef, {
                status: 'finished',
                scoreHome,
                scoreAway
            });

            // 2. Aggregate Stats for Confirmed Players
            for (const p of playerDocs) {
                const pData = p.data;
                const eventsForPlayer = events.filter(e => e.playerId === p.id);
                const newGoals = eventsForPlayer.filter(e => e.type === 'goal').length;
                const newAssists = eventsForPlayer.filter(e => e.type === 'assist').length;

                const updatedGoals = (pData.goals || 0) + newGoals;
                const updatedAssists = (pData.assists || 0) + newAssists;
                const updatedMatches = (pData.matchesPlayed || 0) + 1;
                const updatedParticipations = updatedGoals + updatedAssists;

                const avgGoals = updatedMatches > 0 ? parseFloat((updatedGoals / updatedMatches).toFixed(2)) : 0;
                const avgAssists = updatedMatches > 0 ? parseFloat((updatedAssists / updatedMatches).toFixed(2)) : 0;
                const mvpScore = updatedParticipations + avgGoals;

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
        });

        try {
            await BillingService.generateGamePayments(teamId, matchId);
        } catch (e) {
            console.error("Failed to generate payments:", e);
        }
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
                const eventsForPlayer = events.filter(e => e.playerId === p.id);
                const removeGoals = eventsForPlayer.filter(e => e.type === 'goal').length;
                const removeAssists = eventsForPlayer.filter(e => e.type === 'assist').length;

                const updatedGoals = Math.max(0, (pData.goals || 0) - removeGoals);
                const updatedAssists = Math.max(0, (pData.assists || 0) - removeAssists);
                const updatedMatches = Math.max(0, (pData.matchesPlayed || 0) - 1);
                const updatedParticipations = updatedGoals + updatedAssists;

                const avgGoals = updatedMatches > 0 ? parseFloat((updatedGoals / updatedMatches).toFixed(2)) : 0;
                const avgAssists = updatedMatches > 0 ? parseFloat((updatedAssists / updatedMatches).toFixed(2)) : 0;
                const mvpScore = updatedParticipations + avgGoals;

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
        });
    }
};
