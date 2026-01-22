import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTeamStore } from '@/stores/teamStore';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Alert } from '@/types/models';
import { AlertService } from '@/services/alertService';
import { AlertSeverity } from '@/types/models';

export function useAlerts() {
    const { teamId, myPlayerProfile } = useTeamStore();
    const { user } = useAuthStore();
    const userId = user?.id;
    const isAthlete = myPlayerProfile?.isAthlete ?? false;

    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);

    // 1. Sync Logic (Trigger generation/cleanup when screen focuses)
    useFocusEffect(
        useCallback(() => {
            if (!teamId || !userId) return;

            const runSync = async () => {
                await AlertService.syncAlerts(userId, teamId, isAthlete);
            };

            runSync();
        }, [teamId, userId, isAthlete])
    );


    // 2. Real-time Listener
    useEffect(() => {
        if (!teamId || !userId) {
            setAlerts([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const q = query(
            collection(db, 'teams', teamId, 'alerts'),
            where('userId', '==', userId),
            where('status', '==', 'pending')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newAlerts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Alert));

            // Sort by severity (Critical > Warning > Info) then Date
            const severityOrder: Record<AlertSeverity, number> = {
                critical: 3,
                warning: 2,
                info: 1
            };

            newAlerts.sort((a, b) => {
                const diffSev = severityOrder[b.severity] - severityOrder[a.severity];
                if (diffSev !== 0) return diffSev;
                return b.createdAt - a.createdAt; // Descending date
            });

            setAlerts(newAlerts);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to alerts:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [teamId, userId]);


    // Computed Counts
    const counts = {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length,
        total: alerts.length
    };

    const refreshAlerts = async () => {
        if (userId && teamId) {
            setLoading(true);
            await AlertService.syncAlerts(userId, teamId, isAthlete);
            // Listener will update state
            setLoading(false);
        }
    };

    return {
        alerts,
        loading,
        refreshAlerts,
        counts
    };
}
