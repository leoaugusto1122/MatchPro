import { useTeamStore } from '@/stores/teamStore';

export function usePermissions() {
    const { currentRole: role, myPlayerProfile } = useTeamStore(state => state);

    // Permission Logic:
    // Owner: Determined by 'role' string (highest privilege)
    // Staff: Determined by 'isStaff' flag OR 'owner' role
    // Player: Determined by 'isAthlete' flag

    const isOwner = role === 'owner'; // Only true owner has this role string
    const isStaff = isOwner || myPlayerProfile?.isStaff === true;

    return {
        role,
        isOwner,
        isStaff,
        canManageTeam: isOwner,
        canManageRoster: isStaff,
        canManageMatches: isStaff,
        canEditMatchResults: isStaff,
        canViewFinancials: isOwner, // Strict Owner only
    };
}
