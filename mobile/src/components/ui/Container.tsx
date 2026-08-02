import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';

interface Props extends ViewProps {
    children?: React.ReactNode;
}

export const Container: React.FC<Props> = ({ children, style, ...props }) => {
  return (
    <View style={[styles.container, style]} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, maxWidth: 428, width: '100%', alignSelf: 'center', paddingHorizontal: 24 },
});