import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { Gyroscope, Magnetometer, Accelerometer } from 'expo-sensors';
import * as Device from 'expo-device';
import { SensorData, SensorsAvailability } from '../types';
import { ENV } from '../config/env';
import { PermissionsAndroid } from 'react-native';
import { Alert } from 'react-native';

// Configuration for step detection
const STEP_DETECTION_CONFIG = {
  THRESHOLD: Platform.select({
    ios: 1.2,
    android: 1.0,
    default: 1.2,
  }),
  DEBOUNCE_TIME: Platform.select({
    ios: 250,
    android: 300,
    default: 250,
  }),
  WINDOW_SIZE: Platform.select({
    ios: 5,
    android: 7,
    default: 5,
  }),
  UPDATE_INTERVAL: Platform.select({
    ios: 100,
    android: 150,
    default: 100,
  }),
};

// Android-specific sensor setup
const setupAndroidSensors = async () => {
  if (Platform.OS === 'android') {
    try {
      // Request permissions if needed (some Android devices require this)
      if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BODY_SENSORS) === false) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BODY_SENSORS,
          {
            title: "Sensor Permission",
            message: "This app needs access to device sensors for mapping functionality",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Sensor permission denied');
        }
      }

      // Set Android-specific sensor configurations
      await Promise.all([
        Accelerometer.setUpdateInterval(STEP_DETECTION_CONFIG.UPDATE_INTERVAL),
        Gyroscope.setUpdateInterval(STEP_DETECTION_CONFIG.UPDATE_INTERVAL),
        Magnetometer.setUpdateInterval(STEP_DETECTION_CONFIG.UPDATE_INTERVAL),
      ]);

      return true;
    } catch (error) {
      console.error('Android sensor setup error:', error);
      return false;
    }
  }
  return true;
};

export function useSensors(options?: {
  enabled?: boolean;
  updateInterval?: number;
}) {
  const {
    enabled = true,
    updateInterval = STEP_DETECTION_CONFIG.UPDATE_INTERVAL,
  } = options || {};

  // State declarations
  const [isInitializing, setIsInitializing] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [sensorsAvailable, setSensorsAvailable] = useState<SensorsAvailability>({
    accelerometer: false,
    gyroscope: false,
    magnetometer: false,
    pedometer: false,
  });

  // Sensor data state
  const [sensorData, setSensorData] = useState<SensorData>({
    timestamp: Date.now(),
  });

  // Step detection state
  const [stepCount, setStepCount] = useState(0);
  const stepDetectorRef = useRef<number>(0);
  const lastAccelerationRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const accelerationWindowRef = useRef<number[]>([]);

  // Subscription refs
  const subscriptionsRef = useRef<{
    accelerometer: { remove: () => void } | null;
    gyroscope: { remove: () => void } | null;
    magnetometer: { remove: () => void } | null;
  }>({
    accelerometer: null,
    gyroscope: null,
    magnetometer: null,
  });

  // Cleanup subscriptions
  const cleanupSubscriptions = useCallback(() => {
    Object.values(subscriptionsRef.current).forEach(subscription => {
      if (subscription) {
        subscription.remove();
      }
    });
    subscriptionsRef.current = {
      accelerometer: null,
      gyroscope: null,
      magnetometer: null,
    };
  }, []);

  // Step detection
  const detectStep = useCallback((data: { x: number; y: number; z: number }) => {
    const now = Date.now();
    if (now - stepDetectorRef.current < STEP_DETECTION_CONFIG.DEBOUNCE_TIME) {
      return false;
    }

    const acceleration = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
    accelerationWindowRef.current.push(acceleration);

    if (accelerationWindowRef.current.length > STEP_DETECTION_CONFIG.WINDOW_SIZE) {
      accelerationWindowRef.current.shift();
    }

    if (accelerationWindowRef.current.length === STEP_DETECTION_CONFIG.WINDOW_SIZE) {
      const avg = accelerationWindowRef.current.reduce((a, b) => a + b) / STEP_DETECTION_CONFIG.WINDOW_SIZE;
      const threshold = Math.abs(acceleration - avg);

      if (threshold > STEP_DETECTION_CONFIG.THRESHOLD) {
        stepDetectorRef.current = now;
        setStepCount(prev => prev + 1);
        return true;
      }
    }

    return false;
  }, []);

  // Start sensors function
  const startSensors = useCallback(async (): Promise<boolean> => {
    try {
      setIsInitializing(true);
      setError(null);

      // Clean up any existing subscriptions first
      cleanupSubscriptions();

      // First check if sensors are available
      const [accelerometerAvailable, gyroscopeAvailable, magnetometerAvailable] = 
        await Promise.all([
          Accelerometer.isAvailableAsync(),
          Gyroscope.isAvailableAsync(),
          Magnetometer.isAvailableAsync(),
        ]);

      console.log('Sensor availability:', {
        accelerometer: accelerometerAvailable,
        gyroscope: gyroscopeAvailable,
        magnetometer: magnetometerAvailable,
      });

      // Update sensor availability state
      setSensorsAvailable({
        accelerometer: accelerometerAvailable,
        gyroscope: gyroscopeAvailable,
        magnetometer: magnetometerAvailable,
        pedometer: accelerometerAvailable,
      });

      // If required sensors are not available, return false
      if (!accelerometerAvailable || !magnetometerAvailable) {
        const missingSensors = [];
        if (!accelerometerAvailable) missingSensors.push('accelerometer');
        if (!magnetometerAvailable) missingSensors.push('magnetometer');
        setError(`Required sensors not available: ${missingSensors.join(', ')}`);
        setIsInitializing(false);
        return false;
      }

      // Set update intervals first
      await Promise.all([
        Accelerometer.setUpdateInterval(STEP_DETECTION_CONFIG.UPDATE_INTERVAL),
        Gyroscope.setUpdateInterval(STEP_DETECTION_CONFIG.UPDATE_INTERVAL),
        Magnetometer.setUpdateInterval(STEP_DETECTION_CONFIG.UPDATE_INTERVAL),
      ]);

      // Set up direct subscriptions
      subscriptionsRef.current.accelerometer = Accelerometer.addListener(accelerometerData => {
        const isStep = detectStep(accelerometerData);
        setSensorData(prev => ({
          ...prev,
          accelerometer: accelerometerData,
          pedometer: { steps: stepCount + (isStep ? 1 : 0) },
          timestamp: Date.now(),
        }));
      });

      subscriptionsRef.current.gyroscope = Gyroscope.addListener(gyroscopeData => {
        setSensorData(prev => ({
          ...prev,
          gyroscope: gyroscopeData,
          timestamp: Date.now(),
        }));
      });

      subscriptionsRef.current.magnetometer = Magnetometer.addListener(magnetometerData => {
        setSensorData(prev => ({
          ...prev,
          magnetometer: magnetometerData,
          timestamp: Date.now(),
        }));
      });

      // Wait for initial data from sensors
      await Promise.race([
        new Promise<void>((resolve) => {
          const checkData = setInterval(() => {
            if (sensorData.accelerometer && sensorData.magnetometer) {
              clearInterval(checkData);
              resolve();
            }
          }, 100);
        }),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout waiting for sensor data')), 5000)
        ),
      ]);

      setIsTracking(true);
      setIsInitializing(false);
      return true;
    } catch (error) {
      console.error('Error starting sensors:', error);
      cleanupSubscriptions();
      setError(`Failed to start sensors: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsInitializing(false);
      return false;
    }
  }, [detectStep, stepCount, cleanupSubscriptions, sensorData]);

  // Check sensor availability
  const checkSensors = useCallback(async () => {
    try {
      const [accelerometerAvailable, gyroscopeAvailable, magnetometerAvailable] = 
        await Promise.all([
          Accelerometer.isAvailableAsync(),
          Gyroscope.isAvailableAsync(),
          Magnetometer.isAvailableAsync(),
        ]);

      // For Android, we use accelerometer for step detection
      // For iOS, we check device capabilities
      let pedometerAvailable = false;
      if (Platform.OS === 'ios') {
        const deviceInfo = await Device.getDeviceTypeAsync();
        pedometerAvailable = deviceInfo !== Device.DeviceType.UNKNOWN;
      } else {
        pedometerAvailable = accelerometerAvailable;
      }

      setSensorsAvailable({
        accelerometer: accelerometerAvailable,
        gyroscope: gyroscopeAvailable,
        magnetometer: magnetometerAvailable,
        pedometer: pedometerAvailable,
      });

      return {
        accelerometer: accelerometerAvailable,
        gyroscope: gyroscopeAvailable,
        magnetometer: magnetometerAvailable,
        pedometer: pedometerAvailable,
      };
    } catch (err) {
      console.error('Error checking sensor availability:', err);
      setError('Failed to check sensor availability');
      return null;
    }
  }, []);

  // Initialize sensors with configuration
  const initializeSensors = useCallback(async (): Promise<boolean> => {
    try {
      setIsInitializing(true);

      // Setup Android-specific configurations first
      const androidSetupSuccess = await setupAndroidSensors();
      if (!androidSetupSuccess) {
        setError('Failed to setup Android sensors');
        return false;
      }

      const success = await startSensors();
      if (!success) {
        setError('Failed to start sensors');
        return false;
      }

      // Verify sensor availability
      const requiredSensors = ['accelerometer', 'magnetometer'] as const;
      const unavailableSensors = requiredSensors.filter(
        sensor => !sensorsAvailable[sensor]
      );

      if (unavailableSensors.length > 0) {
        console.error(
          `Required sensors not available: ${unavailableSensors.join(', ')}`
        );
        return false;
      }

      // Additional Android-specific sensor checks
      if (Platform.OS === 'android') {
        // Check if sensors are providing valid data
        const initialReadings = await Promise.race([
          new Promise(resolve => {
            const subscription = Accelerometer.addListener(data => {
              subscription.remove();
              resolve(data);
            });
          }),
          new Promise(resolve => setTimeout(() => resolve(null), 1000))
        ]);

        if (!initialReadings) {
          console.error('Failed to get initial sensor readings on Android');
          return false;
        }
      }

      setIsInitializing(false);
      setRetryAttempts(0);
      return true;
    } catch (error) {
      console.error('Sensor initialization error:', error);
      
      if (retryAttempts < 3) {
        setRetryAttempts(prev => prev + 1);
        setTimeout(() => {
          initializeSensors();
        }, 1000 * (retryAttempts + 1));
      } else {
        setIsInitializing(false);
        Alert.alert(
          'Sensor Error',
          'Failed to initialize sensors. Please check your device settings and try again.',
          [
            { text: 'OK' },
            {
              text: 'Retry',
              onPress: () => {
                setRetryAttempts(0);
                initializeSensors();
              },
            },
          ]
        );
      }
      return false;
    }
  }, [startSensors, sensorsAvailable, retryAttempts]);

  // Start tracking
  const startTracking = useCallback(async () => {
    try {
      // Clean up any existing subscriptions
      cleanupSubscriptions();

      // Initialize sensors
      const initialized = await initializeSensors();
      if (!initialized) {
        throw new Error('Failed to initialize sensors');
      }

      // Set up subscriptions
      subscriptionsRef.current.accelerometer = Accelerometer.addListener(accelerometerData => {
        const isStep = detectStep(accelerometerData);
        setSensorData(prev => ({
          ...prev,
          accelerometer: accelerometerData,
          pedometer: { steps: stepCount + (isStep ? 1 : 0) },
          timestamp: Date.now(),
        }));
      });

      subscriptionsRef.current.gyroscope = Gyroscope.addListener(gyroscopeData => {
        setSensorData(prev => ({
          ...prev,
          gyroscope: gyroscopeData,
          timestamp: Date.now(),
        }));
      });

      subscriptionsRef.current.magnetometer = Magnetometer.addListener(magnetometerData => {
        setSensorData(prev => ({
          ...prev,
          magnetometer: magnetometerData,
          timestamp: Date.now(),
        }));
      });

      setIsTracking(true);
      return true;
    } catch (error) {
      console.error('Error starting sensor tracking:', error);
      setError('Failed to start sensor tracking');
      return false;
    }
  }, [cleanupSubscriptions, initializeSensors, detectStep, stepCount]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    cleanupSubscriptions();
    setIsTracking(false);
  }, [cleanupSubscriptions]);

  // Effect for handling enabled state
  useEffect(() => {
    if (!enabled) {
      stopTracking();
      return;
    }

    if (isTracking) {
      startTracking();
    }

    return () => {
      if (isTracking) {
        stopTracking();
      }
    };
  }, [enabled, isTracking, startTracking, stopTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions]);

  const reset = useCallback(() => {
    setStepCount(0);
    lastAccelerationRef.current = null;
    stepDetectorRef.current = 0;
    accelerationWindowRef.current = [];
    setSensorData({
      timestamp: Date.now(),
    });
  }, []);

  return {
    isTracking,
    sensorData: {
      ...sensorData,
      pedometer: { steps: stepCount },
    },
    sensorsAvailable,
    error,
    start: startSensors,
    stop: stopTracking,
    reset,
  };
}