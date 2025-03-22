import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { Gyroscope, Magnetometer, Accelerometer, DeviceMotion } from 'expo-sensors';
import * as Device from 'expo-device';
import { SensorData, SensorsAvailability } from '../types';
import { ENV } from '../config/env';

// Default update interval in milliseconds
const DEFAULT_UPDATE_INTERVAL = 100; // 10 times per second

export function useSensors(options?: {
  enabled?: boolean;
  updateInterval?: number;
}) {
  const {
    enabled = true,
    updateInterval = DEFAULT_UPDATE_INTERVAL,
  } = options || {};

  // Sensor data state
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sensorData, setSensorData] = useState<SensorData>({
    timestamp: Date.now(),
  });
  const [sensorsAvailable, setSensorsAvailable] = useState<SensorsAvailability>({
    accelerometer: false,
    gyroscope: false,
    magnetometer: false,
    pedometer: false,
  });

  // Step counter
  const [stepCount, setStepCount] = useState(0);
  const stepDetectorRef = useRef<number>(0);
  const lastAccelerationRef = useRef<{ x: number; y: number; z: number } | null>(null);

  // Refs for subscriptions
  const subscriptionsRef = useRef({
    accelerometer: null,
    gyroscope: null,
    magnetometer: null
  });

  // Refs for step detection
  const lastStepTimeRef = useRef<number | null>(null);
  const accelerationWindowRef = useRef<number[]>([]);

  // Step detection configuration
  const STEP_CONFIG = {
    BASE_THRESHOLD: 0.3,
    DEVICE_SPECIFIC_MULTIPLIER: Platform.select({
      ios: 1.0,
      android: 1.2, // Android sensors often need slightly different calibration
      default: 1.0
    }),
    MIN_STEP_INTERVAL: 250, // Minimum time between steps in ms
    ACCELERATION_WINDOW: 5, // Number of samples to average
  };

  // Cleanup function
  const cleanupSubscriptions = useCallback(() => {
    Object.values(subscriptionsRef.current).forEach(subscription => {
      if (subscription) {
        subscription.remove();
      }
    });
    subscriptionsRef.current = {
      accelerometer: null,
      gyroscope: null,
      magnetometer: null
    };
  }, []);

  // Check sensor availability
  useEffect(() => {
    const checkSensors = async () => {
      try {
        // Initialize sensors one at a time with delays
        const accelerometerAvailable = await Accelerometer.isAvailableAsync();
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between checks
        
        const gyroscopeAvailable = await Gyroscope.isAvailableAsync();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const magnetometerAvailable = await Magnetometer.isAvailableAsync();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Pedometer availability is platform-specific
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

        // Log sensor availability for debugging
        console.log('Sensor availability:', {
          accelerometer: accelerometerAvailable,
          gyroscope: gyroscopeAvailable,
          magnetometer: magnetometerAvailable,
          pedometer: pedometerAvailable,
        });
      } catch (err) {
        console.error('Error checking sensor availability:', err);
        setError('Failed to check sensor availability');
      }
    };
    
    checkSensors();
  }, []);

  // Start/stop sensor tracking
  useEffect(() => {
    if (!enabled) {
      stopTracking();
      return;
    }
    
    if (isTracking) {
      startTracking();
    } else {
      stopTracking();
    }
    
    return () => {
      stopTracking();
    };
  }, [isTracking, enabled, updateInterval]);

  // Improved step detection with device-specific calibration and noise filtering
  const detectStep = useCallback((acceleration: { x: number; y: number; z: number }) => {
    const now = Date.now();
    
    // Check if enough time has passed since last step
    if (lastStepTimeRef.current && (now - lastStepTimeRef.current) < STEP_CONFIG.MIN_STEP_INTERVAL) {
      return false;
    }

    // Calculate total acceleration magnitude
    const magnitude = Math.sqrt(
      acceleration.x * acceleration.x +
      acceleration.y * acceleration.y +
      acceleration.z * acceleration.z
    );

    // Update acceleration window
    accelerationWindowRef.current = [
      ...(accelerationWindowRef.current || []).slice(-(STEP_CONFIG.ACCELERATION_WINDOW - 1)),
      magnitude
    ];

    // Calculate average acceleration over window
    const avgMagnitude = accelerationWindowRef.current.reduce((sum, val) => sum + val, 0) 
      / accelerationWindowRef.current.length;

    // Calculate adaptive threshold based on device
    const adaptiveThreshold = STEP_CONFIG.BASE_THRESHOLD * STEP_CONFIG.DEVICE_SPECIFIC_MULTIPLIER;

    // Check if this is a step
    if (magnitude > avgMagnitude + adaptiveThreshold) {
      if (ENV.ENABLE_DEBUG_LOGGING) {
        console.log('Step detected:', {
          magnitude,
          avgMagnitude,
          threshold: adaptiveThreshold,
          timeSinceLastStep: lastStepTimeRef.current ? now - lastStepTimeRef.current : 'first step'
        });
      }

      lastStepTimeRef.current = now;
      return true;
    }

    return false;
  }, []);

  // Start tracking
  const startTracking = useCallback(async () => {
    try {
      // Clean up any existing subscriptions first
      cleanupSubscriptions();

      // Set update intervals
      await Promise.all([
        Accelerometer.setUpdateInterval(ENV.SENSOR_UPDATE_INTERVAL),
        Gyroscope.setUpdateInterval(ENV.SENSOR_UPDATE_INTERVAL),
        Magnetometer.setUpdateInterval(ENV.SENSOR_UPDATE_INTERVAL)
      ]);

      // Create new subscriptions
      subscriptionsRef.current.accelerometer = Accelerometer.addListener(data => {
        // Detect steps
        const isStep = detectStep(data);
        
        // Update sensor data
        setSensorData(prev => ({
          ...prev,
          accelerometer: data,
          // If we detected a step, update the pedometer data
          pedometer: isStep ? { steps: stepCount + 1 } : prev.pedometer,
          timestamp: Date.now(),
        }));
      });

      subscriptionsRef.current.gyroscope = Gyroscope.addListener(data => {
        setSensorData(prev => ({
          ...prev,
          gyroscope: data,
          timestamp: Date.now(),
        }));
      });

      subscriptionsRef.current.magnetometer = Magnetometer.addListener(data => {
        setSensorData(prev => ({
          ...prev,
          magnetometer: data,
          timestamp: Date.now(),
        }));
      });

      if (ENV.ENABLE_DEBUG_LOGGING) {
        console.log('Started sensor tracking with interval:', ENV.SENSOR_UPDATE_INTERVAL);
      }

      // Start tracking
      setIsTracking(true);
      
      return true;
    } catch (error) {
      console.error('Error starting sensor tracking:', error);
      cleanupSubscriptions();
      setError('Failed to start sensors');
      return false;
    }
  }, [cleanupSubscriptions, detectStep, stepCount, setSensorData, setIsTracking]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    cleanupSubscriptions();
    if (ENV.ENABLE_DEBUG_LOGGING) {
      console.log('Stopped sensor tracking');
    }
    setIsTracking(false);
  }, [cleanupSubscriptions, setIsTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions]);

  // Public methods
  const start = () => {
    try {
      // Initialize sensor data with default values
      setSensorData({
        timestamp: Date.now(),
        accelerometer: { x: 0, y: 0, z: 0 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 },
        pedometer: { steps: 0 },
      });
      
      setStepCount(0);
      lastAccelerationRef.current = null;
      stepDetectorRef.current = 0;
      setError(null);
      
      // Start tracking
      startTracking();
      
      return true;
    } catch (error) {
      console.error('Error starting sensors:', error);
      setError('Failed to start sensors');
      return false;
    }
  };

  const stop = () => {
    stopTracking();
  };

  const reset = () => {
    setStepCount(0);
    lastAccelerationRef.current = null;
    stepDetectorRef.current = 0;
    setSensorData({
      timestamp: Date.now(),
    });
  };

  return {
    isTracking,
    sensorData: {
      ...sensorData,
      pedometer: { steps: stepCount },
    },
    sensorsAvailable,
    error,
    start,
    stop,
    reset,
  };
}