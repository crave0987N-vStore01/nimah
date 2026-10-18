// Shown instead of a silent close when the app hits a JavaScript error, so the problem can be read and reported.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export function describeError(e: unknown): string {
  const err = e as { message?: string; stack?: string } | undefined;
  return `${err?.message ?? String(e)}\n\n${(err?.stack ?? '').split('\n').slice(0, 18).join('\n')}`;
}

export default function CrashScreen({ error }: { error: unknown }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Nimah hit an error</Text>
      <Text style={styles.sub}>Take a screenshot of this screen and send it.</Text>
      <ScrollView style={styles.box}>
        <Text selectable style={styles.text}>{describeError(error)}</Text>
      </ScrollView>
    </View>
  );
}

/** Catches errors thrown while rendering. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children; }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12060A', padding: 20, paddingTop: 60 },
  title: { color: '#FF8FA3', fontSize: 22, fontWeight: '800' },
  sub: { color: '#E3A6B2', marginTop: 6, marginBottom: 14 },
  box: { flex: 1, backgroundColor: '#1D0C12', borderRadius: 12, padding: 12 },
  text: { color: '#FFF1F3', fontFamily: 'monospace', fontSize: 12 },
});
