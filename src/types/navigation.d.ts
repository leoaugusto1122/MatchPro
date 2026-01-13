export type RootStackParamList = {
    Auth: undefined;
    Main: undefined;
    MatchDetails: { matchId: string };
    PlayerProfile: { playerId: string };
};

declare global {
    namespace ReactNavigation {
        interface RootParamList extends RootStackParamList { }
    }
}
