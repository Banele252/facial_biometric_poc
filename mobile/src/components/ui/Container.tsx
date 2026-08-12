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
  /**
   * Whether this Container should scroll its own content.
   * Defaults to true so every screen is scrollable out of the box.
   * Set to false when the Container already sits inside a ScrollView
   * (e.g. a fixed bottom action bar), to avoid nested scroll views.
   */
  scroll?: boolean;
  /** Extra props forwarded to the underlying ScrollView (ignored when scroll={false}). */
  scrollViewProps?: Omit<ScrollViewProps, 'children' | 'contentContainerStyle' | 'style'>;
}

// Widest a card-style screen should ever get, so on tablets/desktop/web
// the layout doesn't stretch into an unreadable full-bleed line of text.
const MAX_CONTENT_WIDTH = 428;

export const Container: React.FC<Props> = ({
  children,
  style,
  scroll = true,
  scrollViewProps,
}) => {
  // Slightly tighter side padding on very small phones (e.g. iPhone SE, small Android)
  // so nothing gets clipped; a bit more breathing room everywhere else, including web/tablet.
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

  return (
    <ScrollView
      style={styles.scrollShell}
      contentContainerStyle={[layoutStyle, styles.grow, style]}
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