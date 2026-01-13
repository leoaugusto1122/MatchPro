export type UserRole = 'owner' | 'coach' | 'staff' | 'player';

export interface User {
    id: string;
    email: string;
    displayName: string;
    photoURL?: string;
    role: UserRole;
    teamId?: string; // Link to the team they belong to
    createdAt: Date; // or Firestore Timestamp
}

export interface Team {
    id: string;
    name: string;
    ownerId: string;
    badgeURL?: string;
    createdAt: Date;
    code: string; // Invite code

    // Financial Settings
    billingMode?: 'PER_GAME' | 'MONTHLY' | 'MONTHLY_PLUS_GAME';
    perGameAmount?: number;
    monthlyAmount?: number;
    billingDay?: number;
    members?: Record<string, 'owner' | 'coach' | 'staff' | 'player'>;
}

export interface GamePayment {
    id: string;
    type: 'PER_GAME';
    teamId: string;
    matchId: string;
    playerId: string;
    amount: number;
    status: 'paid' | 'pending';
    paidAt?: any; // Firestore Timestamp
    confirmedBy?: string; // userId
    createdAt: any; // Firestore Timestamp
}

export interface MonthlyPayment {
    id: string; // Format: playerId_YYYY_MM
    type: 'MONTHLY';
    teamId: string;
    playerId: string;
    month: string; // Format: 'YYYY-MM'
    amount: number;
    status: 'paid' | 'pending';
    paidAt?: any; // Firestore Timestamp
    confirmedBy?: string; // userId
    createdAt: any; // Firestore Timestamp
}


export interface Player {
    id: string; // Document ID in 'players' collection
    name: string;
    photoURL?: string;
    position?: 'GK' | 'DEF' | 'MID' | 'FWD';
    status: 'active' | 'reserve';
    userId?: string; // Optional: Link to Auth User

    // Stats (can be calculated or stored)
    overallRating?: number;
    goals: number;
    assists: number;
    matchesPlayed: number;
    goalParticipations?: number;
    averageGoalsPerMatch?: number;
    averageAssistsPerMatch?: number;
    mvpScore?: number; // goalParticipations + averageGoalsPerMatch

    // Legacy mapping if needed
    email?: string;

    // Financial Summary
    financialSummary?: {
        totalPaid: number;
        totalPending: number;
    };
}



export type PresenceStatus = 'confirmed' | 'maybe' | 'out';

export interface Match {
    id: string;
    teamId: string;
    date: any; // Firestore Timestamp
    opponent?: string; // If friendly match
    location?: string;
    status: 'scheduled' | 'ongoing' | 'finished' | 'canceled';
    scoreHome: number;
    scoreAway: number;

    // Presence: { [playerId]: { status: PresenceStatus, playerName: string } }
    presence?: Record<string, { status: PresenceStatus, name: string, isGhost?: boolean }>;

    // Voting
    votingStatus?: 'hidden' | 'open' | 'closed';
    votingDeadline?: any; // Firestore Timestamp
    votingResults?: {
        communityRatings: Record<string, number>; // playerId -> avg
        coachRatings?: Record<string, number>; // playerId -> score
        motm?: string; // playerId
        totalVotes: number;
    };
}

export interface MatchVote {
    id: string; // Document ID (usually userId or playerId to ensure uniqueness)
    userId: string; // The user who voted
    playerId: string; // The player profile ID of the voter
    matchId: string;

    // Votes
    ratings: Record<string, number>; // playerId -> 1-10
    motmVote?: string; // playerId of the best player

    createdAt: any;
    updatedAt: any;
}

export interface MatchEvent {
    id: string;
    type: 'goal' | 'assist';
    playerId: string;
    playerName: string;
    createdAt: any; // Firestore Timestamp
}

