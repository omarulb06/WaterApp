import { Alert, Linking, type AlertButton } from 'react-native';

import type { SyncResult } from './types';

export function showSyncWarning(result: SyncResult, title: string): void {
  if (!result.warning) return;

  const buttons: AlertButton[] =
    result.warningCode === 'permission'
      ? [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Open settings',
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ]
      : [{ text: 'OK' }];

  Alert.alert(title, result.warning, buttons);
}
