import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius } from '../theme';
import { dateToMinutes, formatClock, minutesToDate } from '../time';

type TimeFieldProps = {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
  invalid?: boolean;
};

export function TimeField({ label, minutes, onChange, invalid = false }: TimeFieldProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => minutesToDate(minutes));

  function openPicker() {
    Keyboard.dismiss();
    setDraft(minutesToDate(minutes));
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
  }

  function applyDate(date: Date) {
    setDraft(date);
    onChange(dateToMinutes(date));
  }

  function onAndroidChange(event: DateTimePickerEvent, date?: Date) {
    setOpen(false);
    if (event.type === 'set' && date) {
      onChange(dateToMinutes(date));
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatClock(minutes)}`}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.field,
          invalid && styles.fieldInvalid,
          pressed && styles.fieldPressed,
        ]}
      >
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatClock(minutes)}</Text>
      </Pressable>

      {Platform.OS === 'android' && open ? (
        <DateTimePicker
          value={minutesToDate(minutes)}
          mode="time"
          is24Hour={false}
          display="default"
          onChange={onAndroidChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={closePicker}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.backdrop} onPress={closePicker} accessibilityLabel="Close time picker" />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{label}</Text>
                <Pressable accessibilityRole="button" onPress={closePicker} hitSlop={8}>
                  <Text style={styles.done}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draft}
                mode="time"
                display="spinner"
                themeVariant="light"
                textColor={colors.ink}
                onChange={(_event, date) => {
                  if (date) applyDate(date);
                }}
                style={styles.spinner}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    minHeight: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  fieldInvalid: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSurface,
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
    fontSize: 22,
    color: colors.ink,
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
    paddingTop: 8,
  },
  sheetHeader: {
    minHeight: 48,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
  },
  done: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.lagoon,
  },
  spinner: {
    height: 216,
  },
});
