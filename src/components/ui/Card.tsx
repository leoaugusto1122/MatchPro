import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
    className?: string;
}

export const Card = ({ children, className, ...props }: CardProps) => (
    <View className={`bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 ${className}`} {...props}>
        {children}
    </View>
);
