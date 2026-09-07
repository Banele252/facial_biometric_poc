// src/navigation/AppNavigator.tsx
import React, { useMemo } from 'react';
import { useNavigation } from './NavigationProvider';
import type { ScreenName, NavigationParams } from './types';

/* ─── screens ─── */
import LandingScreen from '@/features/screens/LandingScreen';
import ConsentScreen from '@/features/screens/ConsentScreen';
import VerifyDetailsScreen from '@/features/screens/VerifyDetailsScreen';
import FaceCheckScreen from '@/features/screens/FaceCheckScreen';
import ScanSimScreen from '@/features/screens/ScanSimScreen';
import ReviewScreen from '@/features/screens/ReviewScreen';
import CompleteScreen from '@/features/screens/CompleteScreen';

const SCREEN_MAP: Record<ScreenName, React.ComponentType<any>> = {
  LandingScreen,
  ConsentScreen,
  VerifyDetailsScreen,
  FaceCheckScreen,
  ScanSimScreen,
  ReviewScreen,
  CompleteScreen,
};

export default function AppNavigator() {
  const { currentScreen, currentParams, navigate, goBack, dispatch } =
      useNavigation();

  const ScreenComponent = SCREEN_MAP[currentScreen];

  const screenProps = useMemo(() => {
    const base = {
      navigate,
      goBack,
      dispatch,
    };

    switch (currentScreen) {
    case 'LandingScreen':
      return base;

    case 'ConsentScreen':
      return {
        ...base,
        routeParams: currentParams,
      };

    case 'VerifyDetailsScreen':
      return base;

    case 'FaceCheckScreen': {
      const p = currentParams as NavigationParams['FaceCheckScreen'] | undefined;
      return {
        ...base,
        idNumber: p?.idNumber,
        phoneNumber: p?.phoneNumber,
        fullName: p?.fullName,
        photoUrl: p?.photoUrl,
      };
    }

    case 'ScanSimScreen': {
      const p = currentParams as NavigationParams['ScanSimScreen'] | undefined;
      return {
        ...base,
        idNumber: p?.idNumber,
        phoneNumber: p?.phoneNumber,
        fullName: p?.fullName,
        photoUrl: p?.photoUrl,
        sessionId: p?.sessionId,
        selfieId: p?.selfieId,
      };
    }

    case 'ReviewScreen': {
      const p = currentParams as NavigationParams['ReviewScreen'] | undefined;
      return {
        ...base,
        idNumber: p?.idNumber,
        phoneNumber: p?.phoneNumber,
        fullName: p?.fullName,
        photoUrl: p?.photoUrl,
        sessionId: p?.sessionId,
        selfieId: p?.selfieId,
        iccid: p?.iccid,
        matchScore: p?.matchScore,
        matchConfidence: p?.matchConfidence,
        reason: p?.reason,
      };
    }

    case 'CompleteScreen': {
      const p = currentParams as NavigationParams['CompleteScreen'] | undefined;
      return {
        ...base,
        swapId: p?.swapId,
        idNumber: p?.idNumber,
        phoneNumber: p?.phoneNumber,
        onFinish: p?.onFinish as (() => void) | undefined,
      };
    }

    default:
      return base;
    }
  }, [currentScreen, currentParams, navigate, goBack, dispatch]);

  if (!ScreenComponent) {
    return null;
  }

  return <ScreenComponent {...screenProps} />;
}