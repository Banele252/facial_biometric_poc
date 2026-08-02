import React from 'react';
import { View, TextInput, TextInputProps, StyleSheet } from 'react-native';
import { Typography } from './Typography';
import { Colors, Spacing } from '@/theme';

interface Props extends TextInputProps {
    label?: string;
    error?: string;
}

export const Input: React.FC<Props> = ({ label, error, style, ...props }) => {
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
          error && styles.inputError,
          style,
        ]}
        placeholderTextColor={Colors.textLight}
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
  inputError: { borderColor: Colors.error, borderWidth: 1.5 },
  error: { marginTop: 2 },
});