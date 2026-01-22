import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AlertCircle, ChevronRight, Bell, AlertTriangle } from 'lucide-react-native';

interface DashboardAlertsSummaryProps {
    counts: {
        critical: number;
        warning: number;
        info: number;
        total: number;
    };
    onPress: () => void;
}

export function DashboardAlertsSummary({ counts, onPress }: DashboardAlertsSummaryProps) {
    if (counts.total === 0) return null;

    // Critical Style
    if (counts.critical > 0) {
        return (
            <TouchableOpacity onPress={onPress} className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl flex-row items-center shadow-sm">
                <View className="bg-red-100 p-2 rounded-full">
                    <AlertCircle color="#EF4444" size={20} />
                </View>
                <View className="ml-3 flex-1">
                    <Text className="text-red-800 font-black italic text-xs uppercase tracking-wide">Atenção Necessária</Text>
                    <Text className="text-red-900 font-medium text-sm">
                        {counts.critical} {counts.critical === 1 ? 'alerta crítico' : 'alertas críticos'} requerem sua ação.
                    </Text>
                </View>
                <ChevronRight color="#EF4444" size={20} />
            </TouchableOpacity>
        );
    }

    // Warning Style
    if (counts.warning > 0) {
        return (
            <TouchableOpacity onPress={onPress} className="mb-6 bg-orange-50 border border-orange-200 p-4 rounded-xl flex-row items-center shadow-sm">
                <View className="bg-orange-100 p-2 rounded-full">
                    <AlertTriangle color="#F97316" size={20} />
                </View>
                <View className="ml-3 flex-1">
                    <Text className="text-orange-800 font-black italic text-xs uppercase tracking-wide">Pendências</Text>
                    <Text className="text-orange-900 font-medium text-sm">
                        Você tem {counts.warning} {counts.warning === 1 ? 'aviso importante' : 'avisos importantes'}.
                    </Text>
                </View>
                <ChevronRight color="#F97316" size={20} />
            </TouchableOpacity>
        );
    }

    // Info Style (Default)
    return (
        <TouchableOpacity onPress={onPress} className="mb-6 bg-blue-50 border border-blue-200 p-4 rounded-xl flex-row items-center shadow-sm">
            <View className="bg-blue-100 p-2 rounded-full">
                <Bell color="#3B82F6" size={20} />
            </View>
            <View className="ml-3 flex-1">
                <Text className="text-blue-800 font-black italic text-xs uppercase tracking-wide">Informativos</Text>
                <Text className="text-blue-900 font-medium text-sm">
                    Você tem {counts.total} {counts.total === 1 ? 'nova notificação' : 'novas notificações'}.
                </Text>
            </View>
            <ChevronRight color="#3B82F6" size={20} />
        </TouchableOpacity>
    );
}
