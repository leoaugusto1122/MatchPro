import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import MainLayout from '@/navigation/MainLayout';
import { DrawerContent } from '@/components/navigation/DrawerContent';

const Drawer = createDrawerNavigator();

export default function DrawerNavigator({ navigation, route }: any) {
    return (
        <Drawer.Navigator
            screenOptions={{
                headerShown: false,
                drawerStyle: {
                    width: '80%',
                    backgroundColor: 'white',
                },
                swipeEdgeWidth: 100,
                drawerType: 'front',
                overlayColor: 'rgba(0,0,0,0.5)',
            }}
            drawerContent={(props) => <DrawerContent {...props} navigation={navigation} />}
        >
            <Drawer.Screen name="MainRoot" initialParams={route?.params}>
                {(props) => <MainLayout {...props} route={route} onNavigate={(screen, params) => navigation.navigate(screen, params)} />}
            </Drawer.Screen>
        </Drawer.Navigator>
    );
}
