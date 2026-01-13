import { create } from 'zustand';
import { Player } from '@/types/models';

interface TeamState {
    teamId: string | null;
    teamName: string | null;
    currentRole: 'owner' | 'coach' | 'staff' | 'player' | null;
    myPlayerProfile: Player | null; // The player doc for the current user in this team

    setTeamContext: (teamId: string, name: string, role: string, playerProfile: Player | null) => void;
    clearTeamContext: () => void;
    updateMyPlayerProfile: (profile: Player) => void;
}

export const useTeamStore = create<TeamState>((set) => ({
    teamId: null,
    teamName: null,
    currentRole: null,
    myPlayerProfile: null,

    setTeamContext: (teamId, name, role, playerProfile) => set({
        teamId,
        teamName: name,
        currentRole: role as any,
        myPlayerProfile: playerProfile
    }),

    clearTeamContext: () => set({
        teamId: null,
        teamName: null,
        currentRole: null,
        myPlayerProfile: null
    }),

    updateMyPlayerProfile: (profile) => set({ myPlayerProfile: profile }),
}));
