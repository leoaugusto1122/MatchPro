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
            const matchDoc = await transaction.get(matchRef);
            if (!matchDoc.exists()) throw "Match does not exist!";

            // Re-read match data inside transaction to be safe
            const matchData = matchDoc.data() as Match;
            if (matchData.status === 'finished') throw "Match already finished!";

            // 1. Update Match Status
            transaction.update(matchRef, {
                status: 'finished',
                scoreHome,
                scoreAway
            });

            // 2. Aggregate Stats for each Confirmed Player
            const confirmedPlayerIds = Object.keys(currentPresence).filter(
                pid => currentPresence[pid].status === 'confirmed'
            );

            for (const playerId of confirmedPlayerIds) {
                // Determine if it's a real player or ghost logic implies we assume they have a doc in 'players' collection
                // Even ghosts have a doc in 'players' (created by owner). 
                const playerRef = doc(db, 'teams', teamId, 'players', playerId);
                const playerDoc = await transaction.get(playerRef);

                if (playerDoc.exists()) {
                    const pData = playerDoc.data() as Player;

                    // Filter events for this player using the passed events array (which we assume is complete)
                    const playerEvents = events.filter(e => e.playerId === playerId);
                    const newGoals = playerEvents.filter(e => e.type === 'goal').length;
                    const newAssists = playerEvents.filter(e => e.type === 'assist').length;

                    const updatedGoals = (pData.goals || 0) + newGoals;
                    const updatedAssists = (pData.assists || 0) + newAssists;
                    const updatedMatches = (pData.matchesPlayed || 0) + 1;
                    const updatedParticipations = updatedGoals + updatedAssists;

                    const avgGoals = updatedMatches > 0 ? parseFloat((updatedGoals / updatedMatches).toFixed(2)) : 0;
                    const avgAssists = updatedMatches > 0 ? parseFloat((updatedAssists / updatedMatches).toFixed(2)) : 0;

                    // MVP Score: (Goals + Assists) + AvgGoals
                    const mvpScore = updatedParticipations + avgGoals;

                    transaction.update(playerRef, {
                        goals: updatedGoals,
                        assists: updatedAssists,
                        matchesPlayed: updatedMatches,
                        goalParticipations: updatedParticipations,
                        averageGoalsPerMatch: avgGoals,
                        averageAssistsPerMatch: avgAssists,
                        mvpScore
                    });
                }
            }
        });

        // TRIGGER BILLING GENERATION
        // We do this after the transaction to ensure match is definitely finished.
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
            const matchDoc = await transaction.get(matchRef);
            if (!matchDoc.exists()) throw "Match does not exist!";

            const matchData = matchDoc.data() as Match;
            if (matchData.status !== 'finished') throw "Match is not finished, cannot rollback!";

            // 1. Revert Match Status
            transaction.update(matchRef, {
                status: 'scheduled' // or 'ongoing'? 'scheduled' is safer.
            });

            // 2. Revert Stats based on PRESENCE stored in the match
            // We must rely on the presence stored in the match doc currently.
            const currentPresence = matchData.presence || {};
            const confirmedPlayerIds = Object.keys(currentPresence).filter(
                pid => currentPresence[pid].status === 'confirmed'
            );

            for (const playerId of confirmedPlayerIds) {
                const playerRef = doc(db, 'teams', teamId, 'players', playerId);
                const playerDoc = await transaction.get(playerRef);

                if (playerDoc.exists()) {
                    const pData = playerDoc.data() as Player;

                    const playerEvents = events.filter(e => e.playerId === playerId);
                    const removeGoals = playerEvents.filter(e => e.type === 'goal').length;
                    const removeAssists = playerEvents.filter(e => e.type === 'assist').length;

                    const updatedGoals = Math.max(0, (pData.goals || 0) - removeGoals);
                    const updatedAssists = Math.max(0, (pData.assists || 0) - removeAssists);
                    const updatedMatches = Math.max(0, (pData.matchesPlayed || 0) - 1);
                    const updatedParticipations = updatedGoals + updatedAssists;

                    const avgGoals = updatedMatches > 0 ? parseFloat((updatedGoals / updatedMatches).toFixed(2)) : 0;
                    const avgAssists = updatedMatches > 0 ? parseFloat((updatedAssists / updatedMatches).toFixed(2)) : 0;
                    const mvpScore = updatedParticipations + avgGoals;

                    transaction.update(playerRef, {
                        goals: updatedGoals,
                        assists: updatedAssists,
                        matchesPlayed: updatedMatches,
                        goalParticipations: updatedParticipations,
                        averageGoalsPerMatch: avgGoals,
                        averageAssistsPerMatch: avgAssists,
                        mvpScore
                    });
                }
            }
        });
    }
};
