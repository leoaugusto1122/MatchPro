import { create } from 'zustand';
import { User } from '@/types/models';

interface AuthState {
    user: User | null;
    isLoading: boolean;
    signIn: (user: User) => void;
    signOut: () => void;
    updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    signIn: (user) => set({ user, isLoading: false }),
    signOut: () => set({ user: null, isLoading: false }),
    updateUser: (updates) =>
        set((state) => ({
            user: state.user ? { ...state.user, ...updates } : null,
        })),
}));
