import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';

export const Header = ({ title, subtitle, rightComponent, showBack, onBack, leftComponent }: { title?: string, subtitle?: string, rightComponent?: React.ReactNode, showBack?: boolean, onBack?: () => void, leftComponent?: React.ReactNode }) => {
    return (
        <View className="flex-row justify-between items-center mb-2">
            <View className="flex-row items-center flex-1">
                {leftComponent && (
                    <View className="mr-4">
                        {leftComponent}
                    </View>
                )}
                {showBack && (
                    <TouchableOpacity onPress={onBack} className="mr-3 p-1 -ml-1">
                        <ChevronLeft size={28} color="#0F172A" />
                    </TouchableOpacity>
                )}
                <View className="flex-1 justify-center">
                    <Text className="text-xl font-black italic tracking-tighter text-slate-900 leading-6" numberOfLines={1}>
                        {title || 'MATCHPRO'}
                    </Text>
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {subtitle || 'Manager'}
                    </Text>
                </View>
            </View>
            {rightComponent}
        </View>
    );
};
