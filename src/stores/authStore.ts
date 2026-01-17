import { create } from 'zustand';
import { User as FirestoreUser } from '@/types/models';
import { User as FirebaseAuthUser } from 'firebase/auth';

interface AuthState {
    user: FirestoreUser | null;
    authUser: FirebaseAuthUser | null;
    isLoading: boolean;
    setAuthUser: (user: FirebaseAuthUser | null) => void;
    setUserData: (user: FirestoreUser | null) => void;
    signOut: () => void;
    updateUser: (updates: Partial<FirestoreUser>) => void;
    setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null, // Firestore Profile
    authUser: null, // Firebase Auth User
    isLoading: true,
    setAuthUser: (authUser) => set({ authUser }), // Don't auto-disable loading here
    setUserData: (user) => set({ user }),
    setLoading: (isLoading) => set({ isLoading }),
    signOut: () => set({ user: null, authUser: null, isLoading: false }),
    updateUser: (updates) =>
        set((state) => ({
            user: state.user ? { ...state.user, ...updates } : null,
        })),
}));
