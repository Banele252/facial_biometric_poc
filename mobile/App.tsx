import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthBootstrap from '@/auth/AuthBootstrap';
import AppNavigator from '@/navigation/AppNavigator';
import { NavigationProvider } from '@/navigation/NavigationProvider';

export default function App() {
    return (
        <SafeAreaProvider>
            <NavigationProvider initialRoute="LandingScreen">
                <AuthBootstrap>
                    <AppNavigator />
                </AuthBootstrap>
            </NavigationProvider>
        </SafeAreaProvider>
    );
}