import React from 'react';
import { Text, TouchableOpacity, TouchableOpacityProps } from 'react-native';

interface ButtonPrimaryProps extends TouchableOpacityProps {
    label: string;
    className?: string;
}

export const ButtonPrimary = ({ label, className, ...props }: ButtonPrimaryProps) => (
    <TouchableOpacity
        className={`bg-[#006400] px-4 py-4 rounded-2xl shadow-lg shadow-green-900/20 active:scale-95 flex-row justify-center items-center ${className}`}
        {...props}
    >
        <Text className="text-white font-black italic uppercase text-xs tracking-widest">
            {label}
        </Text>
    </TouchableOpacity>
);
