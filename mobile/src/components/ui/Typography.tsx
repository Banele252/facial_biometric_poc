import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { Colors, TypographyTokens } from '@/theme';

// Known string keys in the Colors theme object.
// Add more as your theme grows.
type ColorKey =
    | 'text'
    | 'textSecondary'
    | 'primary'
    | 'error'
    | 'surface'
    | 'border'
    | 'borderLight'
    | 'textLight'
    | 'primaryShadow';

interface Props extends TextProps {
  variant?: 'h1' | 'h2' | 'subtitle' | 'body' | 'caption';
  color?: ColorKey;
  align?: 'left' | 'center' | 'right';
}

export const Typography: React.FC<Props> = ({
  variant = 'body',
  color = 'text',
  align = 'left',
  style,
  children,
  ...props
}) => {
  // Runtime guard: if the theme key is missing or not a string, fall back to Colors.text
  const resolvedColor =
      typeof Colors[color] === 'string' ? (Colors[color] as string) : Colors.text;

  return (
    <Text
      style={[
        styles.base,
        styles[variant],
        { color: resolvedColor, textAlign: align },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  base: { fontFamily: TypographyTokens.fontFamily, color: Colors.text },
  h1: {
    fontSize: TypographyTokens.sizes.xxl,
    fontWeight: TypographyTokens.weights.black,
    lineHeight: 32 * TypographyTokens.lineHeights.tight,
    letterSpacing: -0.8,
  },
  h2: {
    fontSize: TypographyTokens.sizes.xl,
    fontWeight: TypographyTokens.weights.bold,
    lineHeight: 24 * TypographyTokens.lineHeights.normal,
  },
  subtitle: {
    fontSize: TypographyTokens.sizes.md,
    fontWeight: TypographyTokens.weights.medium,
    color: Colors.textSecondary,
    lineHeight: 16 * TypographyTokens.lineHeights.relaxed,
  },
  body: {
    fontSize: TypographyTokens.sizes.md,
    fontWeight: TypographyTokens.weights.regular,
    lineHeight: 16 * TypographyTokens.lineHeights.relaxed,
  },
  caption: {
    fontSize: TypographyTokens.sizes.sm,
    fontWeight: TypographyTokens.weights.medium,
    lineHeight: 14 * TypographyTokens.lineHeights.relaxed,
  },
});