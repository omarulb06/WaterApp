import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

export function BootScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.mark} />
      <Text style={styles.word}>Water</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  mark: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.lagoon,
    marginBottom: 14,
  },
  word: {
    fontSize: 28,
    color: colors.ink,
    letterSpacing: 0.2,
  },
});
