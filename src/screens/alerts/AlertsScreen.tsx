import React from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlerts } from '@/hooks/useAlerts';
import { AlertCard } from '@/components/alerts/AlertCard';
import { Header } from '@/components/ui/Header';
import { Alert } from '@/types/models';
import { CheckCircle2 } from 'lucide-react-native';

export default function AlertsScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { alerts, loading, refreshAlerts } = useAlerts();

    // Group alerts
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const warningAlerts = alerts.filter(a => a.severity === 'warning');
    const infoAlerts = alerts.filter(a => a.severity === 'info');

    const handlePress = (alert: Alert) => {
        if (alert.action) {
            navigation.navigate(alert.action.screen, alert.action.params);
        }
    };

    return (
        <View className="flex-1 bg-[#F8FAFC]">
            <View className="px-6 pb-2 bg-[#F8FAFC] z-10" style={{ paddingTop: Math.max(insets.top, 20) }}>
                <Header
                    title="CENTRAL DE ALERTAS"
                    subtitle="Gestão Operacional"
                    showBack
                    onBack={() => navigation.goBack()}
                />
            </View>

            <ScrollView
                className="flex-1 px-5 pt-4"
                refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshAlerts} tintColor="#006400" />}
                contentContainerStyle={{ paddingBottom: 50 }}
            >
                {alerts.length === 0 && !loading && (
                    <View className="items-center justify-center py-20 opacity-50">
                        <CheckCircle2 size={64} color="#16A34A" />
                        <Text className="mt-4 text-slate-500 font-bold text-lg">Tudo Certo!</Text>
                        <Text className="text-slate-400 text-sm">Nenhum alerta pendente.</Text>
                    </View>
                )}

                {/* Critical Section */}
                {criticalAlerts.length > 0 && (
                    <View className="mb-6">
                        <View className="flex-row items-center mb-3">
                            <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                            <Text className="text-red-600 font-black italic uppercase text-xs tracking-widest">Críticos</Text>
                        </View>
                        {criticalAlerts.map(alert => (
                            <AlertCard key={alert.id} alert={alert} onPress={handlePress} />
                        ))}
                    </View>
                )}

                {/* Warning Section */}
                {warningAlerts.length > 0 && (
                    <View className="mb-6">
                        <View className="flex-row items-center mb-3">
                            <View className="w-2 h-2 rounded-full bg-orange-500 mr-2" />
                            <Text className="text-orange-600 font-black italic uppercase text-xs tracking-widest">Atenção</Text>
                        </View>
                        {warningAlerts.map(alert => (
                            <AlertCard key={alert.id} alert={alert} onPress={handlePress} />
                        ))}
                    </View>
                )}

                {/* Info Section */}
                {infoAlerts.length > 0 && (
                    <View className="mb-6">
                        <View className="flex-row items-center mb-3">
                            <View className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                            <Text className="text-blue-600 font-black italic uppercase text-xs tracking-widest">Informativos</Text>
                        </View>
                        {infoAlerts.map(alert => (
                            <AlertCard key={alert.id} alert={alert} onPress={handlePress} />
                        ))}
                    </View>
                )}

            </ScrollView>
        </View>
    );
}
