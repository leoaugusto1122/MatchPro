import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/services/firebase';

export default function LoginScreen({ navigation }: any) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!email || !password) return;

        setLoading(true);
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Auth listener in useAuth/AppNavigator will handle navigation
        } catch (e: any) {
            setError(e.message);
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text variant="displaySmall" style={styles.title}>MatchPro</Text>

            <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
            />

            <TextInput
                label="Senha"
                value={password}
                onChangeText={setPassword}
                mode="outlined"
                secureTextEntry
                style={styles.input}
            />

            {error ? <HelperText type="error">{error}</HelperText> : null}

            <Button
                mode="contained"
                onPress={handleLogin}
                loading={loading}
                style={styles.button}
            >
                Entrar
            </Button>

            <Button
                mode="text"
                onPress={() => navigation.navigate('Register')}
            >
                Criar conta gratuita
            </Button>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    title: {
        textAlign: 'center',
        marginBottom: 40,
        color: '#333',
        fontWeight: 'bold',
    },
    input: {
        marginBottom: 12,
    },
    button: {
        marginTop: 10,
        paddingVertical: 6,
    },
});
