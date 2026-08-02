import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Typography } from '@/components/ui';
import { Colors } from '@/theme';
import { type LedgerEntry } from '@/shared/ledger-entry';

interface Props {
    entries: LedgerEntry[];
    pending: string[];
}

export default function Ledger({ entries, pending }: Props) {
  return (
    <Card style={styles.card}>
      <Typography variant="caption" style={styles.title}>Audit Trail</Typography>
      <ScrollView style={styles.list} nestedScrollEnabled>
        {entries.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={[styles.dot, styles[entry.kind]]} />
            <View style={styles.content}>
              <Typography variant="body" style={styles.label}>{entry.label}</Typography>
              {entry.detail && (
                <Typography variant="caption" color="textSecondary">
                  {entry.detail}
                </Typography>
              )}
              <Typography variant="caption" color="textLight" style={{ marginTop: 2 }}>
                {new Date(entry.timestamp).toLocaleString()}
              </Typography>
            </View>
          </View>
        ))}
        {pending.map((item, idx) => (
          <View key={`pending-${idx}`} style={[styles.row, styles.pendingRow]}>
            <View style={[styles.dot, styles.pending]} />
            <Typography variant="body" style={styles.pendingLabel}>{item}</Typography>
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, padding: 16 },
  title: { marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { maxHeight: 300 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F2',
  },
  pendingRow: { opacity: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  pass: { backgroundColor: Colors.success },
  fail: { backgroundColor: Colors.error },
  info: { backgroundColor: Colors.primary },
  pending: { backgroundColor: Colors.textLight },
  content: { flex: 1 },
  label: { fontWeight: '600' },
  pendingLabel: { color: Colors.textLight },
});