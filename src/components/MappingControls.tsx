import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { colors } from '../theme';

interface MappingControlsProps {
  isActive: boolean;
  isPaused: boolean;
  disabled?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export const MappingControls: React.FC<MappingControlsProps> = ({
  isActive,
  isPaused,
  disabled = false,
  onStart,
  onPause,
  onResume,
  onStop,
}) => {
  return (
    <View style={styles.container}>
      {!isActive ? (
        <TouchableOpacity
          style={[styles.button, styles.startButton, disabled && styles.disabled]}
          onPress={onStart}
          disabled={disabled}
        >
          <Text style={styles.buttonText}>Start Mapping</Text>
        </TouchableOpacity>
      ) : isPaused ? (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.button, styles.resumeButton, disabled && styles.disabled]}
            onPress={onResume}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>Resume</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.stopButton, disabled && styles.disabled]}
            onPress={onStop}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>Stop</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.button, styles.pauseButton, disabled && styles.disabled]}
            onPress={onPause}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>Pause</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.stopButton, disabled && styles.disabled]}
            onPress={onStop}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: colors.primary,
  },
  pauseButton: {
    backgroundColor: colors.warning,
  },
  resumeButton: {
    backgroundColor: colors.success,
  },
  stopButton: {
    backgroundColor: colors.error,
  },
  disabled: {
    opacity: 0.5,
  },
}); 