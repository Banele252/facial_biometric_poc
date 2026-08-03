export type ScreenName =
    | 'Splash'
    | 'RequestSimSwap'
    | 'SAIDSelection'
    | 'IdentityValidation'
    | 'SimSwapDetails'
    | 'IDDocumentScan'
    | 'FacialVerification'
    | 'LivenessDetection'
    | 'FraudIntelligenceChecks'
    | 'SIMSwapApproved'
    | 'SIMSwapComplete'
    | 'SimBarcodeScan';

export interface JourneyState {
    screen: ScreenName;
    params?: Record<string, unknown>;
}

export type NavigationAction =
    | { type: 'NAVIGATE'; payload: { screen: ScreenName; params?: Record<string, unknown> } }
    | { type: 'GO_BACK' }
    | { type: 'RESET'; payload: { screen: ScreenName } };

export type RootStackParamList = Record<string, undefined>;