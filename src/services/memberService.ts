import { db } from './firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayRemove, deleteField, query, orderBy, getDocs, where, arrayUnion } from 'firebase/firestore';
import { MemberHistory, Player } from '@/types/models';

const MEMBER_HISTORY_COLLECTION = 'memberHistory';

export const MemberService = {

    /**
     * Logs a member action (JOIN, LEAVE, KICK)
     */
    logEvent: async (
        teamId: string,
        action: 'JOIN' | 'LEAVE' | 'KICK' | 'REINTEGRATE',
        player: { id?: string; name: string; userId?: string },
        performedBy?: { id: string; name: string }
    ) => {
        try {
            const historyRef = collection(db, 'teams', teamId, MEMBER_HISTORY_COLLECTION);

            const event: Omit<MemberHistory, 'id'> = {
                teamId,
                playerId: player.id,
                userId: player.userId,
                playerName: player.name,
                action,
                createdAt: serverTimestamp(),
            };

            if (performedBy) {
                event.performedBy = performedBy.id;
                event.performedByName = performedBy.name;
            }

            await addDoc(historyRef, event);
            console.log(`[MemberService] Logged ${action} for ${player.name}`);
        } catch (error) {
            console.error("[MemberService] Error logging event:", error);
            // We don't throw here to avoid blocking the main action if logging fails, 
            // but in a strict audit system, we might want to ensure it succeeds.
        }
    },

    /**
     * Expels a member from the team.
     * - Logs KICK event
     * - Marks player as inactive (keeps stats)
     * - Unlinks authId (removes access)
     * - Removes from Team members list
     */
    kickMember: async (
        teamId: string,
        player: Player,
        kickedBy: { id: string; name: string }
    ) => {
        if (!teamId || !player.id) throw new Error("Invalid parameters");

        // 1. Log Event FIRST (Audit) (Use player.id as fallback for userId if ghost)
        await MemberService.logEvent(teamId, 'KICK', {
            id: player.id,
            name: player.name,
            userId: player.userId || player.authId || player.id // Fallback to doc ID if no auth
        }, kickedBy);

        const teamRef = doc(db, 'teams', teamId);
        const playerRef = doc(db, 'teams', teamId, 'players', player.id);

        try {
            // 2. Remove from Team Members (Access Control)
            const updates: any = {};
            const idToRemove = player.authId || player.userId;

            if (idToRemove) {
                updates.memberIds = arrayRemove(idToRemove);
                updates[`members.${idToRemove}`] = deleteField();
            }


            await updateDoc(teamRef, updates);

            // 3. Update Player Document (unlink but keep data)
            // We set status to expelled and KEPT authId so we can identiy them later to block re-entry
            await updateDoc(playerRef, {
                status: 'expelled',
                // authId: deleteField(), // REMOVED: Keep authId to block re-entry
                // userId: deleteField()  // REMOVED: Keep userId to block re-entry
            });

        } catch (error) {
            console.error("[MemberService] Error kicking member:", error);
            throw error;
        }
    },

    /**
     * Get member history ordered by date
     */
    getHistory: async (teamId: string) => {
        try {
            const historyRef = collection(db, 'teams', teamId, MEMBER_HISTORY_COLLECTION);
            const q = query(historyRef, orderBy('createdAt', 'desc')); // Most recent first
            const snapshot = await getDocs(q);

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as MemberHistory[];
        } catch (error) {
            console.error("[MemberService] Error fetching history:", error);
            return [];
        }
    },

    /**
     * Get active members (for list)
     */
    getActiveMembers: async (teamId: string) => {
        try {
            const playersRef = collection(db, 'teams', teamId, 'players');
            // We want active players (status != inactive is implied, but let's be explicit)
            const q = query(playersRef, where('status', '==', 'active'));
            const snapshot = await getDocs(q);

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Player[];
        } catch (error) {
            console.error("[MemberService] Error fetching members:", error);
            return [];
        }
    },

    /**
     * Reintegrates an expelled member.
     */
    reintegrateMember: async (
        teamId: string,
        player: Player,
        performedBy: { id: string; name: string }
    ) => {
        if (!teamId || !player.id) throw new Error("Invalid parameters");

        const teamRef = doc(db, 'teams', teamId);
        const playerRef = doc(db, 'teams', teamId, 'players', player.id);

        try {
            // 1. Log Event FIRST
            await MemberService.logEvent(teamId, 'REINTEGRATE', {
                id: player.id,
                name: player.name,
                userId: player.userId || player.authId
            }, performedBy);

            // 2. Add back to Team Members (Restore Access)
            const updates: any = {};
            const idToRestore = player.authId || player.userId;

            if (idToRestore) {
                updates.memberIds = arrayUnion(idToRestore);
                updates[`members.${idToRestore}`] = 'player'; // Default back to player
            }

            await updateDoc(teamRef, updates);

            // 3. Update Player Status
            await updateDoc(playerRef, {
                status: 'active'
            });

        } catch (error) {
            console.error("[MemberService] Error reintegrating member:", error);
            throw error;
        }
    }
};
