import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Gyroscope, Magnetometer, Accelerometer, DeviceMotion } from 'expo-sensors';
import * as Device from 'expo-device';
import { SensorData, SensorsAvailability } from '../types';

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

  // Check sensor availability
  useEffect(() => {
    const checkSensors = async () => {
      try {
        const accelerometerAvailable = await Accelerometer.isAvailableAsync();
        const gyroscopeAvailable = await Gyroscope.isAvailableAsync();
        const magnetometerAvailable = await Magnetometer.isAvailableAsync();
        
        // Pedometer availability is platform-specific
        // On iOS, check if device has motion hardware
        // On Android, we'll use accelerometer for step detection
        let pedometerAvailable = false;
        
        if (Platform.OS === 'ios') {
          const deviceInfo = await Device.getDeviceTypeAsync();
          // Only real devices (not simulators) have motion hardware
          pedometerAvailable = deviceInfo !== Device.DeviceType.UNKNOWN;
        } else {
          // For Android, we'll use accelerometer for basic step detection
          pedometerAvailable = accelerometerAvailable;
        }
        
        setSensorsAvailable({
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

  // Detect steps using accelerometer data
  const detectStep = (acceleration: { x: number; y: number; z: number }) => {
    // Simple step detection algorithm
    // We detect a step by looking for a significant vertical acceleration
    // followed by a vertical deceleration
    
    if (!lastAccelerationRef.current) {
      lastAccelerationRef.current = acceleration;
      return false;
    }
    
    // Calculate the magnitude of acceleration
    const magnitude = Math.sqrt(
      acceleration.x ** 2 + acceleration.y ** 2 + acceleration.z ** 2
    );
    
    // Calculate the difference from the last reading
    const lastMagnitude = Math.sqrt(
      lastAccelerationRef.current.x ** 2 + 
      lastAccelerationRef.current.y ** 2 + 
      lastAccelerationRef.current.z ** 2
    );
    
    const diff = Math.abs(magnitude - lastMagnitude);
    
    // Threshold for step detection
    // This would need calibration for different devices
    const threshold = 0.3;
    
    lastAccelerationRef.current = acceleration;
    
    // If the difference is greater than the threshold, we detect a step
    if (diff > threshold) {
      // Debounce step detection to avoid multiple counts for a single step
      const now = Date.now();
      if (now - stepDetectorRef.current > 400) { // 400ms debounce
        stepDetectorRef.current = now;
        setStepCount(prevCount => prevCount + 1);
        return true;
      }
    }
    
    return false;
  };

  const startTracking = () => {
    // Set update intervals
    Accelerometer.setUpdateInterval(updateInterval);
    Gyroscope.setUpdateInterval(updateInterval);
    Magnetometer.setUpdateInterval(updateInterval);
    
    // Accelerometer subscription
    const accelerometerSubscription = Accelerometer.addListener(accelerometerData => {
      // Detect steps
      const isStep = detectStep(accelerometerData);
      
      // Update sensor data
      setSensorData(prev => ({
        ...prev,
        accelerometer: accelerometerData,
        // If we detected a step, update the pedometer data
        pedometer: isStep ? { steps: stepCount + 1 } : prev.pedometer,
        timestamp: Date.now(),
      }));
    });
    
    // Gyroscope subscription
    const gyroscopeSubscription = Gyroscope.addListener(gyroscopeData => {
      setSensorData(prev => ({
        ...prev,
        gyroscope: gyroscopeData,
        timestamp: Date.now(),
      }));
    });
    
    // Magnetometer subscription
    const magnetometerSubscription = Magnetometer.addListener(magnetometerData => {
      setSensorData(prev => ({
        ...prev,
        magnetometer: magnetometerData,
        timestamp: Date.now(),
      }));
    });
    
    // Return clean-up function
    return () => {
      accelerometerSubscription.remove();
      gyroscopeSubscription.remove();
      magnetometerSubscription.remove();
    };
  };

  const stopTracking = () => {
    // Remove all sensor listeners
    Accelerometer.removeAllListeners();
    Gyroscope.removeAllListeners();
    Magnetometer.removeAllListeners();
  };

  // Public methods
  const start = () => {
    setIsTracking(true);
    setStepCount(0);
    lastAccelerationRef.current = null;
    stepDetectorRef.current = 0;
  };

  const stop = () => {
    setIsTracking(false);
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
