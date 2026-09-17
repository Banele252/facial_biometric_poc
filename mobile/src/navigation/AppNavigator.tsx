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
        // ScanSimScreen sends all four of these and FaceCheckScreen declares
        // them, but the navigator dropped them here, so the screen fell back
        // to its prop defaults. `sessionId` then reached the liveness
        // endpoint as an empty string - which the PoC backend accepted and
        // the platform rejects, surfacing as "Verification failed" on the
        // face-check screen with nothing naming the field. `iccid` and
        // `iccidSource` were lost the same way and had to be recovered from
        // storage further down the journey.
        sessionId: p?.sessionId,
        selfieId: p?.selfieId,
        iccid: p?.iccid,
        iccidSource: p?.iccidSource,
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
        iccid: p?.iccid,
        iccidSource: p?.iccidSource,
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
        iccidSource: p?.iccidSource,
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