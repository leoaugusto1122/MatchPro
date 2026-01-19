import { db } from './firebase';
import {
    doc,
    runTransaction,
    collection,
    getDocs,
    query,
    where,
    serverTimestamp,
} from 'firebase/firestore';
import { Team, Match, Player, GamePayment, MonthlyPayment } from '@/types/models';

export const BillingService = {
    /**
     * Generates payments for a specific match based on the team's billing settings.
     * Should be called when a match is finalized.
     */
    generateGamePayments: async (teamId: string, matchId: string) => {
        const teamRef = doc(db, 'teams', teamId);
        const matchRef = doc(db, 'teams', teamId, 'matches', matchId);
        const paymentsCollectionRef = collection(db, 'teams', teamId, 'matches', matchId, 'payments');

        await runTransaction(db, async (transaction) => {
            const teamDoc = await transaction.get(teamRef);
            const matchDoc = await transaction.get(matchRef);

            if (!teamDoc.exists()) throw new Error("Team not found");
            if (!matchDoc.exists()) throw new Error("Match not found");

            const teamData = teamDoc.data() as Team;
            const matchData = matchDoc.data() as Match;

            const { billingMode, perGameAmount } = teamData;

            if (billingMode !== 'PER_GAME' && billingMode !== 'MONTHLY_PLUS_GAME') {
                return;
            }

            if (!perGameAmount || perGameAmount <= 0) {
                console.warn("perGameAmount is not set or zero, skipping payment generation.");
                return;
            }

            const presence = matchData.presence || {};
            const confirmedPlayerIds = Object.keys(presence).filter(playerId => {
                const p = presence[playerId];
                return p.status === 'confirmed';
            });

            // PHASE 1: PREPARE AND READ ALL DOCUMENTS
            // We need to read player docs and payment docs for all confirmed players
            const reads = [];
            for (const playerId of confirmedPlayerIds) {
                const playerRef = doc(db, 'teams', teamId, 'players', playerId);
                const paymentRef = doc(paymentsCollectionRef, playerId);
                reads.push({ playerId, playerRef, paymentRef });
            }

            const results = [];
            for (const item of reads) {
                const playerDoc = await transaction.get(item.playerRef);
                const paymentDoc = await transaction.get(item.paymentRef);
                results.push({ ...item, playerDoc, paymentDoc });
            }

            // PHASE 2: CALCULATE AND WRITE
            for (const item of results) {
                const { playerId, playerDoc, paymentDoc, playerRef, paymentRef } = item;

                if (!playerDoc.exists()) continue;

                const playerData = playerDoc.data() as Player;
                const userId = playerData.userId;

                if (userId) {
                    const memberRole = teamData.members?.[userId];
                    if (memberRole === 'coach' || memberRole === 'staff' || memberRole === 'owner') {
                        continue;
                    }
                }

                // Check Player Payment Mode
                let pMode = playerData.paymentMode;
                if (!pMode) {
                    pMode = billingMode === 'PER_GAME' ? 'per_game' : 'monthly';
                }

                let shouldCharge = false;
                if (billingMode === 'PER_GAME') {
                    if (pMode === 'per_game') shouldCharge = true;
                } else if (billingMode === 'MONTHLY_PLUS_GAME') {
                    if (pMode === 'per_game') shouldCharge = true;
                }

                if (!shouldCharge) continue;

                // If payment already exists, skip
                if (paymentDoc.exists()) continue;

                // Create Payment
                const newPayment: GamePayment = {
                    id: playerId,
                    type: 'PER_GAME',
                    teamId,
                    matchId,
                    playerId,
                    amount: perGameAmount,
                    status: 'pending',
                    createdAt: serverTimestamp()
                };
                transaction.set(paymentRef, newPayment);

                // Update Player Financial Summary
                const currentSummary = playerData.financialSummary || { totalPaid: 0, totalPending: 0 };
                transaction.update(playerRef, {
                    financialSummary: {
                        totalPaid: currentSummary.totalPaid,
                        totalPending: currentSummary.totalPending + perGameAmount
                    }
                });
            }
        });
    },

    /**
     * Generates monthly payments for all active players.
     * Idempotent based on 'playerId_YYYY_MM'.
     */
    generateMonthlyPayments: async (teamId: string, month: string) => { // month: 'YYYY-MM'
        const teamRef = doc(db, 'teams', teamId);

        await runTransaction(db, async (transaction) => {
            const teamDoc = await transaction.get(teamRef);
            if (!teamDoc.exists()) throw new Error("Team not found");

            const teamData = teamDoc.data() as Team;
            const { billingMode, monthlyAmount } = teamData;

            if (billingMode !== 'MONTHLY' && billingMode !== 'MONTHLY_PLUS_GAME') {
                return;
            }

            if (!monthlyAmount || monthlyAmount <= 0) {
                console.warn("monthlyAmount is not set, skipping");
                return;
            }

            // Query active players (Read outside transaction is safe for initial list, 
            // but we MUST read individual docs inside transaction to ensure consistency/locks)
            // Ideally, we fetch the IDs here.
            const playersRef = collection(db, 'teams', teamId, 'players');
            const activePlayersQuery = query(playersRef, where('status', '==', 'active'));
            const querySnapshot = await getDocs(activePlayersQuery);
            const potentialPlayers = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));

            // PHASE 1: PREPARE AND READ ALL DOCUMENTS
            const reads = [];
            for (const player of potentialPlayers) {
                const paymentId = `${player.id}_${month.replace('-', '_')}`;
                const paymentRef = doc(db, 'teams', teamId, 'monthlyPayments', paymentId);
                const playerRef = doc(db, 'teams', teamId, 'players', player.id);
                reads.push({ player, paymentId, paymentRef, playerRef });
            }

            const results = [];
            for (const item of reads) {
                const paymentDoc = await transaction.get(item.paymentRef);
                const playerDoc = await transaction.get(item.playerRef);
                results.push({ ...item, paymentDoc, playerDoc });
            }

            // PHASE 2: CALCULATE AND WRITE
            for (const item of results) {
                const { player, paymentRef, playerRef, paymentDoc, playerDoc, paymentId } = item;

                if (!playerDoc.exists()) continue; // Should exist, but safety check

                const playerData = playerDoc.data() as Player; // Use transactional data
                const userId = playerData.userId;

                if (userId) {
                    const memberRole = teamData.members?.[userId];
                    if (memberRole === 'coach' || memberRole === 'staff' || memberRole === 'owner') {
                        continue;
                    }
                }

                // Check Player Payment Mode
                let pMode = playerData.paymentMode;
                if (!pMode) {
                    pMode = 'monthly';
                }

                let shouldCharge = false;
                if (billingMode === 'MONTHLY') {
                    if (pMode === 'monthly') shouldCharge = true;
                } else if (billingMode === 'MONTHLY_PLUS_GAME') {
                    if (pMode === 'monthly') shouldCharge = true;
                }

                if (!shouldCharge) continue;

                if (paymentDoc.exists()) continue;

                const newPayment: MonthlyPayment = {
                    id: paymentId,
                    type: 'MONTHLY',
                    teamId,
                    playerId: player.id,
                    month,
                    amount: monthlyAmount,
                    status: 'pending',
                    createdAt: serverTimestamp()
                };
                transaction.set(paymentRef, newPayment);

                // UPDATE Player Financial Summary
                const currentSummary = playerData.financialSummary || { totalPaid: 0, totalPending: 0 };
                transaction.update(playerRef, {
                    financialSummary: {
                        totalPaid: currentSummary.totalPaid,
                        totalPending: currentSummary.totalPending + monthlyAmount
                    }
                });
            }
        });
    },

    /**
     * Marks a payment as confirmed/paid.
     */
    markPaymentAsPaid: async (
        teamId: string,
        paymentType: 'PER_GAME' | 'MONTHLY',
        paymentId: string,
        matchIdIfExists: string | undefined,
        confirmedByUserId: string
    ) => {
        let paymentRef;
        if (paymentType === 'PER_GAME') {
            if (!matchIdIfExists) throw new Error("Match ID required for Game Payment");
            paymentRef = doc(db, 'teams', teamId, 'matches', matchIdIfExists, 'payments', paymentId);
        } else {
            paymentRef = doc(db, 'teams', teamId, 'monthlyPayments', paymentId);
        }

        await runTransaction(db, async (transaction) => {
            // 1. READ ALL FIRST
            const docSnap = await transaction.get(paymentRef);
            if (!docSnap.exists()) throw new Error("Payment document not found");

            const data = docSnap.data() as GamePayment | MonthlyPayment;
            const playerId = data.playerId;

            const playerRef = doc(db, 'teams', teamId, 'players', playerId);
            const playerDoc = await transaction.get(playerRef);

            // 2. CHECKS & CALCS
            if (data.status === 'paid') return; // Already paid
            const amount = data.amount;

            // 3. WRITES
            transaction.update(paymentRef, {
                status: 'paid',
                paidAt: serverTimestamp(),
                confirmedBy: confirmedByUserId
            });

            if (playerDoc.exists()) {
                const pData = playerDoc.data() as Player;
                const currentSummary = pData.financialSummary || { totalPaid: 0, totalPending: 0 };

                const newPaid = currentSummary.totalPaid + amount;
                const newPending = Math.max(0, currentSummary.totalPending - amount);

                transaction.update(playerRef, {
                    financialSummary: {
                        totalPaid: newPaid,
                        totalPending: newPending
                    }
                });
            }
        });
    }
};
