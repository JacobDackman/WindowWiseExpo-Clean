import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface UseAppStateProps {
  onBackground?: () => void;
  onForeground?: () => void;
  onInactive?: () => void;
}

export function useAppState({
  onBackground,
  onForeground,
  onInactive,
}: UseAppStateProps = {}) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      switch (nextAppState) {
        case 'active':
          onForeground?.();
          break;
        case 'background':
          onBackground?.();
          break;
        case 'inactive':
          onInactive?.();
          break;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [onBackground, onForeground, onInactive]);
} 