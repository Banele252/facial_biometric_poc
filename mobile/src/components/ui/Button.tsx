import React from 'react';
import { Pressable, PressableProps, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Typography } from './Typography';
import { Colors, Spacing } from '@/theme';

interface Props extends PressableProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<Props> = ({
  variant = 'primary',
  size = 'lg',
  loading = false,
  children,
  style,
  disabled,
  ...props
}) => {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      style={({ pressed }) => {
        const internalStyles = [
          styles.base,
          styles[size],
          styles[variant],
          (pressed || disabled) && { opacity: 0.7 },
        ];
        const resolvedStyle = typeof style === 'function' ? style({ pressed }) : style;
        return StyleSheet.flatten([...internalStyles, resolvedStyle]);
      }}
      disabled={disabled || loading}
      {...props}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={isPrimary ? Colors.text : Colors.primary} />
        ) : (
        // Only wrap in Typography if it's a plain string; otherwise render as‑is.
          typeof children === 'string' ? (
            <Typography
              variant="body"
              color={isPrimary ? 'text' : 'textSecondary'}
              style={{ fontWeight: '700' }}
            >
              {children}
            </Typography>
          ) : (
            children
          )
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    flexDirection: 'row',
  },
  md: { height: 44, paddingHorizontal: Spacing.md },
  lg: { height: 54, paddingHorizontal: Spacing.lg },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
  secondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  ghost: { backgroundColor: 'transparent' },
});