// src/auth/AuthBootstrap.tsx
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { bootstrapAuth } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/http';

interface AuthBootstrapProps {
  children: ReactNode;
}

type Stage = 'loading' | 'ready' | 'error';

/**
 * Obtains the platform tokens before the journey renders.
 *
 * This used to be a pass-through. The PoC backend ran with
 * `AUTH_ENABLED=false` and ZeroTrustMiddleware injected a synthetic user, so
 * the app needed no token. The Digital Trust platform has no such mode:
 * every route below `/v1` requires a bearer token, and without one the first
 * screen that calls the API fails with "Missing or invalid Authorization
 * header" - an error that reads like a bug in that screen rather than a
 * missing sign-in.
 *
 * Failing here instead makes the cause legible, and gives the demo a retry
 * that does not require restarting the app.
 */
export default function AuthBootstrap({
                                        children,
                                      }: AuthBootstrapProps) {
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setStage('loading');
    setError(null);

    try {
      await bootstrapAuth();
      setStage('ready');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
      setStage('error');
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  if (stage === 'ready') {
    return <>{children}</>;
  }

  if (stage === 'error') {
    return (
        <View style={styles.container}>
          <Text style={styles.title}>
            Could not connect
          </Text>

          <Text style={styles.message}>
            {error}
          </Text>

          <Pressable
              accessibilityRole="button"
              onPress={() => {
                void run();
              }}
              style={styles.button}
          >
            <Text style={styles.buttonLabel}>
              Try again
            </Text>
          </Pressable>
        </View>
    );
  }

  return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />

        <Text style={styles.message}>
          Connecting securely…
        </Text>
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#4B5563',
  },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#FFCC00',
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
});
