import { Redirect } from 'expo-router';

import { BootScreen } from '../components/BootScreen';
import { useAppState } from '../state/AppStateContext';

export default function Index() {
  const { ready, state } = useAppState();

  if (!ready) return <BootScreen />;
  return <Redirect href={state ? '/home' : '/onboarding'} />;
}
