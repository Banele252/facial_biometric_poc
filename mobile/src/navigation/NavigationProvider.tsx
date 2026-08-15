import React, { createContext, useContext, useReducer, ReactNode, useCallback } from 'react';
import { JourneyState, NavigationAction, ScreenName } from './types';

export type { NavigationAction } from './types';

interface HistoryEntry {
  screen: ScreenName;
  params?: Record<string, unknown>;
}

interface NavState {
  current: JourneyState;
  history: HistoryEntry[];
}

const initialState: NavState = {
  current: { screen: 'LandingScreen' },  // ← was 'Splash'
  history: [],
};

function navigationReducer(state: NavState, action: NavigationAction): NavState {
  switch (action.type) {
  case 'NAVIGATE': {
    const next: JourneyState = {
      screen: action.payload.screen,
      params: action.payload.params,
    };
    return {
      current: next,
      history: [...state.history, state.current],
    };
  }
  case 'GO_BACK': {
    if (state.history.length === 0) return state;
    const prev = state.history[state.history.length - 1];
    return {
      current: { screen: prev.screen, params: prev.params },
      history: state.history.slice(0, -1),
    };
  }
  case 'RESET':
    return {
      current: { screen: action.payload.screen },
      history: [],
    };
  default:
    return state;
  }
}

const NavigationContext = createContext<{
  state: NavState;
  dispatch: React.Dispatch<NavigationAction>;
  navigate: (screen: ScreenName, params?: Record<string, unknown>) => void;
  goBack: () => void;
  reset: (screen: ScreenName) => void;
    } | null>(null);

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(navigationReducer, initialState);

  const navigate = useCallback((screen: ScreenName, params?: Record<string, unknown>) => {
    dispatch({ type: 'NAVIGATE', payload: { screen, params } });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  const reset = useCallback((screen: ScreenName) => {
    dispatch({ type: 'RESET', payload: { screen } });
  }, []);

  return (
    <NavigationContext.Provider value={{ state, dispatch, navigate, goBack, reset }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within NavigationProvider');
  return context;
};