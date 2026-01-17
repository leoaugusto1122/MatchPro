import { useAuthStore } from '@/stores/authStore';

export function useAuth() {
    const { user, signOut } = useAuthStore();

    return {
        user,
        isAuthenticated: !!user,
        signOut
    };
}
