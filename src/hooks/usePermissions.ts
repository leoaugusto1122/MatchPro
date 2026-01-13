import { useTeamStore } from '@/stores/teamStore';

export function usePermissions() {
    const role = useTeamStore(state => state.currentRole);

    const isOwner = role === 'owner';
    const isCoach = role === 'coach' || isOwner;
    const isStaff = role === 'staff' || isCoach;

    return {
        role,
        canManageTeam: isOwner,
        canManageRoster: isCoach,
        canManageMatches: isCoach,
        canEditMatchResults: isCoach, // or staff?
        canViewFinancials: isOwner, // strict
    };
}
