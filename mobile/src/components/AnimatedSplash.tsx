// mobile/src/components/AnimatedSplash.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, StyleSheet, Image } from 'react-native';

interface Props {
  onFinish: () => void;
}

export default function AnimatedSplash({ onFinish }: Props) {
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const scaleAnim = useMemo(() => new Animated.Value(0.9), []);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    const exitTimer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        onFinishRef.current?.();
      });
    }, 2200);

    return () => clearTimeout(exitTimer);
  }, []);

  return (
      <View style={styles.container}>
        <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            }}
        >
          <Image
              source={require('../../assets/splash-hero.png')}
              style={styles.logo}
              resizeMode="contain"
              onError={(e) => console.warn('Splash image failed:', e.nativeEvent.error)}
          />
        </Animated.View>
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  logo: {
    width: 180,
    height: 180,
  },
});