import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Typography } from '@/components/ui';
import { Colors } from '@/theme';
import { type LedgerEntry } from '@/shared/ledger-entry';

type Kind = LedgerEntry['kind'];

const kindColors: Record<Kind, string> = {
  pass: Colors.success,
  fail: Colors.error,
  info: Colors.primary,
};

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
            <View style={[styles.dot, { backgroundColor: kindColors[entry.kind] }]} />
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
  card: { marginTop: 16 },
  title: { marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { maxHeight: 300 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F2',
  },
  pendingRow: { opacity: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, marginRight: 10 },
  pending: { backgroundColor: Colors.textLight },
  content: { flex: 1 },
  label: { fontWeight: '600' },
  pendingLabel: { color: Colors.textLight },
});