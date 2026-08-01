import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { type LedgerEntry } from '../shared/ledger-entry';

interface Props {
    entries: LedgerEntry[];
    pending: string[];
}

export default function Ledger({ entries, pending }: Props) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Audit Trail</Text>
            <ScrollView style={styles.list} nestedScrollEnabled>
                {entries.map((entry) => (
                    <View key={entry.id} style={styles.row}>
                        <View style={[styles.dot, styles[entry.kind]]} />
                        <View style={styles.content}>
                            <Text style={styles.label}>{entry.label}</Text>
                            {entry.detail ? <Text style={styles.detail}>{entry.detail}</Text> : null}
                        </View>
                    </View>
                ))}
                {pending.map((item, idx) => (
                    <View key={`pending-${idx}`} style={[styles.row, styles.pendingRow]}>
                        <View style={[styles.dot, styles.pending]} />
                        <Text style={styles.pendingLabel}>{item}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        maxWidth: 400,
        padding: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E0DDD6',
        marginTop: 16,
    },
    title: {
        fontSize: 14,
        fontWeight: '700',
        color: '#14110C',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
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
    pass: { backgroundColor: '#27AE60' },
    fail: { backgroundColor: '#E74C3C' },
    info: { backgroundColor: '#3498DB' },
    pending: { backgroundColor: '#BDC3C7' },
    content: { flex: 1 },
    label: { fontSize: 13, fontWeight: '600', color: '#14110C' },
    detail: { fontSize: 12, color: '#5C574E', marginTop: 2 },
    pendingLabel: { fontSize: 13, color: '#8B9099' },
});