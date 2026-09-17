import React, { useState, useCallback } from 'react';
import { View, TextInput, TextInputProps, StyleSheet } from 'react-native';
import { Typography } from './Typography';
import { Colors, Spacing } from '@/theme';

interface Props extends TextInputProps {
    label?: string;
    error?: string;
}

export const Input: React.FC<Props> = ({ label, error, style, onFocus, onBlur, ...props }) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(
    (e: any) => {
      setIsFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (e: any) => {
      setIsFocused(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  return (
    <View style={styles.wrapper}>
      {label && (
        <Typography variant="caption" color="textSecondary" style={styles.label}>
          {label}
        </Typography>
      )}
      <TextInput
        style={[
          styles.input,
          isFocused && styles.inputFocused,
          error && styles.inputError,
          style,
        ]}
        placeholderTextColor={Colors.textLight}
        onFocus={handleFocus}
        onBlur={handleBlur}
        accessibilityLabel={label}
        accessibilityHint={error ? `Error: ${error}` : undefined}
        accessibilityState={{ disabled: props.editable === false }}
        {...props}
      />
      {error && (
        <Typography variant="caption" color="error" style={styles.error}>
          {error}
        </Typography>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.xs, width: '100%' },
  label: { marginBottom: 2 },
  input: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
  },
  inputFocused: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  inputError: { borderColor: Colors.error, borderWidth: 1.5 },
  error: { marginTop: 2 },
});