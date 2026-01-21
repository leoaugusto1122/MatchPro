export type UserRole = 'owner' | 'coach' | 'staff' | 'player';

export interface User {
    id: string;
    email: string;
    displayName: string;
    nickname?: string; // Added optional nickname
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
    inviteToken?: string;
    inviteLink?: string; // stored full URL
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
    isAthlete?: boolean; // Determines if they play in matches
    isGhost?: boolean; // If true, not linked to a real auth user
    name: string;
    nickname?: string; // Apelido
    photoURL?: string;
    position?: 'GK' | 'DEF' | 'MID' | 'FWD';
    dominantFoot?: 'Destro' | 'Canhoto' | 'Ambidestro';
    status: 'active' | 'inactive'; // Changed from reserve to inactive
    userId?: string; // Optional: Link to Auth User
    authId?: string; // Legacy/Duplicate of userId
    isStaff?: boolean; // Determines if they have staff permissions
    role?: 'owner' | 'coach' | 'staff' | 'player';

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

    // Financial Settings
    paymentMode?: 'monthly' | 'per_game' | 'exempt';

    // Ratings
    fanRating?: number; // Legacy?
    coachRating?: number; // Legacy?
    totalCrowdVotes?: number;

    // Ratings Aggregation
    technicalRatingSum?: number;
    technicalRatingCount?: number;
    averageTechnicalRating?: number;

    communityRatingSum?: number;
    communityRatingCount?: number;
    averageCommunityRating?: number;
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

    // New Summary & Stats
    stats?: Record<string, PlayerMatchStats>; // userId -> stats
    // Voting
    votingStatus?: 'hidden' | 'open' | 'closed';
    votingDeadline?: any; // Firestore Timestamp
    votingResults?: {
        communityRatings: Record<string, number>; // playerId -> avg
        coachRatings?: Record<string, number>; // playerId -> score
        motm?: string; // playerId
        totalVotes: number;
        crowdVoteCounts?: Record<string, number>; // playerId -> count
    };

    // Awards - Calculated on finalize
    awards?: {
        bestPlayerId: string | null;
        bestPlayerScore: number;
        crowdFavoriteId: string | null;
        crowdFavoriteVotes: number;
    };
}

export interface PlayerMatchStats {
    goals: number;
    assists: number;
    notaTecnica?: number;
    avaliadorTecnicoId?: string; // Owner/Coach ID who gave the rating
    faltou?: boolean; // If true, marked as missed even if confirmed
}

export interface SocialVote {
    id?: string;
    fromUserId: string;
    toUserId: string;
    matchId: string;
    rating: number; // 1-10 or 1-5
    createdAt: any;
}

export interface MatchVote {
    id: string; // Document ID (usually userId or playerId to ensure uniqueness)
    userId: string; // The user who voted
    playerId: string; // The player profile ID of the voter
    matchId: string;

    // Votes
    ratings: Record<string, number>; // playerId -> 1-10
    bestPlayerVote?: string; // playerId of the best player

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


export type TransactionType = 'income' | 'expense';
export type TransactionCategory = 'monthly' | 'game' | 'other';
export type TransactionStatus = 'pending' | 'paid';

export interface Transaction {
    id: string;
    teamId: string;
    playerId?: string; // Optional if generic expense
    type: TransactionType;
    category: TransactionCategory;
    description: string;
    amount: number;
    date: any; // Firestore Timestamp
    status: TransactionStatus;
    gameId?: string; // Links to a match
    paidAt?: any;
    createdAt?: any;
    createdBy?: string;
}
