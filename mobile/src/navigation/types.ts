// src/navigation/types.ts
// Generated from screen prop analysis — 2026-08-16
export type ScreenName =
    | 'LandingScreen'
    | 'ConsentScreen'
    | 'VerifyDetailsScreen'
    | 'FaceCheckScreen'
    | 'ScanSimScreen'
    | 'ReviewScreen'
    | 'CompleteScreen';

export interface NavigationParams {
  LandingScreen: undefined;
  ConsentScreen: undefined;
  VerifyDetailsScreen: undefined;
  FaceCheckScreen: {
    idNumber?: string;
    phoneNumber?: string;
    fullName?: string;
    photoUrl?: string;
    // ScanSimScreen sends these and FaceCheckScreen declares them; they were
    // missing here, so the navigator had nothing to forward. `sessionId` is
    // sent to the liveness endpoint, which rejects an empty one.
    sessionId?: string;
    selfieId?: string;
    iccid?: string;
    iccidSource?: 'manual' | 'barcode';
  };
  ScanSimScreen: {
    idNumber?: string;
    phoneNumber?: string;
    fullName?: string;
    photoUrl?: string;
    sessionId?: string;
    selfieId?: string;
    iccid?: string;
    iccidSource?: 'manual' | 'barcode';
  };
  ReviewScreen: {
    idNumber?: string;
    phoneNumber?: string;
    fullName?: string;
    photoUrl?: string;
    sessionId?: string;
    selfieId?: string;
    iccid?: string;
    iccidSource?: 'manual' | 'barcode';
    matchScore?: number;
    matchConfidence?: string;
    reason?: string;
  };
  CompleteScreen: {
    swapId?: string;
    idNumber?: string;
    phoneNumber?: string;
    onFinish?: () => void;
  };
}

export interface NavigationAction {
  type: 'NAVIGATE' | 'GO_BACK' | 'RESET' | 'REPLACE';
  payload?: {
    screen?: ScreenName;
    params?: Record<string, unknown>;
  };
}

export interface NavigationState {
  stack: {
    screen: ScreenName;
    params?: Record<string, unknown>;
  }[];
  index: number;
}

export interface NavigationContextValue {
  state: NavigationState;
  dispatch: (action: NavigationAction) => void;
  navigate: <T extends ScreenName>(
      screen: T,
      params?: NavigationParams[T]
  ) => void;
  goBack: () => void;
  replace: <T extends ScreenName>(
      screen: T,
      params?: NavigationParams[T]
  ) => void;
  currentScreen: ScreenName;
  currentParams: Record<string, unknown> | undefined;
}