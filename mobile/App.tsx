import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationProvider, useNavigation } from '@/navigation/NavigationProvider';
import { ScreenName } from '@/navigation/types';
import { DeviceFrame } from '@/components/DeviceFrame';

import SplashScreen from '@/features/screens/SplashScreen';
import { RequestSimSwapScreen } from '@/features/screens/RequestSimSwapScreen';
import { SAIDSelectionScreen } from '@/features/screens/SAIDSelectionScreen';
import IdentityValidationScreen from '@/features/screens/IdentityValidationScreen';
import SimSwapDetailsScreen from '@/features/screens/SimSwapDetailsScreen';
import SimBarcodeScanScreen from '@/features/screens/SimBarcodeScanScreen';
import { IDDocumentScanScreen } from '@/features/screens/IDDocumentScanScreen';
import FacialVerificationScreen from '@/features/screens/FacialVerificationScreen';
import LivenessDetectionScreen from '@/features/screens/LivenessDetectionScreen';
import FraudIntelligenceChecksScreen from '@/features/screens/FraudIntelligenceChecksScreen';
import SIMSwapApprovedScreen from '@/features/screens/SIMSwapApprovedScreen';
import SIMSwapCompleteScreen from '@/features/screens/SIMSwapCompleteScreen';

const SCREEN_MAP: Record<ScreenName, React.FC<any>> = {
  Splash: SplashScreen,
  RequestSimSwap: RequestSimSwapScreen,
  SAIDSelection: SAIDSelectionScreen,
  IdentityValidation: IdentityValidationScreen,
  SimSwapDetails: SimSwapDetailsScreen,
  SimBarcodeScan: SimBarcodeScanScreen,
  IDDocumentScan: IDDocumentScanScreen,
  FacialVerification: FacialVerificationScreen,
  LivenessDetection: LivenessDetectionScreen,
  FraudIntelligenceChecks: FraudIntelligenceChecksScreen,
  SIMSwapApproved: SIMSwapApprovedScreen,
  SIMSwapComplete: SIMSwapCompleteScreen,
};

function Router() {
  const { state, dispatch, navigate, goBack } = useNavigation();
  const screen = state.current.screen as ScreenName;
  const Screen = SCREEN_MAP[screen];

  if (!Screen) {
    console.error(`Screen ${screen} not found`);
    return null;
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
        <DeviceFrame>
          <Router />
        </DeviceFrame>
      </NavigationProvider>
    </SafeAreaProvider>
  );
}