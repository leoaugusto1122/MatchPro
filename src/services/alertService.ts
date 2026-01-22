import { db } from '@/services/firebase';
import { collection, query, where, getDocs, writeBatch, doc, Timestamp, orderBy, limit, updateDoc } from 'firebase/firestore';
import { Match, Player, Alert } from '@/types/models';

export const AlertService = {
    /**
     * Sincroniza alertas no Firestore baseado no estado atual do usuário e do time.
     * Deve ser chamado ao entrar no app/dashboard.
     */
    syncAlerts: async (userId: string, teamId: string, isAthlete: boolean) => {
        if (!userId || !teamId) return;

        try {
            const batch = writeBatch(db);
            const now = new Date();
            const alertsRef = collection(db, 'teams', teamId, 'alerts');

            // 1. Buscar Alertas Pendentes Atuais do Usuário
            const qAlerts = query(
                alertsRef,
                where('userId', '==', userId),
                where('status', '==', 'pending')
            );
            const alertsSnap = await getDocs(qAlerts);
            const existingAlertsMap = new Map<string, Alert>();
            alertsSnap.docs.forEach(d => {
                const data = d.data() as Alert;
                existingAlertsMap.set(d.id, data);
            });

            // Set de IDs de alertas que DEVEM existir (para não remover/resolver indevidamente)
            const shouldExistIds = new Set<string>();

            // =================================================================
            // REGRAS DE NEGÓCIO
            // =================================================================

            // A. CONFIRM_PRESENCE (Se for atleta)
            if (isAthlete) {
                // Buscar partidas futuras próximas (ex: próximos 15 dias)
                const matchesRef = collection(db, 'teams', teamId, 'matches');
                const qMatches = query(
                    matchesRef,
                    where('date', '>=', Timestamp.fromDate(now)),
                    orderBy('date', 'asc'),
                    limit(5)
                );
                const matchesSnap = await getDocs(qMatches);

                matchesSnap.docs.forEach(docSnap => {
                    const match = { id: docSnap.id, ...docSnap.data() } as Match;
                    if (match.status === 'canceled') return;

                    const playerPresence = match.presence?.[userId];
                    const isConfirmed = playerPresence?.status === 'confirmed';
                    const isRejected = playerPresence?.status === 'out';

                    if (!isConfirmed && !isRejected) {
                        const alertId = `presence_${match.id}_${userId}`;
                        shouldExistIds.add(alertId);

                        if (!existingAlertsMap.has(alertId)) {
                            const newAlert: Alert = {
                                id: alertId,
                                userId,
                                teamId,
                                type: 'CONFIRM_PRESENCE',
                                title: 'Confirmar Presença',
                                message: `Partida contra ${match.opponent || 'Adversário'} em breve.`,
                                severity: 'warning',
                                status: 'pending',
                                relatedEntity: { type: 'match', id: match.id },
                                action: {
                                    label: 'Confirmar',
                                    screen: 'MatchDetails',
                                    params: { matchId: match.id }
                                },
                                createdAt: Timestamp.now()
                            };
                            batch.set(doc(alertsRef, alertId), newAlert);
                        }
                    }
                });
            }

            // B. VOTE_MATCH (Se for atleta)
            if (isAthlete) {
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

                const matchesRef = collection(db, 'teams', teamId, 'matches');
                const qFinished = query(
                    matchesRef,
                    where('status', '==', 'finished'),
                    where('date', '>=', Timestamp.fromDate(oneWeekAgo)),
                    orderBy('date', 'desc'),
                    limit(5)
                );
                const finishedSnap = await getDocs(qFinished);

                // Use Promise.all to handle async existence checks
                await Promise.all(finishedSnap.docs.map(async (docSnap) => {
                    const match = { id: docSnap.id, ...docSnap.data() } as Match;

                    if (match.votingStatus === 'open') {
                        const wasPresent = match.presence?.[userId]?.status === 'confirmed';

                        if (wasPresent) {
                            let hasVoted = false;
                            try {
                                // Check if user has a vote doc in subcollection
                                const votesQ = query(collection(db, 'teams', teamId, 'matches', match.id, 'votes'), where('userId', '==', userId), limit(1));
                                const voteSnap = await getDocs(votesQ);
                                hasVoted = !voteSnap.empty;
                            } catch (e) {
                                console.log("Error checking vote", e);
                            }

                            if (!hasVoted) {
                                const alertId = `vote_${match.id}_${userId}`;
                                shouldExistIds.add(alertId);

                                if (!existingAlertsMap.has(alertId)) {
                                    const newAlert: Alert = {
                                        id: alertId,
                                        userId,
                                        teamId,
                                        type: 'VOTE_MATCH',
                                        title: 'Votação Aberta',
                                        message: `Avalie os jogadores da partida contra ${match.opponent}.`,
                                        severity: 'info',
                                        status: 'pending',
                                        relatedEntity: { type: 'match', id: match.id },
                                        action: {
                                            label: 'Votar',
                                            screen: 'MatchDetails',
                                            params: { matchId: match.id }
                                        },
                                        createdAt: Timestamp.now()
                                    };
                                    batch.set(doc(alertsRef, alertId), newAlert);
                                }
                            }
                        }
                    }
                }));
            }

            // C. PAYMENT_PENDING
            const playersRef = collection(db, 'teams', teamId, 'players');
            const qPlayer = query(playersRef, where('userId', '==', userId), limit(1));
            const playerSnap = await getDocs(qPlayer);

            if (!playerSnap.empty) {
                const player = playerSnap.docs[0].data() as Player;
                const playerId = playerSnap.docs[0].id;

                // Se tiver pendências
                if (player.financialSummary && player.financialSummary.totalPending > 0) {
                    const alertId = `payment_pending_${userId}`;
                    shouldExistIds.add(alertId);

                    if (!existingAlertsMap.has(alertId)) {
                        const newAlert: Alert = {
                            id: alertId,
                            userId,
                            teamId,
                            type: 'PAYMENT_PENDING',
                            title: 'Pagamento Pendente',
                            message: `Você possui pendências totalizando R$ ${player.financialSummary.totalPending.toFixed(2)}.`,
                            severity: 'critical',
                            status: 'pending',
                            relatedEntity: { type: 'payment', id: playerId },
                            action: {
                                label: 'Regularizar',
                                screen: 'Financeiro',
                            },
                            createdAt: Timestamp.now()
                        };
                        batch.set(doc(alertsRef, alertId), newAlert);
                    }
                }
            }


            // =================================================================
            // LIMPEZA (Resolver alertas que não são mais válidos)
            // =================================================================
            // Para cada alerta pendente existente:
            existingAlertsMap.forEach((_, id) => {
                if (!shouldExistIds.has(id)) {
                    // Marcar como resolvido
                    batch.update(doc(alertsRef, id), {
                        status: 'resolved',
                        resolvedAt: Timestamp.now()
                    });
                }
            });

            await batch.commit();

        } catch (error) {
            console.error("Erro ao sincronizar alertas:", error);
        }
    },

    /**
     * Marca um alerta como resolvido manualmente ou por ação
     */
    resolveAlert: async (teamId: string, alertId: string) => {
        try {
            const alertRef = doc(db, 'teams', teamId, 'alerts', alertId);
            await updateDoc(alertRef, {
                status: 'resolved',
                resolvedAt: Timestamp.now()
            });
        } catch (e) {
            console.error("Erro ao resolver alerta:", e);
        }
    }
};
