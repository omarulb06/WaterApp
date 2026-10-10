import { useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { INTERVAL_OPTIONS, intervalLabel } from '../options';
import { colors, fonts, radius } from '../theme';

type IntervalFieldProps = {
  minutes: number;
  onChange: (minutes: number) => void;
};

export function IntervalField({ minutes, onChange }: IntervalFieldProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  function openList() {
    Keyboard.dismiss();
    setOpen(true);
  }

  function choose(next: number) {
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reminder interval, ${intervalLabel(minutes)}`}
        accessibilityHint="Opens the interval list"
        onPress={openList}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
      >
        <View>
          <Text style={styles.label}>Interval</Text>
          <Text style={styles.value}>{intervalLabel(minutes)}</Text>
        </View>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close interval list"
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.sheetTitle}>Reminder interval</Text>
            {INTERVAL_OPTIONS.map((option) => {
              const selected = option.minutes === minutes;
              return (
                <Pressable
                  key={option.minutes}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => choose(option.minutes)}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                  {selected ? <Text style={styles.selectedMark}>Selected</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 76,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldPressed: {
    backgroundColor: colors.foam,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  value: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.ink,
  },
  chevron: {
    fontSize: 16,
    color: colors.lagoon,
    marginLeft: 12,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 18,
    paddingHorizontal: 12,
  },
  sheetTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  option: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionSelected: {
    backgroundColor: colors.foam,
  },
  optionPressed: {
    backgroundColor: colors.foam,
  },
  optionText: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  optionTextSelected: {
    fontFamily: fonts.semibold,
    color: colors.lagoon,
  },
  selectedMark: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.lagoon,
  },
});
