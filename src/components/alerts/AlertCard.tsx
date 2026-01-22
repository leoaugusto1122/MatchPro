import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Alert } from '@/types/models';
import { AlertTriangle, Bell, ChevronRight, DollarSign, Users, Star, Clock } from 'lucide-react-native';

interface AlertCardProps {
    alert: Alert;
    onPress: (alert: Alert) => void;
}

export function AlertCard({ alert, onPress }: AlertCardProps) {
    const getIcon = (type: string) => {
        switch (type) {
            case 'PAYMENT_PENDING': return <DollarSign size={20} color="#EF4444" />; // Red for payment
            case 'CONFIRM_PRESENCE': return <Clock size={20} color="#F97316" />; // Orange for presence
            case 'VOTE_MATCH': return <Star size={20} color="#EAB308" />; // Yellow for vote
            case 'TEAM_EVENT': return <Users size={20} color="#3B82F6" />;
            case 'SYSTEM': return <AlertTriangle size={20} color="#64748B" />;
            default: return <Bell size={20} color="#64748B" />;
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'border-l-red-500 bg-red-50/50';
            case 'warning': return 'border-l-orange-500 bg-orange-50/50';
            case 'info': return 'border-l-blue-500 bg-blue-50/50';
            default: return 'border-l-slate-500 bg-slate-50/50';
        }
    };

    return (
        <TouchableOpacity
            onPress={() => onPress(alert)}
            className={`flex-row items-center p-4 mb-3 bg-white rounded-xl shadow-sm border-l-4 ${getSeverityColor(alert.severity)}`}
        >
            <View className="mr-3 p-2 bg-white rounded-full shadow-sm">
                {getIcon(alert.type)}
            </View>
            <View className="flex-1">
                <Text className="text-slate-800 font-bold text-sm mb-1">{alert.title}</Text>
                <Text className="text-slate-500 text-xs leading-4">{alert.message}</Text>
                {alert.action && (
                    <Text className="text-slate-400 text-[10px] font-bold uppercase mt-2">{alert.action.label} &rarr;</Text>
                )}
            </View>
            <ChevronRight size={16} color="#CBD5E1" />
        </TouchableOpacity>
    );
}
