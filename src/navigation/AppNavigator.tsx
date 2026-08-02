import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import SplashScreen from '../screens/SplashScreen';
import SAIDSelectionScreen from '../screens/SAIDSelectionScreen';
import MainFlow from '../screens/MainFlow';

const Stack = createStackNavigator();

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Splash">
                    {(props) => (
                        <SplashScreen
                            onGetStarted={() => props.navigation.navigate('SAIDSelection')}
                            onLearnMore={() => alert('Learn More pressed')}
                        />
                    )}
                </Stack.Screen>

                <Stack.Screen name="SAIDSelection" component={SAIDSelectionScreen} />
                <Stack.Screen name="Main" component={MainFlow} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}