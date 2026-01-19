import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// 🎨 Paleta de Cores Base
const baseColors = {
    primary: '#006400', // Verde Escuro (Ação Principal)
    secondary: '#00BFFF', // Azul Claro (Destaques)
    white: '#FFFFFF',
    black: '#111111',
    error: '#FF4500', // Laranja Escuro (Alerta/Erro)
    success: '#4CAF50',
    warning: '#FFC107',
};

// ☀️ Light Theme Tokens
const lightColors = {
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceVariant: '#E0E0E0',
    textPrimary: '#111111',
    textSecondary: '#666666',
    border: '#E0E0E0',
};

// 🌙 Dark Theme Tokens
const darkColors = {
    background: '#121212',
    surface: '#1E1E1E',
    surfaceVariant: '#2C2C2C',
    textPrimary: '#FFFFFF',
    textSecondary: '#AAAAAA',
    border: '#333333',
};

// ✍️ Tipografia (Escalável e Legível)
// const fontConfig = { fontFamily: 'System' };


// 📦 Exportação dos Temas (Adaptados para React Native Paper)
export const lightTheme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        primary: baseColors.primary,
        onPrimary: baseColors.white,
        secondary: baseColors.secondary,
        onSecondary: baseColors.black,
        background: lightColors.background,
        surface: lightColors.surface,
        onSurface: lightColors.textPrimary,
        surfaceVariant: lightColors.surfaceVariant,
        error: baseColors.error,
        elevation: {
            level0: 'transparent',
            level1: lightColors.surface,
            level2: lightColors.surface, // Cards planos
            level3: lightColors.surface,
            level4: lightColors.surface,
            level5: lightColors.surface,
        }
    },
    roundness: 12, // Bordas arredondadas modernas
};

export const darkTheme = {
    ...MD3DarkTheme,
    colors: {
        ...MD3DarkTheme.colors,
        primary: '#2E7D32', // Ajuste leve para contraste dark
        onPrimary: baseColors.white,
        secondary: baseColors.secondary,
        onSecondary: baseColors.black,
        background: darkColors.background,
        surface: darkColors.surface,
        onSurface: darkColors.textPrimary,
        surfaceVariant: darkColors.surfaceVariant,
        error: '#FF6E40', // Laranja mais claro para dark mode
        elevation: {
            level0: 'transparent',
            level1: darkColors.surface,
            level2: darkColors.surface,
        }
    },
    roundness: 12,
};

// 🔧 Helper para uso direto em componentes customizados (não-Paper)
export const themeTokens = {
    light: {
        ...baseColors,
        ...lightColors,
    },
    dark: {
        ...baseColors,
        ...darkColors,
    }
};
