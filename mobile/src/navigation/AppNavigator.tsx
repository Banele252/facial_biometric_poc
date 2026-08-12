import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, NavigationAction } from './types';

import SplashScreen from '../features/screens/SplashScreen';
import { RequestSimSwapScreen } from '@/features/screens/RequestSimSwapScreen';
import { SAIDSelectionScreen } from '@/features/screens/SAIDSelectionScreen';
import IdentityValidationScreen from '../features/screens/IdentityValidationScreen';
import SimSwapDetailsScreen from '../features/screens/SimSwapDetailsScreen';
import SimBarcodeScanScreen from '../features/screens/SimBarcodeScanScreen';
import { IDDocumentScanScreen } from '@/features/screens/IDDocumentScanScreen';
import FacialVerificationScreen from '../features/screens/FacialVerificationScreen';
import LivenessDetectionScreen from '../features/screens/LivenessDetectionScreen';
import FraudIntelligenceChecksScreen from '../features/screens/FraudIntelligenceChecksScreen';
import SIMSwapApprovedScreen from '../features/screens/SIMSwapApprovedScreen';
import SIMSwapCompleteScreen from '../features/screens/SIMSwapCompleteScreen';

const Stack = createStackNavigator<RootStackParamList>();

/**
 * Bridges screens still written against the old { type, payload } dispatch
 * API onto real React Navigation calls, so those screens don't need to be
 * rewritten in this pass. New screens should take `navigation`/`route`
 * directly instead of reaching for this.
 */
function makeLegacyDispatch(
  navigation: StackNavigationProp<RootStackParamList, keyof RootStackParamList>,
) {
  return (action: NavigationAction) => {
    switch (action.type) {
    case 'NAVIGATE':
      navigation.navigate(action.payload.screen as any, action.payload.params as any);
      return;
    case 'GO_BACK':
      navigation.goBack();
      return;
    case 'RESET':
      navigation.reset({ index: 0, routes: [{ name: action.payload.screen as any }] });
      return;
    }
  };
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash">
          {({ navigation }) => (
            <SplashScreen navigate={navigation.navigate} goBack={navigation.goBack} />
          )}
        </Stack.Screen>

        <Stack.Screen name="RequestSimSwap">
          {({ navigation }) => (
            <RequestSimSwapScreen navigate={navigation.navigate} goBack={navigation.goBack} />
          )}
        </Stack.Screen>

        <Stack.Screen name="SAIDSelection">
          {({ navigation }) => (
            <SAIDSelectionScreen navigate={navigation.navigate} goBack={navigation.goBack} />
          )}
        </Stack.Screen>

        <Stack.Screen name="IdentityValidation">
          {({ navigation }) => (
            <IdentityValidationScreen navigate={navigation.navigate} goBack={navigation.goBack} />
          )}
        </Stack.Screen>

        <Stack.Screen name="SimSwapDetails">
          {({ navigation, route }) => (
            <SimSwapDetailsScreen
              dispatch={makeLegacyDispatch(navigation)}
              route={{ params: route.params }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="SimBarcodeScan">
          {({ navigation }) => (
            <SimBarcodeScanScreen dispatch={makeLegacyDispatch(navigation)} />
          )}
        </Stack.Screen>

        <Stack.Screen name="IDDocumentScan">
          {({ navigation }) => (
            <IDDocumentScanScreen dispatch={makeLegacyDispatch(navigation)} />
          )}
        </Stack.Screen>

        <Stack.Screen name="FacialVerification">
          {({ navigation }) => (
            <FacialVerificationScreen dispatch={makeLegacyDispatch(navigation)} />
          )}
        </Stack.Screen>

        <Stack.Screen name="LivenessDetection">
          {({ navigation }) => (
            <LivenessDetectionScreen dispatch={makeLegacyDispatch(navigation)} />
          )}
        </Stack.Screen>

        <Stack.Screen name="FraudIntelligenceChecks">
          {({ navigation }) => (
            <FraudIntelligenceChecksScreen dispatch={makeLegacyDispatch(navigation)} />
          )}
        </Stack.Screen>

        <Stack.Screen name="SIMSwapApproved">
          {({ navigation }) => (
            <SIMSwapApprovedScreen dispatch={makeLegacyDispatch(navigation)} />
          )}
        </Stack.Screen>

        <Stack.Screen name="SIMSwapComplete">
          {({ navigation }) => (
            <SIMSwapCompleteScreen dispatch={makeLegacyDispatch(navigation)} />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}