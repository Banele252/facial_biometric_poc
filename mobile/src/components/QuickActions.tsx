import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ActionId = 'swap-sim' | 'verify-id' | 'esim' | 'wallet';

interface ActionDef {
    id: ActionId;
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    enabled: boolean;
}

interface Props {
    onSwapSim: (event: GestureResponderEvent) => void;
}

const ACTIONS: ActionDef[] = [
  { id: 'swap-sim', label: 'Swap SIM', icon: 'sync-outline', enabled: true },
  { id: 'verify-id', label: 'Verify ID', icon: 'person-outline', enabled: false },
  { id: 'esim', label: 'eSIM', icon: 'cellular-outline', enabled: false },
  { id: 'wallet', label: 'Wallet', icon: 'wallet-outline', enabled: false },
];

export default function QuickActions({ onSwapSim }: Props) {
  return (
    <View style={styles.container}>
      {ACTIONS.map((action) => {
        const isActive = action.enabled;
        const handlePress = isActive ? onSwapSim : undefined;

        return (
          <TouchableOpacity
            key={action.id}
            style={styles.button}
            onPress={handlePress}
            disabled={!isActive}
            activeOpacity={isActive ? 0.7 : 1}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isActive }}
            accessibilityLabel={action.label}
          >
            <View
              style={[
                styles.iconBox,
                isActive ? styles.iconBoxActive : styles.iconBoxDisabled,
              ]}
            >
              <Ionicons
                name={action.icon}
                size={28}
                color={isActive ? '#B8860B' : '#CCCCCC'}
              />
            </View>
            <Text
              style={[
                styles.label,
                isActive ? styles.labelActive : styles.labelDisabled,
              ]}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  button: {
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBoxActive: {
    backgroundColor: '#FFFBE6',
  },
  iconBoxDisabled: {
    backgroundColor: '#F5F5F5',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: {
    color: '#1A1A1A',
  },
  labelDisabled: {
    color: '#BBBBBB',
  },
});