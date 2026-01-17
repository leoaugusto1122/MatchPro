import React from 'react';
import { View, Text } from 'react-native';

export const Header = ({ title, subtitle, initials, rightComponent }: { title?: string, subtitle?: string, initials?: string, rightComponent?: React.ReactNode }) => (
    <View className="flex-row justify-between items-center mb-6 pt-4">
        <View>
            <Text className="text-2xl font-black italic tracking-tighter text-slate-900">
                {title || 'MATCHPRO'}<Text className="text-[#006400]">.</Text>
            </Text>
            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
                {subtitle || 'Elite Club Manager'}
            </Text>
        </View>
        {rightComponent ? rightComponent : (
            <View className="w-10 h-10 rounded-2xl bg-slate-900 justify-center items-center">
                <Text className="text-white font-black italic">{initials || 'CP'}</Text>
            </View>
        )}
    </View>
);
