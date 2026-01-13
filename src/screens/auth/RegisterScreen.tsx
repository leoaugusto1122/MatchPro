import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function RegisterScreen({ navigation }: any) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleRegister = async () => {
        setLoading(true);
        setError('');

        try {
            // 1. Create User in Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Update Display Name
            await updateProfile(user, { displayName: name });

            // 3. Create User Document in Firestore
            await setDoc(doc(db, 'users', user.uid), {
                email: user.email,
                displayName: name,
                role: 'owner', // First user is owner by default for MVP logic
                createdAt: new Date(),
            });

        } catch (e: any) {
            setError(e.message);
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text variant="headlineMedium" style={styles.title}>Crie sua conta</Text>

            <TextInput
                label="Nome Completo"
                value={name}
                onChangeText={setName}
                mode="outlined"
                style={styles.input}
            />

            <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                autoCapitalize="none"
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
                onPress={handleRegister}
                loading={loading}
                style={styles.button}
            >
                Cadastrar
            </Button>

            <Button
                mode="text"
                onPress={() => navigation.goBack()}
            >
                Voltar para Login
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
        marginBottom: 30,
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
