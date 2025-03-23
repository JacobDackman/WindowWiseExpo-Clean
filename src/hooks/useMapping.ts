import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { useSensors } from './useSensors';
import { MappingProcessor } from '../utils/MappingProcessor';
import { Point } from '../types';
import { ENV } from '../config/env';
import { storage } from '../utils/storage';
import NetInfo from '@react-native-community/netinfo';
import { calculatePosition, calculateDistance } from '../utils/distance';

interface MappingData {
  timestamp: number;
  position: { x: number; y: number };
  sensors: {
    accelerometer: { x: number; y: number; z: number };
    magnetometer: { x: number; y: number; z: number };
  };
}

export function useMapping() {
  const { state, dispatch } = useApp();
  const { currentProject, mappingState, settings } = state;
  const [isOffline, setIsOffline] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<number>(Date.now());
  const [isInitializing, setIsInitializing] = useState(true);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState(0);
  const [sensorReadings, setSensorReadings] = useState({
    heading: 0,
    steps: 0,
    isMoving: false,
  });

  const pointsRef = useRef<Point[]>([]);
  const mappingDataRef = useRef<MappingData[]>([]);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [mappingProcessor] = useState(() => new MappingProcessor(settings));

  const {
    isTracking: sensorTracking,
    sensorData,
    sensorsAvailable,
    error: sensorError,
    start: startSensors,
    stop: stopSensors,
    reset: resetSensors,
  } = useSensors({
    enabled: true,
    updateInterval: ENV.SENSOR_UPDATE_INTERVAL,
  });

  // Check network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  // Initialize sensors
  const initializeSensors = useCallback(async (): Promise<boolean> => {
    try {
      setIsInitializing(true);
      const success = await startSensors();
      
      if (!success) {
        return false;
      }

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
      }
      return false;
    }
  }, [startSensors, sensorsAvailable, retryAttempts]);

  // Process sensor data
  useEffect(() => {
    if (mappingState === 'mapping' && sensorData) {
      mappingProcessor.processSensorData(sensorData);
      pointsRef.current = mappingProcessor.getPoints();
      setCurrentPoints([...pointsRef.current]);

      setSensorReadings({
        heading: mappingProcessor.getCurrentHeading(),
        steps: sensorData.pedometer?.steps || 0,
        isMoving: sensorData.accelerometer ? 
          Math.abs(Math.sqrt(
            sensorData.accelerometer.x ** 2 + 
            sensorData.accelerometer.y ** 2 + 
            sensorData.accelerometer.z ** 2
          ) - 9.81) > 0.8 : false
      });

      if (mappingProcessor.checkLoopClosure() && pointsRef.current.length > 10) {
        handleStopMapping();
      }
    }
  }, [mappingState, sensorData]);

  // Handle mapping data updates
  useEffect(() => {
    if (!sensorTracking) return;

    const { accelerometer, magnetometer, timestamp } = sensorData;
    if (!accelerometer || !magnetometer) return;

    const newPosition = calculatePosition(accelerometer, magnetometer);
    if (lastPositionRef.current) {
      const newDistance = calculateDistance(lastPositionRef.current, newPosition);
      setDistance(prev => prev + newDistance);
    }
    lastPositionRef.current = newPosition;

    mappingDataRef.current.push({
      timestamp,
      position: newPosition,
      sensors: {
        accelerometer,
        magnetometer,
      },
    });

    const now = Date.now();
    if (now - lastAutoSave >= ENV.AUTO_SAVE_INTERVAL) {
      handleAutoSave();
    }
  }, [sensorData, sensorTracking]);

  // Auto-save functionality
  useEffect(() => {
    if (mappingState === 'mapping' && currentProject?.currentFloorId) {
      autoSaveIntervalRef.current = setInterval(async () => {
        try {
          if (mappingDataRef.current.length > 0) {
            await storage.saveMappingData(
              currentProject.id,
              currentProject.currentFloorId,
              mappingDataRef.current
            );
            setLastAutoSave(Date.now());
          }
        } catch (error) {
          console.error('Auto-save error:', error);
        }
      }, ENV.AUTO_SAVE_INTERVAL);

      return () => {
        if (autoSaveIntervalRef.current) {
          clearInterval(autoSaveIntervalRef.current);
        }
      };
    }
  }, [mappingState, currentProject]);

  // Mapping control functions
  const handleStartMapping = useCallback(async () => {
    if (!currentProject || !currentProject.currentFloorId) {
      Alert.alert('Error', 'Please create a floor first');
      return;
    }
    
    if (sensorsAvailable.magnetometer === false) {
      Alert.alert(
        'Sensor Unavailable',
        'Compass (magnetometer) sensor is required for mapping. This device may not support accurate mapping.'
      );
      return;
    }
    
    if (sensorsAvailable.pedometer === false) {
      Alert.alert(
        'Sensor Unavailable',
        'Step detector (pedometer) is required for mapping. This device may not support accurate mapping.'
      );
      return;
    }
    
    mappingProcessor.reset();
    pointsRef.current = [];
    setCurrentPoints([]);
    
    const success = await initializeSensors();
    if (success) {
      dispatch({ type: 'START_MAPPING' });
    }
  }, [currentProject, sensorsAvailable, initializeSensors]);

  const handlePauseMapping = useCallback(() => {
    dispatch({ type: 'PAUSE_MAPPING' });
  }, []);

  const handleResumeMapping = useCallback(() => {
    dispatch({ type: 'START_MAPPING' });
  }, []);

  const handleStopMapping = useCallback(async () => {
    dispatch({ type: 'STOP_MAPPING' });
    
    if (currentProject && currentProject.currentFloorId && pointsRef.current.length > 2) {
      const finalPoints = mappingProcessor.closeLoop();
      
      try {
        dispatch({
          type: 'ADD_WALL',
          payload: {
            floorId: currentProject.currentFloorId,
            points: finalPoints,
          },
        });
        
        await storage.saveProject({
          ...currentProject,
          lastModified: Date.now(),
          syncStatus: isOffline ? 'pending' : 'synced'
        });

        if (mappingDataRef.current.length > 0) {
          await storage.saveMappingData(
            currentProject.id,
            currentProject.currentFloorId,
            mappingDataRef.current
          );
        }
        
        Alert.alert(
          'Wall Mapped',
          isOffline ? 
            'The wall has been saved locally and will sync when online.' :
            'The wall has been added to the current floor.',
          [{ text: 'OK' }]
        );
      } catch (error) {
        console.error('Error saving wall:', error);
        Alert.alert(
          'Save Error',
          'Failed to save the wall. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } else if (pointsRef.current.length <= 2) {
      Alert.alert(
        'Not Enough Points',
        'Please walk around the room to create at least 3 points for a wall.',
        [{ text: 'OK' }]
      );
    }
  }, [currentProject, isOffline]);

  const handleAutoSave = useCallback(async () => {
    if (!currentProject?.currentFloorId) return;

    try {
      await storage.saveMappingData(
        currentProject.id,
        currentProject.currentFloorId,
        mappingDataRef.current
      );
      setLastAutoSave(Date.now());
    } catch (error) {
      console.error('Auto-save error:', error);
      Alert.alert(
        'Save Error',
        'Failed to auto-save mapping data. Please manually save your progress.',
        [{ text: 'OK' }]
      );
    }
  }, [currentProject]);

  return {
    isInitializing,
    isOffline,
    currentPoints,
    sensorReadings,
    sensorError,
    mappingState,
    handleStartMapping,
    handlePauseMapping,
    handleResumeMapping,
    handleStopMapping,
    initializeSensors,
  };
} 