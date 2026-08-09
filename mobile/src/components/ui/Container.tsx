import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  ScrollView,
  ScrollViewProps,
  useWindowDimensions,
} from 'react-native';

interface Props {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    scroll?: boolean;
    scrollViewProps?: Omit<ScrollViewProps, 'children' | 'contentContainerStyle' | 'style'>;
}

const MAX_CONTENT_WIDTH = 428;

export const Container: React.FC<Props> = ({
  children,
  style,
  scroll = true,
  scrollViewProps,
}) => {
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 360 ? 16 : 24;

  const layoutStyle: StyleProp<ViewStyle> = [
    styles.container,
    { paddingHorizontal: horizontalPadding },
  ];

  if (!scroll) {
    return (
      <View style={[layoutStyle, styles.flexFill, style]}>
        {children}
      </View>
    );
  }

  const { flex: _flex, ...safeStyle } = StyleSheet.flatten(style) || {};

  return (
    <ScrollView
      style={styles.scrollShell}
      contentContainerStyle={[layoutStyle, styles.grow, safeStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollShell: { flex: 1, width: '100%' },
  container: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  flexFill: { flex: 1 },
  grow: { flexGrow: 1 },
});