import React from 'react';
import { View, StyleSheet, Platform, Text, ScrollView } from 'react-native';

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

  // The chassis is a fixed 960px tall. Centring it in a plain flex container
  // clipped it on any viewport shorter than that — which is most laptops — with
  // no way to reach the top or bottom. A scroll view keeps it centred when it
  // fits and lets the page scroll when it does not.
  return (
    <ScrollView
      style={styles.viewport}
      contentContainerStyle={styles.workspace}
      showsVerticalScrollIndicator={false}
    >
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

      {/* In normal flow rather than absolutely positioned, so it cannot sit on
          top of the chassis once the workspace scrolls. */}
      <View style={styles.hint}>
        <Text style={styles.hintText}>
                    Add to Home Screen for native feel
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  workspace: {
    // Fills the viewport so the frame stays centred on a tall screen, and grows
    // past it on a short one so the scroll view has somewhere to scroll to.
    minHeight: '100%',
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 20,
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