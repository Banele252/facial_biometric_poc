import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationProvider, useNavigation } from './NavigationProvider';
import { RootStackParamList } from './types';

import SplashScreen from '../features/screens/SplashScreen';
import { RequestSimSwapScreen } from '@/features/screens/RequestSimSwapScreen';
import { SAIDSelectionScreen } from '@/features/screens/SAIDSelectionScreen';
import IdentityValidationScreen from '../features/screens/IdentityValidationScreen';
import SimSwapDetailsScreen from '../features/screens/SimSwapDetailsScreen';
import { IDDocumentScanScreen } from '@/features/screens/IDDocumentScanScreen';
import FacialVerificationScreen from '../features/screens/FacialVerificationScreen';
import LivenessDetectionScreen from '../features/screens/LivenessDetectionScreen';
import FraudIntelligenceChecksScreen from '../features/screens/FraudIntelligenceChecksScreen';
import SIMSwapApprovedScreen from '../features/screens/SIMSwapApprovedScreen';
import SIMSwapCompleteScreen from '../features/screens/SIMSwapCompleteScreen';

const Stack = createStackNavigator<RootStackParamList>();

function AppContent() {
  const { state, dispatch, navigate, goBack } = useNavigation();

  const dispatchNav = {
    navigate: (screen: string, params?: any) => navigate(screen as any, params),
    goBack: () => goBack(),
  };

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {state.current.screen === 'Splash' && (
        <Stack.Screen name="Splash">
          {() => <SplashScreen {...dispatchNav} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'RequestSimSwap' && (
        <Stack.Screen name="RequestSimSwap">
          {() => <RequestSimSwapScreen {...dispatchNav} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'SAIDSelection' && (
        <Stack.Screen name="SAIDSelection">
          {() => <SAIDSelectionScreen {...dispatchNav} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'IdentityValidation' && (
        <Stack.Screen name="IdentityValidation">
          {() => <IdentityValidationScreen {...dispatchNav} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'SimSwapDetails' && (
        <Stack.Screen name="SimSwapDetails">
          {() => <SimSwapDetailsScreen dispatch={dispatch} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'IDDocumentScan' && (
        <Stack.Screen name="IDDocumentScan">
          {() => <IDDocumentScanScreen dispatch={dispatch} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'FacialVerification' && (
        <Stack.Screen name="FacialVerification">
          {() => <FacialVerificationScreen dispatch={dispatch} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'LivenessDetection' && (
        <Stack.Screen name="LivenessDetection">
          {() => <LivenessDetectionScreen dispatch={dispatch} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'FraudIntelligenceChecks' && (
        <Stack.Screen name="FraudIntelligenceChecks">
          {() => <FraudIntelligenceChecksScreen dispatch={dispatch} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'SIMSwapApproved' && (
        <Stack.Screen name="SIMSwapApproved">
          {() => <SIMSwapApprovedScreen dispatch={dispatch} />}
        </Stack.Screen>
      )}
      {state.current.screen === 'SIMSwapComplete' && (
        <Stack.Screen name="SIMSwapComplete">
          {() => <SIMSwapCompleteScreen dispatch={dispatch} />}
        </Stack.Screen>
      )}
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationProvider>
      <NavigationContainer>
        <AppContent />
      </NavigationContainer>
    </NavigationProvider>
  );
}