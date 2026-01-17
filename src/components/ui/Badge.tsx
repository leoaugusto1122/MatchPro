import React from 'react';
import { View, Text } from 'react-native';

export const Badge = ({ label, color = 'bg-slate-100', textColor = 'text-slate-600' }: { label: string, color?: string, textColor?: string }) => (
    <View className={`px-3 py-1 rounded-full ${color} self-start`}>
        <Text className={`text-[10px] font-black uppercase tracking-widest ${textColor}`}>
            {label}
        </Text>
    </View>
);
