import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { Colors } from '@/theme';

interface Props extends ViewProps {
  children?: React.ReactNode;
}

export const Card: React.FC<Props> = ({ children, style, ...props }) => {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  child: {
    marginBottom: 12,
  },
  childLast: {
    marginBottom: 0,
  },
});