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

            for (const playerId of confirmedPlayerIds) {
                const playerRef = doc(db, 'teams', teamId, 'players', playerId);
                const playerDoc = await transaction.get(playerRef);

                if (!playerDoc.exists()) continue;

                const playerData = playerDoc.data() as Player;
                const userId = playerData.userId;

                if (userId) {
                    const memberRole = teamData.members?.[userId];
                    if (memberRole === 'coach' || memberRole === 'staff' || memberRole === 'owner') {
                        continue;
                    }
                }

                // Check duplicate: Use playerId as doc ID for uniqueness
                const paymentRef = doc(paymentsCollectionRef, playerId);
                const paymentDoc = await transaction.get(paymentRef);

                if (!paymentDoc.exists()) {
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

                    // UPDATE Player Financial Summary
                    const currentSummary = playerData.financialSummary || { totalPaid: 0, totalPending: 0 };
                    transaction.update(playerRef, {
                        financialSummary: {
                            totalPaid: currentSummary.totalPaid,
                            totalPending: currentSummary.totalPending + perGameAmount
                        }
                    });
                }
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

            const playersRef = collection(db, 'teams', teamId, 'players');
            const activePlayersQuery = query(playersRef, where('status', '==', 'active'));
            // Note: Querying outside transaction for the list is acceptable 
            // as long as we transact on each item individually or in a batch within transaction.
            const querySnapshot = await getDocs(activePlayersQuery);

            const players = querySnapshot.docs.map(d => ({ ...d.data(), id: d.id } as Player));

            for (const player of players) {
                const userId = player.userId;
                if (userId) {
                    const memberRole = teamData.members?.[userId];
                    if (memberRole === 'coach' || memberRole === 'staff' || memberRole === 'owner') {
                        continue;
                    }
                }

                // Doc ID format: playerId_YYYY_MM
                const paymentId = `${player.id}_${month.replace('-', '_')}`;
                const paymentRef = doc(db, 'teams', teamId, 'monthlyPayments', paymentId);

                // We also need ref to player to update summary inside transaction
                const playerRef = doc(db, 'teams', teamId, 'players', player.id);

                // We re-read player doc to ensure consistency of summary
                const paymentDoc = await transaction.get(paymentRef);
                const playerDoc = await transaction.get(playerRef);

                if (!paymentDoc.exists() && playerDoc.exists()) {
                    const pData = playerDoc.data() as Player;

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
                    const currentSummary = pData.financialSummary || { totalPaid: 0, totalPending: 0 };
                    transaction.update(playerRef, {
                        financialSummary: {
                            totalPaid: currentSummary.totalPaid,
                            totalPending: currentSummary.totalPending + monthlyAmount
                        }
                    });
                }
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
            const docSnap = await transaction.get(paymentRef);
            if (!docSnap.exists()) throw new Error("Payment document not found");

            const data = docSnap.data() as GamePayment | MonthlyPayment;
            if (data.status === 'paid') return; // Already paid

            const playerId = data.playerId;
            const amount = data.amount;

            transaction.update(paymentRef, {
                status: 'paid',
                paidAt: serverTimestamp(),
                confirmedBy: confirmedByUserId
            });

            // Update Player Financial Summary
            const playerRef = doc(db, 'teams', teamId, 'players', playerId);
            const playerDoc = await transaction.get(playerRef);

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
