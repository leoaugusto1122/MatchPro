import { db } from './firebase';
import { collection, doc, setDoc, updateDoc, Timestamp, query, getDocs, getDoc } from 'firebase/firestore';
import { Match, MatchVote } from '@/types/models';

export const VoteService = {

    /**
     * Opens the voting for a finished match.
     * Only Owner/Coach should call this.
     */
    async openVoting(teamId: string, matchId: string, durationHours: number = 48) {
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + durationHours);

        await updateDoc(doc(db, 'teams', teamId, 'matches', matchId), {
            votingStatus: 'open',
            votingDeadline: Timestamp.fromDate(deadline)
        });
    },

    /**
     * Manually closes the voting.
     */
    async closeVoting(teamId: string, matchId: string) {
        await updateDoc(doc(db, 'teams', teamId, 'matches', matchId), {
            votingStatus: 'closed'
        });
    },

    /**
     * Validates and submits a vote.
     * Enforces:
     * - One vote per user (guaranteed by doc ID)
     * - 1-10 ratings
     * - No self-vote for MOTM
     * - Voter must be confirmed in match
     */
    async submitVote(
        teamId: string,
        matchId: string,
        userId: string,
        voterPlayerId: string,
        ratings: Record<string, number>,
        motmVote: string | null
    ) {
        // 1. Fetch Match to validate rules
        const matchRef = doc(db, 'teams', teamId, 'matches', matchId);
        const matchSnap = await getDoc(matchRef);

        if (!matchSnap.exists()) throw new Error('Partida não encontrada.');
        const match = matchSnap.data() as Match;

        // Rule: Voting must be open
        if (match.votingStatus !== 'open') {
            throw new Error('Votação encerrada ou não iniciada.');
        }

        // Rule: Check deadline
        if (match.votingDeadline && match.votingDeadline.toMillis() < Date.now()) {
            throw new Error('Prazo de votação expirado.');
        }

        // Rule: Voter must be confirmed
        const presence = match.presence?.[voterPlayerId];
        if (!presence || presence.status !== 'confirmed') {
            throw new Error('Apenas jogadores confirmados na partida podem votar.');
        }

        // Rule: Ratings 1-10
        for (const [pid, rating] of Object.entries(ratings)) {
            if (rating < 1 || rating > 10) {
                throw new Error(`Nota inválida para o jogador ${pid}. Deve ser entre 1 e 10.`);
            }
        }

        // Rule: No self-vote for MOTM
        if (motmVote && motmVote === voterPlayerId) {
            throw new Error('Você não pode votar em si mesmo como Melhor da Partida.');
        }

        // Save Vote
        const voteRef = doc(db, 'teams', teamId, 'matches', matchId, 'votes', userId);
        const payload: MatchVote = {
            id: userId,
            userId,
            playerId: voterPlayerId,
            matchId,
            ratings,
            motmVote: motmVote || undefined,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        await setDoc(voteRef, payload);
    },

    /**
     * Fetch all votes for calculation/display.
     */
    async getVotes(teamId: string, matchId: string): Promise<MatchVote[]> {
        const q = query(collection(db, 'teams', teamId, 'matches', matchId, 'votes'));
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as MatchVote);
    },

    /**
     * Helper to check if a user has already voted
     */
    async hasUserVoted(teamId: string, matchId: string, userId: string): Promise<boolean> {
        const voteRef = doc(db, 'teams', teamId, 'matches', matchId, 'votes', userId);
        const snap = await getDoc(voteRef);
        return snap.exists();
    }
};
