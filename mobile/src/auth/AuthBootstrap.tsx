// src/auth/AuthBootstrap.tsx
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { loginSandbox } from '@/lib/auth';

const MTN_YELLOW = '#FFCB05';
const MTN_BLACK = '#111114';

type BootstrapState = 'loading' | 'ready' | 'error';

interface AuthBootstrapProps {
  children: ReactNode;
}

export default function AuthBootstrap({ children }: AuthBootstrapProps) {
  const [state, setState] = useState<BootstrapState>('loading');
  const [error, setError] = useState<string | null>(null);

  const authenticate = useCallback(async () => {
    setState('loading');
    setError(null);

    try {
      // PoC / sandbox bootstrap.
      // This happens BEFORE LandingScreen is mounted.
      await loginSandbox(
        'test_admin',
        process.env.EXPO_PUBLIC_SANDBOX_PASSWORD ?? '',
        'biometric:read biometric:write simswap:execute rica:read admin:docs',
      );

      setState('ready');
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.message ??
        'Unable to establish a secure session.';

      console.error('[AUTH_BOOTSTRAP] token request failed', err);
      setError(message);
      setState('error');
    }
  }, []);

  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  if (state === 'ready') {
    return <>{children}</>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.content}>
        <View style={styles.brand}>
          <View style={styles.mtnBadge}>
            <Text style={styles.mtnText}>MTN</Text>
          </View>
          <Text style={styles.trustText}>trust</Text>
        </View>

        {state === 'loading' ? (
          <>
            <View style={styles.iconWrap}>
              <ActivityIndicator size="large" color={MTN_BLACK} />
            </View>

            <Text style={styles.title}>Securing your session</Text>
            <Text style={styles.body}>
              Establishing a protected connection before your journey starts.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.errorIconWrap}>
              <Ionicons
                name="shield-outline"
                size={34}
                color="#E5484D"
              />
            </View>

            <Text style={styles.title}>Secure session unavailable</Text>
            <Text style={styles.body}>
              {error}
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => void authenticate()}
              activeOpacity={0.88}
            >
              <Text style={styles.retryText}>Try Again</Text>
              <Ionicons
                name="refresh"
                size={18}
                color={MTN_BLACK}
              />
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    width: 393,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 999,
    paddingVertical: 5,
    paddingRight: 12,
    paddingLeft: 6,
    marginBottom: 34,
  },
  mtnBadge: {
    width: 46,
    height: 26,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: MTN_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mtnText: {
    color: MTN_YELLOW,
    fontSize: 12.5,
    fontWeight: '800',
  },
  trustText: {
    marginLeft: 9,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: MTN_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  errorIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    color: MTN_BLACK,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  body: {
    color: '#6E6E78',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 310,
  },
  retryButton: {
    minHeight: 56,
    minWidth: 180,
    borderRadius: 20,
    backgroundColor: MTN_YELLOW,
    marginTop: 24,
    paddingHorizontal: 22,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: MTN_BLACK,
    fontSize: 16,
    fontWeight: '800',
  },
});
