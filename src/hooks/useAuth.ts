import { useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import { useAuthStore } from '@/stores/authStore';
import { doc, getDoc } from 'firebase/firestore';

export function useAuth() {
    const { user, signIn, signOut } = useAuthStore();

    useEffect(() => {
        // Listen to Firebase Auth state changes
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    // 1. Fetch User Data
                    const userRef = doc(db, 'users', firebaseUser.uid);
                    const userSnap = await getDoc(userRef);

                    let userData: any = {
                        id: firebaseUser.uid,
                        email: firebaseUser.email || '',
                        displayName: firebaseUser.displayName || '',
                        photoURL: firebaseUser.photoURL || undefined,
                        role: 'player', // default
                        teamId: undefined,
                        createdAt: new Date(),
                    };

                    if (userSnap.exists()) {
                        userData = { ...userData, ...userSnap.data() };
                    } else {
                        // Optional: Create user doc if it doesn't exist (e.g. Google Sign In first time)
                    }

                    // 2. Fetch Team Data if user has a teamId
                    let teamData = null;
                    if (userData.teamId) {
                        const teamRef = doc(db, 'teams', userData.teamId);
                        const teamSnap = await getDoc(teamRef);
                        if (teamSnap.exists()) {
                            teamData = { id: teamSnap.id, ...teamSnap.data() } as any;
                        }
                    }

                    // 3. Update Global Store
                    signIn(userData, teamData);

                } catch (error) {
                    console.error("Error fetching auth data:", error);
                    // Fallback to basic auth if firestore fails
                    signIn({
                        id: firebaseUser.uid,
                        email: firebaseUser.email || '',
                        displayName: firebaseUser.displayName || '',
                        role: 'player',
                        createdAt: new Date()
                    } as any, null);
                }
            } else {
                // User is signed out
                signOut();
            }
        });

        return unsubscribe;
    }, []);

    return {
        user,
        isAuthenticated: !!user,
    };
}
