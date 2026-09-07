import React, { useCallback, useMemo, useRef } from 'react';
import {
  View,
  Dimensions,
  StyleSheet,
  Animated,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W * 0.88;
const GAP = 12;

interface Props<T> {
    data: T[];
    renderItem: ({ item, index }: { item: T; index: number }) => React.ReactElement | null;
    keyExtractor: (item: T, index: number) => string;
    onIndexChanged?: (index: number) => void;
}

export default function SlideCarousel<T>({
  data,
  renderItem,
  keyExtractor,
  onIndexChanged,
}: Props<T>) {
  const scrollX = useMemo(() => new Animated.Value(0), []);
  const currentIndexRef = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      scrollX.setValue(x);

      const idx = Math.round(x / (CARD_W + GAP));
      if (idx !== currentIndexRef.current && idx >= 0 && idx < data.length) {
        currentIndexRef.current = idx;
        onIndexChanged?.(idx);
      }
    },
    [data.length, onIndexChanged, scrollX],
  );

  if (!data || data.length === 0) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]} />
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + GAP}
        decelerationRate="fast"
        bounces={false}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {data.map((item, index) => (
          <View
            key={keyExtractor(item, index)}
            style={{
              width: CARD_W,
              marginRight: index < data.length - 1 ? GAP : 0,
            }}
          >
            {renderItem({ item, index })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {data.map((_, i) => {
          const inputRange = [
            (i - 1) * (CARD_W + GAP),
            i * (CARD_W + GAP),
            (i + 1) * (CARD_W + GAP),
          ];
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.8, 1.4, 0.8],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={`dot-${i}`}
              style={[styles.dot, { transform: [{ scale }], opacity }]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 200,
    width: '100%',
  },
  content: {
    paddingHorizontal: (SCREEN_W - CARD_W) / 2,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD700',
    marginHorizontal: 4,
  },
});