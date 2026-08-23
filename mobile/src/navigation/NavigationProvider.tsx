// src/navigation/NavigationProvider.tsx
import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type NavigationAction,
  type NavigationState,
  type NavigationContextValue,
  type ScreenName,
  type NavigationParams,
} from './types';

const initialState: NavigationState = {
  stack: [{ screen: 'LandingScreen' }],
  index: 0,
};

function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
  case 'NAVIGATE': {
    const screen = action.payload?.screen as ScreenName;
    const params = action.payload?.params;
    if (!screen) return state;

    const newStack = state.stack.slice(0, state.index + 1);
    newStack.push({ screen, params });
    return { stack: newStack, index: newStack.length - 1 };
  }

  case 'REPLACE': {
    const screen = action.payload?.screen as ScreenName;
    const params = action.payload?.params;
    if (!screen) return state;

    const newStack = state.stack.slice(0, state.index);
    newStack.push({ screen, params });
    return { stack: newStack, index: newStack.length - 1 };
  }

  case 'GO_BACK': {
    if (state.index <= 0) return state;
    return { ...state, index: state.index - 1 };
  }

  case 'RESET': {
    const screen = action.payload?.screen as ScreenName;
    const params = action.payload?.params;
    if (!screen) return state;
    return { stack: [{ screen, params }], index: 0 };
  }

  default:
    return state;
  }
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
}

interface NavigationProviderProps {
  children: ReactNode;
  initialRoute?: ScreenName;
  initialParams?: Record<string, unknown>;
}

export function NavigationProvider({
  children,
  initialRoute,
  initialParams,
}: NavigationProviderProps) {
  const [state, dispatch] = useReducer(
    navigationReducer,
    initialRoute
      ? { stack: [{ screen: initialRoute, params: initialParams }], index: 0 }
      : initialState,
  );

  const currentScreen = state.stack[state.index]?.screen ?? 'LandingScreen';
  const currentParams = state.stack[state.index]?.params;

  const navigate = useCallback(
    <T extends ScreenName>(screen: T, params?: NavigationParams[T]) => {
      dispatch({
        type: 'NAVIGATE',
        payload: { screen, params: params as Record<string, unknown> },
      });
    },
    [],
  );

  const replace = useCallback(
    <T extends ScreenName>(screen: T, params?: NavigationParams[T]) => {
      dispatch({
        type: 'REPLACE',
        payload: { screen, params: params as Record<string, unknown> },
      });
    },
    [],
  );

  const goBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  const value = useMemo(
    (): NavigationContextValue => ({
      state,
      dispatch,
      navigate,
      goBack,
      replace,
      currentScreen,
      currentParams,
    }),
    [state, dispatch, navigate, goBack, replace, currentScreen, currentParams],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}
