import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

type PlatformPreset = 'ios' | 'android-sm' | 'android-lg';

const PRESETS: Record<PlatformPreset, { width: number; height: number }> = {
  ios: { width: 393, height: 852 },
  'android-sm': { width: 360, height: 800 },
  'android-lg': { width: 412, height: 915 },
};

interface PhoneFrameProps {
  preset?: PlatformPreset;
  children: React.ReactNode;
  showBezel?: boolean;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({ preset = 'ios', children, showBezel = true }) => {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const target = PRESETS[preset];
  const scale = Math.min(1, screenW / target.width, screenH / target.height);

  return (
    <View style={styles.letterbox}>
      <View style={[
        styles.frame,
        {
          width: target.width,
          height: target.height,
          transform: [{ scale }],
          borderRadius: showBezel ? 40 : 0,
          borderWidth: showBezel ? 8 : 0,
        },
      ]}>
        <View style={styles.clip}>{children}</View>
      </View>
    </View>
  );
};

export default PhoneFrame;

const styles = StyleSheet.create({
  letterbox: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frame: { overflow: 'hidden', backgroundColor: '#000', borderColor: '#1a1a1a', shadowColor: '#000', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.6, shadowRadius: 70, elevation: 24 },
  clip: { width: '100%', height: '100%', overflow: 'hidden' },
});