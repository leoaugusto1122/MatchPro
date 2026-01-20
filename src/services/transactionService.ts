import { db } from './firebase';
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    onSnapshot,
    serverTimestamp,
    getDocs,
    getDoc,
    setDoc,
    limit
} from 'firebase/firestore';
import { Transaction, Team, Player, Match } from '@/types/models';

export const TransactionService = {
    /**
     * Creates a new transaction (Income or Expense).
     */
    createTransaction: async (teamId: string, transactionData: Omit<Transaction, 'id' | 'teamId' | 'createdAt'>) => {
        try {
            const ref = collection(db, 'teams', teamId, 'transactions');
            await addDoc(ref, {
                ...transactionData,
                teamId,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error creating transaction:", error);
            throw error;
        }
    },

    /**
     * Updates an existing transaction.
     */
    updateTransaction: async (teamId: string, transactionId: string, updates: Partial<Transaction>) => {
        try {
            const ref = doc(db, 'teams', teamId, 'transactions', transactionId);
            await updateDoc(ref, updates);
        } catch (error) {
            console.error("Error updating transaction:", error);
            throw error;
        }
    },

    /**
     * Mark a transaction as PAID.
     */
    markAsPaid: async (teamId: string, transactionId: string) => {
        try {
            const ref = doc(db, 'teams', teamId, 'transactions', transactionId);
            await updateDoc(ref, {
                status: 'paid',
                paidAt: serverTimestamp()
            });

            // If it's linked to a player, we might want to update their summary, 
            // but pure aggregation might be better handled by a cloud function or on-demand calc to avoid drift.
            // For now, we'll keep it simple and just update the status.
        } catch (error) {
            console.error("Error marking as paid:", error);
            throw error;
        }
    },

    /**
     * Deletes a transaction (Usually for manual expenses).
     */
    deleteTransaction: async (teamId: string, transactionId: string) => {
        try {
            await deleteDoc(doc(db, 'teams', teamId, 'transactions', transactionId));
        } catch (error) {
            console.error("Error deleting transaction:", error);
            throw error;
        }
    },

    /**
     * Subscribe to transactions for a specific game.
     */
    subscribeToMatchTransactions: (teamId: string, matchId: string, onUpdate: (data: Transaction[]) => void) => {
        const ref = collection(db, 'teams', teamId, 'transactions');
        const q = query(ref, where('gameId', '==', matchId));
        return onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
            // Sort client-side
            list.sort((a, b) => {
                const dateA = a.date?.seconds || 0;
                const dateB = b.date?.seconds || 0;
                return dateB - dateA; // Descending
            });
            onUpdate(list);
        });
    },

    /**
     * Subscribe to all PENDING transactions for the team.
     * Note: Sorting client-side to avoid composite index requirement.
     */
    subscribeToPendingTransactions: (teamId: string, onUpdate: (data: Transaction[]) => void) => {
        const ref = collection(db, 'teams', teamId, 'transactions');
        const q = query(ref, where('status', '==', 'pending'));
        return onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
            list.sort((a, b) => {
                const dateA = a.date?.seconds || 0;
                const dateB = b.date?.seconds || 0;
                return dateB - dateA;
            });
            onUpdate(list);
        });
    },

    /**
     * Subscribe to RECENT transactions for the team (Activity Feed).
     * Limits to 50 items.
     */
    subscribeToRecentTransactions: (teamId: string, limitCount: number = 50, onUpdate: (data: Transaction[]) => void) => {
        const ref = collection(db, 'teams', teamId, 'transactions');

        // Safe query without composite index requirement.
        // We fetch a larger chunk (limitCount * 2) and sort client-side.
        // This ensures we see data immediately even if 'date' index is missing.
        const q = query(ref, limit(100));

        return onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
            // Ensure sort client side
            list.sort((a, b) => {
                const dateA = a.date?.seconds || 0;
                const dateB = b.date?.seconds || 0;
                return dateB - dateA;
            });
            onUpdate(list.slice(0, limitCount));
        }, (error) => {
            console.error("Error in recent transactions subscription (Safe Mode):", error);
            onUpdate([]);
        });
    },

    /**
     * Subscribe to player's financial history.
     */
    subscribeToPlayerTransactions: (teamId: string, playerId: string, onUpdate: (data: Transaction[]) => void) => {
        const ref = collection(db, 'teams', teamId, 'transactions');
        const q = query(ref, where('playerId', '==', playerId));
        return onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
            list.sort((a, b) => {
                const dateA = a.date?.seconds || 0;
                const dateB = b.date?.seconds || 0;
                return dateB - dateA;
            });
            onUpdate(list);
        });
    },

    /**
     * Subscribe to ALL transactions for the team (for client-side filtering/aggregation).
     * Returns the raw list via callback.
     */
    subscribeToAllTransactions: (teamId: string, onUpdate: (data: Transaction[]) => void) => {
        const ref = collection(db, 'teams', teamId, 'transactions');
        const q = query(ref, limit(500)); // Safety limit
        return onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
            // Sort client-side (Newest first)
            list.sort((a, b) => { // @ts-ignore
                const dateA = a.date?.seconds || 0; // @ts-ignore
                const dateB = b.date?.seconds || 0;
                return dateB - dateA;
            });
            onUpdate(list);
        }, (error) => {
            console.error("Error subscribing to all transactions:", error);
            // onUpdate([]); // Don't wipe data on error, just log
        });
    },

    /**
     * Simplified Match Transaction Generator (Non-transactional loop for now to avoid complexity, uses idempotent IDs)
     */
    syncMatchTransactions: async (teamId: string, matchId: string) => {


        const teamDoc = await getDocs(query(collection(db, 'teams'), where('__name__', '==', teamId)));
        const matchDoc = await getDocs(query(collection(db, 'teams', teamId, 'matches'), where('__name__', '==', matchId)));

        if (teamDoc.empty || matchDoc.empty) return;

        const team = teamDoc.docs[0].data() as Team;
        const match = matchDoc.docs[0].data() as Match;

        if (!team.perGameAmount || team.perGameAmount <= 0) return;
        if (team.billingMode === 'MONTHLY') return;

        const presence = match.presence || {};

        // Find players who should pay
        const playersRef = collection(db, 'teams', teamId, 'players');
        const playersSnap = await getDocs(playersRef);
        const playersMap = new Map();
        playersSnap.forEach(p => playersMap.set(p.id, p.data() as Player));



        // Better Implementation:
        const existingTransSnap = await getDocs(query(collection(db, 'teams', teamId, 'transactions'), where('gameId', '==', matchId)));
        const existingMap = new Set(existingTransSnap.docs.map(d => d.data().playerId));

        // We'll just do individual writes for now using Promise.all

        // Let's use simple logic:
        const updates: Promise<void>[] = [];

        for (const [playerId, pData] of Object.entries(presence)) {
            if (pData.status !== 'confirmed') continue;
            if (existingMap.has(playerId)) continue; // Already generated

            const player = playersMap.get(playerId);
            if (!player) continue;
            if (player.paymentMode === 'exempt') continue;

            // Logic:
            // Team: Monthly -> Player Monthly (Logic handled elsewhere), Player Per Game (Logic here?)
            // Team: Per Game -> Everyone pays per game (unless exempt).
            // Team: Hybrid -> Monthly pays monthly (maybe + game), Per Game pays game.

            // Assumption:
            // If Player is 'per_game', they pay here.
            // If Player is 'monthly', check Team Mode.
            // if Team 'MONTHLY_PLUS_GAME', they pay here too.
            // if Team 'PER_GAME', they pay here transactionally.
            // if Team 'MONTHLY', they DO NOT pay here (covered by monthly fee).

            let shouldCharge = false;
            if (player.paymentMode === 'per_game') shouldCharge = true;
            if (player.paymentMode === 'monthly' && team.billingMode === 'MONTHLY_PLUS_GAME') shouldCharge = true;
            if (!player.paymentMode) {
                // Default logic
                if (team.billingMode === 'PER_GAME') shouldCharge = true;
            }

            if (shouldCharge) {
                const customId = `match_${matchId}_${playerId}`;
                const tRef = doc(db, 'teams', teamId, 'transactions', customId);
                const description = `Jogo vs ${match.opponent || 'Treino'} (${match.date ? new Date(match.date.seconds * 1000).toLocaleDateString('pt-BR') : ''})`;

                updates.push(
                    (async () => {
                        const snap = await getDoc(tRef);
                        if (!snap.exists()) {
                            await setDoc(tRef, {
                                id: customId,
                                teamId,
                                playerId,
                                type: 'income',
                                category: 'game',
                                description,
                                amount: team.perGameAmount,
                                date: match.date, // Match date
                                status: 'pending',
                                gameId: matchId,
                                createdAt: serverTimestamp()
                            } as Transaction);
                        }
                    })()
                );
            }
        }

        await Promise.all(updates);
    },

    /**
     * Check and generate monthly fees for the current month.
     * Should be called on Admin App Open.
     */
    checkAndGenerateMonthlyTransactions: async (teamId: string) => {
        const teamRef = doc(db, 'teams', teamId);
        const teamSnap = await getDoc(teamRef);
        if (!teamSnap.exists()) return;

        const team = teamSnap.data() as Team;
        if (team.billingMode === 'PER_GAME') return; // No monthly fees
        if (!team.monthlyAmount) return;

        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM

        // Get all players
        const playersRef = collection(db, 'teams', teamId, 'players');
        const q = query(playersRef, where('status', '==', 'active'));
        const playersSnap = await getDocs(q);

        const updates: Promise<void>[] = [];

        playersSnap.forEach(pDoc => {
            const player = pDoc.data() as Player;
            // Check eligibility
            let isMonthly = false;
            if (player.paymentMode === 'monthly') isMonthly = true;
            if (!player.paymentMode && (team.billingMode === 'MONTHLY' || team.billingMode === 'MONTHLY_PLUS_GAME')) isMonthly = true;

            if (player.paymentMode === 'exempt' || player.paymentMode === 'per_game') isMonthly = false;

            if (isMonthly) {
                const customId = `monthly_${monthKey}_${player.id}`;
                const tRef = doc(db, 'teams', teamId, 'transactions', customId);
                const description = `Mensalidade ${monthKey}`;

                updates.push(
                    (async () => {
                        const snap = await getDoc(tRef);
                        if (!snap.exists()) {
                            await setDoc(tRef, {
                                id: customId,
                                teamId,
                                playerId: player.id,
                                type: 'income',
                                category: 'monthly',
                                description,
                                amount: team.monthlyAmount,
                                date: serverTimestamp(), // Charged NOW (beginning of month)
                                status: 'pending',
                                createdAt: serverTimestamp()
                            } as Transaction);
                        }
                    })()
                );
            }
        });

        await Promise.all(updates);
    },

    getSummary: async (teamId: string) => {
        // Simple aggregate (client side for now, should be server side if heavy)
        const ref = collection(db, 'teams', teamId, 'transactions');
        const snap = await getDocs(ref);
        let income = 0;
        let expense = 0;
        let pending = 0;

        snap.forEach(d => {
            const t = d.data() as Transaction;
            if (t.status === 'paid') {
                if (t.type === 'income') income += t.amount;
                if (t.type === 'expense') expense += t.amount;
            } else if (t.status === 'pending') {
                pending += t.amount;
            }
        });

        return { income, expense, pending, balance: income - expense };
    }
}
