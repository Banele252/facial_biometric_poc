import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationProvider, useNavigation } from '@/navigation/NavigationProvider';
import { ScreenName } from '@/navigation/types';
import SIMSwapCompleteScreen from '@/features/screens/SIMSwapCompleteScreen';
import SIMSwapApprovedScreen from '@/features/screens/SIMSwapApprovedScreen';
import FraudIntelligenceChecksScreen from '@/features/screens/FraudIntelligenceChecksScreen';
import FacialVerificationScreen from '@/features/screens/FacialVerificationScreen';
import LivenessDetectionScreen from '@/features/screens/LivenessDetectionScreen';
import { IDDocumentScanScreen } from '@/features/screens/IDDocumentScanScreen';
import ConsentScreen from '@/features/screens/ConsentScreen';
import SimBarcodeScanScreen from '@/features/screens/SimBarcodeScanScreen';
import { SAIDSelectionScreen } from '@/features/screens/SAIDSelectionScreen';
import IdentityValidationScreen from '@/features/screens/IdentityValidationScreen';
import { RequestSimSwapScreen } from '@/features/screens/RequestSimSwapScreen';
import LandingScreen from '@/features/screens/LandingScreen';

const SCREEN_MAP: Record<ScreenName, React.FC<any>> = {
  LandingScreen: LandingScreen,
  RequestSimSwap: RequestSimSwapScreen,
  SAIDSelection: SAIDSelectionScreen,
  IdentityValidation: IdentityValidationScreen,
  ConsentScreen: ConsentScreen,
  SimBarcodeScan: SimBarcodeScanScreen,
  IDDocumentScan: IDDocumentScanScreen,
  FacialVerification: FacialVerificationScreen,
  LivenessDetection: LivenessDetectionScreen,
  FraudIntelligenceChecks: FraudIntelligenceChecksScreen,
  SIMSwapApproved: SIMSwapApprovedScreen,
  SIMSwapComplete: SIMSwapCompleteScreen,
};

function ErrorScreen({ message }: { message: string }) {
  return (
    <View style={styles.errorShell}>
      <Text style={styles.errorTitle}>Router Error</Text>
      <Text style={styles.errorBody}>{message}</Text>
      <Text style={styles.errorHint}>Check types.ts and SCREEN_MAP</Text>
    </View>
  );
}

function Router() {
  const { state, dispatch, navigate, goBack } = useNavigation();
  const screen = state.current.screen as ScreenName;
  const Screen = SCREEN_MAP[screen];

  if (!Screen) {
    console.error(`Screen "${screen}" not found in SCREEN_MAP`);
    return <ErrorScreen message={`Screen "${screen}" is missing from the router.`} />;
  }

  return (
    <Screen
      navigate={navigate}
      goBack={goBack}
      dispatch={dispatch}
      routeParams={state.current.params}
    />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationProvider>
        <Router />
      </NavigationProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorShell: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#C0362C',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    color: '#5A5A64',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorHint: {
    fontSize: 12,
    color: '#8A8A94',
  },
});