import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '../theme';

type CupTrackerProps = {
  /** Cups the user has confirmed drinking today. */
  consumed: number;
  /** Target cups for the whole day. */
  goal: number;
  /** 0..1 fraction, pre-computed so it stays in sync with the parent. */
  progress: number;
};

/**
 * Compact visual tracker: a horizontal fill bar plus one dot per cup.
 * Filled dots mean "already drunk", empty dots are what's left.
 *
 * The dot row caps at 20 markers so very high goals do not overflow the
 * card. When capped, we show a short "N of M cups" line underneath so the
 * exact progress stays legible.
 */
export const CupTracker = memo(function CupTracker({ consumed, goal, progress }: CupTrackerProps) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const safeGoal = Math.max(1, Math.floor(goal));
  const safeConsumed = Math.max(0, Math.floor(consumed));
  const markers = Math.min(safeGoal, 20);
  const filledMarkers = Math.round((safeConsumed / safeGoal) * markers);
  const percentText = `${Math.round(clampedProgress * 100)}%`;

  return (
    <View style={styles.wrap}>
      <View style={styles.barTrack} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(clampedProgress * 100), min: 0, max: 100 }}>
        <View style={[styles.barFill, { width: `${clampedProgress * 100}%` }]} />
        <Text style={styles.barLabel}>{percentText}</Text>
      </View>

      <View style={styles.cupRow}>
        {Array.from({ length: markers }).map((_, index) => {
          const filled = index < filledMarkers;
          return (
            <View
              key={index}
              style={[styles.cup, filled ? styles.cupFilled : styles.cupEmpty]}
            />
          );
        })}
      </View>

      {safeGoal > markers ? (
        <Text style={styles.caption}>
          {safeConsumed} of {safeGoal} cups
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
  },
  barTrack: {
    height: 28,
    borderRadius: radius.md,
    backgroundColor: colors.foam,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.lagoon,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
  },
  barLabel: {
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
    letterSpacing: 0.4,
  },
  cupRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  cup: {
    width: 20,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  cupEmpty: {
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  cupFilled: {
    borderColor: colors.lagoon,
    backgroundColor: colors.lagoon,
  },
  caption: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
});
