import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, Linking, AppState } from 'react-native';
import { Gyroscope, Magnetometer, Accelerometer } from 'expo-sensors';
import * as Device from 'expo-device';
import { SensorsAvailability } from '../types';
import { ENV } from '../config/env';
import { PermissionsAndroid, Alert } from 'react-native';

// Define the ThreeAxisMeasurement type ourselves since it's not exported
interface ThreeAxisMeasurement {
  x: number;
  y: number;
  z: number;
}

// Configuration for step detection
interface SensorConfig {
  THRESHOLD: number;
  DEBOUNCE_TIME: number;
  WINDOW_SIZE: number;
  UPDATE_INTERVAL: number;
  MAX_RETRIES: number;
  RETRY_DELAY: number;
  DATA_TIMEOUT: number;
  MAX_SENSOR_VALUE: number;
  INITIALIZATION_TIMEOUT: number;
}

const STEP_DETECTION_CONFIG: SensorConfig = {
  THRESHOLD: Platform.select({
    ios: 1.2,
    android: 0.8,
    default: 1.2,
  }),
  DEBOUNCE_TIME: Platform.select({
    ios: 250,
    android: 350,
    default: 250,
  }),
  WINDOW_SIZE: Platform.select({
    ios: 5,
    android: 9,
    default: 5,
  }),
  UPDATE_INTERVAL: Platform.select({
    ios: 100,
    android: 200,
    default: 100,
  }),
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  DATA_TIMEOUT: 5000,
  MAX_SENSOR_VALUE: Platform.select({
    ios: 20,
    android: 25,
    default: 20,
  }),
  INITIALIZATION_TIMEOUT: 10000, // 10 seconds max for initialization
};

// Android-specific sensor setup
const setupAndroidSensors = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    try {
      // Request permissions if needed
      const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BODY_SENSORS);
      if (!hasPermission) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BODY_SENSORS,
          {
            title: "Sensor Permission",
            message: "WindowWise needs access to device sensors for mapping functionality",
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

// Define proper types for our sensor data
interface SensorSubscription {
  remove: () => void;
}

interface SensorSubscriptions {
  accelerometer?: SensorSubscription;
  gyroscope?: SensorSubscription;
  magnetometer?: SensorSubscription;
}

interface SensorData {
  accelerometer: ThreeAxisMeasurement;
  gyroscope: ThreeAxisMeasurement;
  magnetometer: ThreeAxisMeasurement;
  pedometer: { steps: number };
  timestamp: number;
}

interface SensorOptions {
  enabled?: boolean;
  updateInterval?: number;
}

interface SensorHookResult {
  isInitializing: boolean;
  isTracking: boolean;
  error: string | null;
  sensorData: SensorData;
  sensorsAvailable: SensorsAvailability;
  start: () => Promise<boolean>;
  stop: () => void;
  reset: () => void;
}

export function useSensors(options?: SensorOptions): SensorHookResult {
  const {
    enabled = true,
    updateInterval = STEP_DETECTION_CONFIG.UPDATE_INTERVAL,
  } = options || {};

  // State declarations
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [retryAttempts, setRetryAttempts] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [sensorsAvailable, setSensorsAvailable] = useState<SensorsAvailability>({
    accelerometer: false,
    gyroscope: false,
    magnetometer: false,
    pedometer: false,
  });

  // Sensor data state
  const [sensorData, setSensorData] = useState<SensorData>({
    accelerometer: { x: 0, y: 0, z: 0 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 0, y: 0, z: 0 },
    pedometer: { steps: 0 },
    timestamp: Date.now()
  });

  // Step detection state
  const [stepCount, setStepCount] = useState<number>(0);
  const stepDetectorRef = useRef<number>(0);
  const lastAccelerationRef = useRef<ThreeAxisMeasurement | null>(null);
  const accelerationWindowRef = useRef<number[]>([]);

  // Subscription refs
  const subscriptionsRef = useRef<SensorSubscriptions>({});
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup subscriptions
  const cleanupSubscriptions = useCallback(() => {
    try {
      // First remove all listeners
      Object.values(subscriptionsRef.current).forEach(subscription => {
        if (subscription?.remove) {
          subscription.remove();
        }
      });
      // Clear the subscriptions object
      subscriptionsRef.current = {};
      // Reset sensor data
      setSensorData({
        accelerometer: { x: 0, y: 0, z: 0 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 },
        pedometer: { steps: 0 },
        timestamp: 0,
      });
      setIsTracking(false);
    } catch (error) {
      console.error('Error cleaning up sensors:', error);
    }
  }, []);

  // Step detection
  const detectStep = useCallback((data: ThreeAxisMeasurement): boolean => {
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

  const checkSensorAvailability = async () => {
    try {
      const magnetometerAvailable = await Magnetometer.isAvailableAsync();
      if (!magnetometerAvailable) {
        Alert.alert(
          'Compass Sensor Required',
          'Your device\'s compass (magnetometer) sensor is not available. This may happen because:\n\n' +
          '1. Your device doesn\'t have a compass sensor\n' +
          '2. Compass access is disabled in settings\n' +
          '3. Battery saver mode is interfering\n' +
          '4. Another app is using the compass\n\n' +
          'To resolve this:\n' +
          '• Check device settings and enable all sensors\n' +
          '• Disable battery saver mode\n' +
          '• Restart your device\n' +
          '• Note: Some devices may not support accurate mapping',
          [
            { 
              text: 'Open Settings', 
              onPress: () => Linking.openSettings() 
            },
            { 
              text: 'Try Again', 
              onPress: () => initializeSensors() 
            },
            { text: 'Cancel' }
          ]
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('[Sensors] Error checking magnetometer:', error);
      return false;
    }
  };

  const initializeSensors = useCallback(async (): Promise<boolean> => {
    try {
      if (isTracking) {
        cleanupSubscriptions();
      }

      // Clear any existing timeout
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }

      setIsInitializing(true);
      setError(null);

      // Create a timeout promise that will reject after the specified time
      const initializationTimeoutPromise = new Promise<boolean>((_, reject) => {
        initTimeoutRef.current = setTimeout(() => {
          reject(new Error('Sensor initialization timeout'));
        }, STEP_DETECTION_CONFIG.INITIALIZATION_TIMEOUT);
      });

      // The actual initialization logic
      const initializeSensorsPromise = async (): Promise<boolean> => {
        const androidSetup = await setupAndroidSensors();
        if (!androidSetup) {
          throw new Error('Android sensor setup failed');
        }

        const [accelAvailable, magAvailable, gyroAvailable] = await Promise.all([
          Accelerometer.isAvailableAsync(),
          Magnetometer.isAvailableAsync(),
          Gyroscope.isAvailableAsync()
        ]);

        setSensorsAvailable({
          accelerometer: accelAvailable,
          magnetometer: magAvailable,
          gyroscope: gyroAvailable,
          pedometer: false
        });

        if (!accelAvailable || !magAvailable) {
          throw new Error('Required sensors not available');
        }

        let receivedData = {
          accelerometer: false,
          magnetometer: false,
          gyroscope: false
        };

        const dataPromise = new Promise<boolean>((resolve, reject) => {
          let dataTimeout: NodeJS.Timeout;

          const checkDataReceived = () => {
            if (receivedData.accelerometer && receivedData.magnetometer) {
              clearTimeout(dataTimeout);
              resolve(true);
            }
          };

          subscriptionsRef.current.accelerometer = Accelerometer.addListener(
            (data: ThreeAxisMeasurement) => {
              receivedData.accelerometer = true;
              setSensorData(prev => ({
                ...prev,
                accelerometer: data,
                timestamp: Date.now()
              }));
              detectStep(data);
              checkDataReceived();
            }
          );

          subscriptionsRef.current.magnetometer = Magnetometer.addListener(
            (data: ThreeAxisMeasurement) => {
              receivedData.magnetometer = true;
              setSensorData(prev => ({
                ...prev,
                magnetometer: data,
                timestamp: Date.now()
              }));
              checkDataReceived();
            }
          );

          if (gyroAvailable) {
            subscriptionsRef.current.gyroscope = Gyroscope.addListener(
              (data: ThreeAxisMeasurement) => {
                receivedData.gyroscope = true;
                setSensorData(prev => ({
                  ...prev,
                  gyroscope: data,
                  timestamp: Date.now()
                }));
              }
            );
          }

          dataTimeout = setTimeout(() => {
            reject(new Error('No sensor data received within timeout'));
          }, STEP_DETECTION_CONFIG.DATA_TIMEOUT);
        });

        await dataPromise;
        return true;
      };

      try {
        await Promise.race([initializeSensorsPromise(), initializationTimeoutPromise]);
        
        // If we got here, initialization succeeded, so clear the timeout
        if (initTimeoutRef.current) {
          clearTimeout(initTimeoutRef.current);
          initTimeoutRef.current = null;
        }
        
        setIsTracking(true);
        setIsInitializing(false);
        return true;
      } catch (error) {
        // Make sure to clear the timeout if initialization failed
        if (initTimeoutRef.current) {
          clearTimeout(initTimeoutRef.current);
          initTimeoutRef.current = null;
        }
        throw error; // Re-throw to be caught by the outer catch block
      }

    } catch (error) {
      console.error('[Sensors] Initialization error:', error);
      cleanupSubscriptions();
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize sensors';
      setError(errorMessage);
      setIsInitializing(false);
      
      Alert.alert(
        'Sensor Error',
        `${errorMessage}\n\nPlease check your device settings and try again.`,
        [
          { 
            text: 'Open Settings',
            onPress: () => Linking.openSettings()
          },
          { 
            text: 'Try Again',
            onPress: () => {
              if (retryAttempts < STEP_DETECTION_CONFIG.MAX_RETRIES) {
                setRetryAttempts(prev => prev + 1);
                initializeSensors();
              } else {
                Alert.alert(
                  'Error',
                  'Maximum retry attempts reached. Please restart the app and try again.',
                  [{ text: 'OK' }]
                );
              }
            }
          },
          { text: 'Cancel' }
        ]
      );
      return false;
    }
  }, [cleanupSubscriptions, detectStep, isTracking, retryAttempts]);

  const showCalibrationGuide = () => {
    Alert.alert(
      'Compass Calibration',
      'To calibrate your device\'s compass:\n\n' +
      '1. Move away from metal objects\n' +
      '2. Wave your device in a figure-8 pattern\n' +
      '3. Rotate your device on all axes\n' +
      '4. Continue for 10-15 seconds\n\n' +
      'Try mapping again after calibration.',
      [{ text: 'OK' }]
    );
  };

  // Start tracking
  const startTracking = useCallback(async () => {
    try {
      if (!isTracking) {
        const initialized = await initializeSensors();
        if (!initialized) {
          throw new Error('Failed to initialize sensors');
        }
      }
      return true;
    } catch (error) {
      console.error('[Sensors] Start tracking error:', error);
      setError('Failed to start sensor tracking');
      return false;
    }
  }, [isTracking, initializeSensors]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    cleanupSubscriptions();
  }, [cleanupSubscriptions]);

  // Effect for handling enabled state
  useEffect(() => {
    let mounted = true;

    if (!enabled) {
      stopTracking();
      return;
    }

    // We'll initialize sensors, but we won't automatically start tracking
    // This prevents double initialization when MappingScreen also calls initializeSensors
    const initialize = async () => {
      try {
        if (mounted) {
          // Just check if sensors are available but don't start tracking yet
          await checkSensorAvailability();
        }
      } catch (error) {
        console.error('[Sensors] Initialization effect error:', error);
      }
    };

    initialize();

    return () => {
      mounted = false;
      if (isTracking) {
        stopTracking();
      }
      
      // Make sure to clear any lingering timeouts
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
    };
  }, [enabled, isTracking, stopTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
      
      // Also clear any timeouts
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
    };
  }, [cleanupSubscriptions]);

  // Add AppState handling
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: string) => {
      if (nextAppState === 'active' && isTracking) {
        // Reinitialize sensors when app comes to foreground
        initializeSensors();
      } else if (nextAppState === 'background') {
        // Cleanup when app goes to background
        cleanupSubscriptions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [initializeSensors, cleanupSubscriptions, isTracking]);

  const reset = useCallback(() => {
    setStepCount(0);
    lastAccelerationRef.current = null;
    stepDetectorRef.current = 0;
    accelerationWindowRef.current = [];
    setSensorData({
      accelerometer: { x: 0, y: 0, z: 0 },
      gyroscope: { x: 0, y: 0, z: 0 },
      magnetometer: { x: 0, y: 0, z: 0 },
      pedometer: { steps: 0 },
      timestamp: Date.now()
    });
  }, []);

  return {
    isInitializing,
    isTracking,
    error,
    sensorData: {
      ...sensorData,
      pedometer: { steps: stepCount },
    },
    sensorsAvailable,
    start: initializeSensors,
    stop: stopTracking,
    reset,
  };
}
