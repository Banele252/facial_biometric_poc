import React from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';

interface Props {
    children: React.ReactNode;
}

const IPHONE = {
  width: 430,
  height: 932,
  screenRadius: 55,
  chassisRadius: 69,
};

export function DeviceFrame({ children }: Props) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={styles.workspace}>
      <View style={styles.chassis}>
        <View style={[styles.sideBtn, styles.actionBtn]} />
        <View style={[styles.sideBtn, styles.volUp]} />
        <View style={[styles.sideBtn, styles.volDown]} />
        <View style={[styles.sideBtn, styles.powerBtn]} />

        <View style={styles.screen}>
          <View style={styles.dynamicIsland} />
          <View style={styles.appContainer}>{children}</View>
          <View style={styles.homeIndicator} />
        </View>
      </View>

      <View style={styles.hint}>
        <Text style={styles.hintText}>
                    Add to Home Screen for native feel
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    // minHeight removed — flex:1 handles it on all platforms
  },
  chassis: {
    width: IPHONE.width + 28,
    height: IPHONE.height + 28,
    borderRadius: IPHONE.chassisRadius,
    backgroundColor: '#1C1C1E',
    borderWidth: 3,
    borderColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.55,
    shadowRadius: 60,
    elevation: 24,
    position: 'relative',
  },
  screen: {
    width: IPHONE.width,
    height: IPHONE.height,
    borderRadius: IPHONE.screenRadius,
    backgroundColor: '#FFFDF9',
    overflow: 'hidden',
    position: 'relative',
  },
  appContainer: {
    flex: 1,
    marginTop: 54,
    marginBottom: 20,
  },
  dynamicIsland: {
    position: 'absolute',
    top: 11,
    alignSelf: 'center',
    width: 126,
    height: 37,
    borderRadius: 20,
    backgroundColor: '#000',
    zIndex: 100,
  },
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 134,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#000',
    zIndex: 100,
  },
  sideBtn: {
    position: 'absolute',
    width: 4,
    backgroundColor: '#3A3A3C',
    borderRadius: 2,
  },
  actionBtn: {
    top: 164,
    left: -3,
    height: 28,
  },
  volUp: {
    top: 216,
    left: -3,
    height: 52,
  },
  volDown: {
    top: 284,
    left: -3,
    height: 52,
  },
  powerBtn: {
    top: 228,
    right: -3,
    height: 72,
  },
  hint: {
    position: 'absolute',
    bottom: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  hintText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
});