import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SensorData } from '../types';

interface SensorStatusProps {
  isInitializing: boolean;
  sensorData: SensorData | null;
  retryAttempts: number;
  error: string | null;
}

export const SensorStatus: React.FC<SensorStatusProps> = ({
  isInitializing,
  sensorData,
  retryAttempts,
  error,
}) => {
  const getSensorStatus = (sensorType: 'accelerometer' | 'magnetometer' | 'pedometer') => {
    if (!sensorData) return false;
    
    switch (sensorType) {
      case 'accelerometer':
        return sensorData.accelerometer && 
          typeof sensorData.accelerometer.x === 'number' &&
          typeof sensorData.accelerometer.y === 'number' &&
          typeof sensorData.accelerometer.z === 'number';
      case 'magnetometer':
        return sensorData.magnetometer && 
          typeof sensorData.magnetometer.x === 'number' &&
          typeof sensorData.magnetometer.y === 'number' &&
          typeof sensorData.magnetometer.z === 'number';
      case 'pedometer':
        return sensorData.accelerometer !== null; // Pedometer uses accelerometer
      default:
        return false;
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4CAF50" />
      <Text style={styles.title}>Initializing Sensors...</Text>
      
      {retryAttempts > 0 && (
        <Text style={styles.retryText}>
          Attempt {retryAttempts} of 3
        </Text>
      )}
      
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      <View style={styles.sensorsContainer}>
        <View style={styles.sensorRow}>
          <Text style={styles.sensorLabel}>Accelerometer:</Text>
          <View style={[
            styles.sensorIndicator,
            { backgroundColor: getSensorStatus('accelerometer') ? '#4CAF50' : '#9E9E9E' }
          ]} />
        </View>

        <View style={styles.sensorRow}>
          <Text style={styles.sensorLabel}>Compass:</Text>
          <View style={[
            styles.sensorIndicator,
            { backgroundColor: getSensorStatus('magnetometer') ? '#4CAF50' : '#9E9E9E' }
          ]} />
        </View>

        <View style={styles.sensorRow}>
          <Text style={styles.sensorLabel}>Step Detection:</Text>
          <View style={[
            styles.sensorIndicator,
            { backgroundColor: getSensorStatus('pedometer') ? '#4CAF50' : '#9E9E9E' }
          ]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  retryText: {
    fontSize: 14,
    color: '#FFA726',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#EF5350',
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  sensorsContainer: {
    marginTop: 24,
    width: '80%',
    maxWidth: 300,
  },
  sensorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sensorLabel: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  sensorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
}); 