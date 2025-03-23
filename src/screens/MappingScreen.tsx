import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  SafeAreaView, 
  Alert, 
  ActivityIndicator,
  Animated,
  ImageBackground,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as MediaLibrary from 'expo-media-library';
import NetInfo from '@react-native-community/netinfo';
import { 
  Magnetometer, 
  Accelerometer, 
  Gyroscope,
  MagnetometerMeasurement,
  AccelerometerMeasurement,
  GyroscopeMeasurement
} from 'expo-sensors';

import { useApp } from '../contexts/AppContext';
import { useSensors } from '../hooks/useSensors';
import { MappingProcessor } from '../utils/MappingProcessor';
import { MapView } from '../components/MapView';
import { Button } from '../components/Button';
import { FeatureButtons } from '../components/FeatureButtons';
import { FloorManager } from '../components/FloorManager';
import { WallEditor } from '../components/WallEditor';
import { MapExporter } from '../components/MapExporter';
import { FeatureType, Point } from '../types';
import { ENV } from '../config/env';
import { useAppState } from '../hooks/useAppState';
import { useKeepAwake } from 'expo-keep-awake';
import { SensorStatus } from '../components/SensorStatus';
import { MappingControls } from '../components/MappingControls';
import { storage } from '../utils/storage';
import { calculateDistance, calculatePosition } from '../utils/distance';
import { colors } from '../theme';

// Define sensor subscription types
type SensorInitStatus = {
  accelerometer: boolean;
  magnetometer: boolean;
  pedometer: boolean;
};

type ThreeAxisMeasurement = {
  x: number;
  y: number;
  z: number;
};

type SensorSubscription = {
  remove: () => void;
};

// Define sensor measurement types
type SensorMeasurement = {
  x: number;
  y: number;
  z: number;
};

type SensorSubscriptionType = {
  remove: () => void;
  [key: string]: any;
};

interface MappingData {
  timestamp: number;
  position: { x: number; y: number };
  sensors: {
    accelerometer: { x: number; y: number; z: number };
    magnetometer: { x: number; y: number; z: number };
  };
}

export const MappingScreen: React.FC = () => {
  const navigation = useNavigation();
  const { state, dispatch, startMapping, pauseMapping, stopMapping, addFeature, saveProject } = useApp();
  const { currentProject, mappingState, settings } = state;
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
  const [calibrationCountdown, setCalibrationCountdown] = useState(3);
  const [mappingProcessor] = useState(() => new MappingProcessor(settings));
  const [isFloorManagerVisible, setFloorManagerVisible] = useState(false);
  const [isWallEditorVisible, setWallEditorVisible] = useState(false);
  const [isMapExporterVisible, setMapExporterVisible] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [mappingFeedbackOpacity] = useState(new Animated.Value(0));
  const [sensorReadings, setSensorReadings] = useState({
    heading: 0,
    steps: 0,
    isMoving: false,
  });
  
  // Sensor initialization state
  const [isInitializing, setIsInitializing] = useState(true);
  const [isMappingActive, setIsMappingActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [distance, setDistance] = useState(0);
  const [lastSaveTime, setLastSaveTime] = useState(Date.now());
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sensorInitStatus, setSensorInitStatus] = useState<SensorInitStatus>({
    accelerometer: false,
    magnetometer: false,
    pedometer: false,
  });
  
  const pointsRef = useRef<Point[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sensorCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get current floor info
  const currentFloor = currentProject?.floors.find(
    f => f.id === currentProject?.currentFloorId
  );
  const currentFloorName = currentFloor?.name || 'No Floor';
  const wallCount = currentFloor?.walls.length || 0;
  // Add these new state variables after your existing ones:
  const [isAdvancedCalibrating, setIsAdvancedCalibrating] = useState(false);
  const [calibrationSkipped, setCalibrationSkipped] = useState(false);
  
  // Update subscription refs with proper types
  const magnetometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const accelerometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const gyroscopeSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  // Function to clean up sensor subscriptions
  const cleanupSubscriptions = useCallback(() => {
    if (magnetometerSubscriptionRef.current) {
      magnetometerSubscriptionRef.current.remove();
      magnetometerSubscriptionRef.current = null;
    }
    
    if (accelerometerSubscriptionRef.current) {
      accelerometerSubscriptionRef.current.remove();
      accelerometerSubscriptionRef.current = null;
    }
    
    if (gyroscopeSubscriptionRef.current) {
      gyroscopeSubscriptionRef.current.remove();
      gyroscopeSubscriptionRef.current = null;
    }

    // Also use the stop function from the useSensors hook if available
    if (stopSensors) {
      stopSensors();
    }
  }, [stopSensors]);

  // Keep screen awake during mapping
  useKeepAwake();

  // Handle app state changes
  useAppState({
    onBackground: () => {
      if (mappingState === 'mapping' && !sensorTracking) {
        handlePauseMapping();
      }
    },
    onForeground: () => {
      // Optionally resume mapping when app comes to foreground
      // This depends on your app's requirements
    },
  });

  // Refs for tracking
  const mappingDataRef = useRef<MappingData[]>([]);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Process sensor data when tracking
  useEffect(() => {
    // Check sensor initialization status when initializing
    if (isInitializing && sensorData) {
      const newStatus = {...sensorInitStatus};
      
      // Check if we've received valid accelerometer data
      if (sensorData.accelerometer && 
          typeof sensorData.accelerometer.x === 'number' &&
          typeof sensorData.accelerometer.y === 'number' &&
          typeof sensorData.accelerometer.z === 'number') {
        newStatus.accelerometer = true;
      }
      
      // Check if we've received valid magnetometer data
      if (sensorData.magnetometer && 
          typeof sensorData.magnetometer.x === 'number' &&
          typeof sensorData.magnetometer.y === 'number' &&
          typeof sensorData.magnetometer.z === 'number') {
        newStatus.magnetometer = true;
      }
      
      // For pedometer, we'll consider it initialized if accelerometer is working
      if (newStatus.accelerometer) {
        newStatus.pedometer = true;
      }
      
      setSensorInitStatus(newStatus);

      // If all sensors are initialized, we can proceed
      if (newStatus.accelerometer && newStatus.magnetometer && newStatus.pedometer) {
        setIsInitializing(false);
      }
    }
  
    // Original code for mapping
    if (mappingState === 'mapping' && sensorData) {
      mappingProcessor.processSensorData(sensorData);
      pointsRef.current = mappingProcessor.getPoints();
      setCurrentPoints([...pointsRef.current]);
      // Update sensor readings for UI display
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
      
      // Check for loop closure
      if (mappingProcessor.checkLoopClosure() && pointsRef.current.length > 10) {
        handleStopMapping();
      }
    }
  }, [mappingState, sensorData, isInitializing]);

  // Initialize sensors with configuration
  const initializeSensors = useCallback(async (): Promise<boolean> => {
    try {
      setIsInitializing(true);
      setError(null);
      setSensorInitStatus({
        accelerometer: false,
        magnetometer: false,
        pedometer: false,
      });

      // First check if sensors are available
      const [accelerometerAvailable, magnetometerAvailable] = await Promise.all([
        Accelerometer.isAvailableAsync(),
        Magnetometer.isAvailableAsync(),
      ]);

      console.log('Checking sensor availability:', {
        accelerometer: accelerometerAvailable,
        magnetometer: magnetometerAvailable,
      });

      if (!accelerometerAvailable || !magnetometerAvailable) {
        const missingSensors = [];
        if (!accelerometerAvailable) missingSensors.push('accelerometer');
        if (!magnetometerAvailable) missingSensors.push('magnetometer');
        
        Alert.alert(
          'Sensor Error',
          `Required sensors are not available: ${missingSensors.join(', ')}. Please check your device settings.`,
          [{ text: 'OK', onPress: () => navigation.navigate('Home' as never) }]
        );
        setIsInitializing(false);
        return false;
      }

      // Then try to initialize sensors
      const success = await startSensors();
      
      if (!success) {
        Alert.alert(
          'Sensor Error',
          'Failed to initialize sensors. Please check your device settings and try again.',
          [{ text: 'OK', onPress: () => navigation.navigate('Home' as never) }]
        );
        setIsInitializing(false);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Sensor initialization error:', error);
      Alert.alert(
        'Sensor Error',
        error instanceof Error ? error.message : 'Failed to initialize sensors',
        [{ text: 'OK', onPress: () => navigation.navigate('Home' as never) }]
      );
      return false;
    }
  }, [startSensors, navigation]);

  // Effect for initialization
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const success = await initializeSensors();
        if (!success && mounted) {
          // Show some UI feedback that initialization failed
          setError('Failed to initialize sensors');
        }
      } catch (error) {
        console.error('[MappingScreen] Sensor initialization failed:', error);
        if (mounted) {
          setError('Error initializing sensors');
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      cleanupSubscriptions();
    };
  }, [initializeSensors, cleanupSubscriptions]);

  // Handle mapping data updates
  useEffect(() => {
    if (!sensorTracking) return;

    const { accelerometer, magnetometer, timestamp } = sensorData;
    if (!accelerometer || !magnetometer) return;

    // Calculate position and update distance
    const newPosition = calculatePosition(accelerometer, magnetometer);
    if (lastPositionRef.current) {
      const newDistance = calculateDistance(lastPositionRef.current, newPosition);
      setDistance(prev => prev + newDistance);
    }
    lastPositionRef.current = newPosition;

    // Store mapping data
    mappingDataRef.current.push({
      timestamp,
      position: newPosition,
      sensors: {
        accelerometer,
        magnetometer,
      },
    });

    // Auto-save data periodically
    const now = Date.now();
    if (now - lastSaveTime >= ENV.AUTO_SAVE_INTERVAL) {
      handleAutoSave();
    }
  }, [sensorData, sensorTracking]);

  // Handle auto-save
  const handleAutoSave = useCallback(async () => {
    try {
      await storage.saveMappingData(
        currentProject.id,
        currentProject.currentFloorId,
        mappingDataRef.current
      );
      setLastSaveTime(Date.now());
    } catch (error) {
      console.error('Auto-save error:', error);
      Alert.alert(
        'Save Error',
        'Failed to auto-save mapping data. Please manually save your progress.',
        [{ text: 'OK' }]
      );
    }
  }, [currentProject]);

  // Start mapping with sensor checks
  const handleStartMapping = () => {
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
    
    // Reset the mapping processor
    mappingProcessor.reset();
    pointsRef.current = [];
    setCurrentPoints([]);
    
    // Initialize sensors first
    initializeSensors().then((success) => {
      if (success) {
        startMapping();
      }
    }).catch((error) => {
      console.error('Failed to initialize sensors:', error);
      Alert.alert('Error', 'Failed to initialize sensors. Please try again.');
    });
  };

  // Pause mapping
  const handlePauseMapping = () => {
    pauseMapping();
  };

  // Resume mapping
  const handleResumeMapping = () => {
    startMapping();
  };

  // Stop mapping and save the wall
  const handleStopMapping = async () => {
    stopMapping();
    
    if (currentProject && currentProject.currentFloorId && pointsRef.current.length > 2) {
      const finalPoints = mappingProcessor.closeLoop();
      
      try {
        // Add the wall to the current floor
        dispatch({
          type: 'ADD_WALL',
          payload: {
            floorId: currentProject.currentFloorId,
            points: finalPoints,
          },
        });
        
        // Save project with offline support
        await storage.saveProject({
          ...currentProject,
          lastModified: Date.now(),
          syncStatus: isOffline ? 'pending' : 'synced'
        });

        // Save mapping data
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
  };

  // Lock screen to portrait mode
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch (error) {
        console.warn('Failed to lock orientation:', error);
      }
    };
    
    lockOrientation();
    return () => {
      ScreenOrientation.unlockAsync().catch(console.warn);
    };
  }, []);

  // Check if a project is selected and handle initialization
  useEffect(() => {
    if (!currentProject) {
      // If no project, go back to home screen
      navigation.navigate('Home' as never);
      return;
    } 
    
    // If there are no floors, show the floor manager modal
    if (currentProject.floors.length === 0 && !isFloorManagerVisible) {
      setFloorManagerVisible(true);
    }
  }, [currentProject, navigation, isFloorManagerVisible]);

  // Calibrate the compass
  // Improved compass calibration
  const handleCalibrate = () => {
    // Check if magnetometer is available
    if (!sensorsAvailable.magnetometer) {
      Alert.alert(
        'Sensor Unavailable',
        'Compass (magnetometer) is not available on this device.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Set calibrating state to show the overlay
    setIsCalibrating(true);
    setCalibrationCountdown(3);
    
    // Store multiple readings for better accuracy
    const readings: number[] = [];
    
    // Create countdown interval
    const countdownInterval = setInterval(() => {
      setCalibrationCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Use the current magnetometer readings for calibration
    const collectReadings = () => {
      if (sensorData?.magnetometer) {
        // Calculate heading from magnetometer data
        const heading = Math.atan2(
          sensorData.magnetometer.y,
          sensorData.magnetometer.x
        ) * (180 / Math.PI);
        
        // Normalize heading to 0-360 range
        const normalizedHeading = (heading + 360) % 360;
        
        // Add to readings array
        readings.push(normalizedHeading);
        
        // Keep only the last 10 readings
        if (readings.length > 10) {
          readings.shift();
        }
      }
    };
    
    // Collect readings every 100ms
    const readingInterval = setInterval(collectReadings, 100);
    
    // Use the average of multiple readings for calibration after 3 seconds
    timerRef.current = setTimeout(() => {
      // Clean up
      clearInterval(countdownInterval);
      clearInterval(readingInterval);
      
      // Check if we have enough readings
      if (readings.length >= 5) {
        try {
          // Calculate average heading (excluding outliers)
          readings.sort((a, b) => a - b);
          // Remove potential outliers (first and last reading)
          const filteredReadings = readings.length > 2 ? readings.slice(1, -1) : readings;
          const sum = filteredReadings.reduce((acc, val) => acc + val, 0);
          const avgHeading = sum / filteredReadings.length;
          
          // Apply calibration to the mapping processor
          mappingProcessor.calibrate(avgHeading);
          
          // Hide the calibration overlay
          setIsCalibrating(false);
          
          // Show success message with the calibrated heading
          Alert.alert(
            'Calibration Complete', 
            `Compass has been calibrated to ${Math.round(avgHeading)}° from magnetic North.`,
            [{ text: 'OK' }]
          );
        } catch (error) {
          console.error('Calibration error:', error);
          setIsCalibrating(false);
          Alert.alert(
            'Calibration Error',
            'An error occurred during calibration. Please try again.',
            [{ text: 'OK' }]
          );
        }
      } else {
        // Hide the calibration overlay
        setIsCalibrating(false);
        
        // Show error message
        Alert.alert(
          'Calibration Failed',
          'Could not get reliable compass readings. Please try again in an open area away from electronic devices and metal objects.',
          [{ text: 'Try Again', onPress: handleCalibrate },
           { text: 'OK' }]
        );
      }
      
      // Reset the timer reference
      timerRef.current = null;
    }, 3000);
  };

  // Function to handle cancellation
  const cancelCalibration = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    setIsCalibrating(false);
  };

  // Make sure to clean up the timer in useEffect
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Open the map exporter
  const handleExport = () => {
    setMapExporterVisible(true);
  };

  // Movement feedback animation helper
  useEffect(() => {
    if (mappingState === 'mapping' && sensorReadings.isMoving) {
      // Fade in when movement detected
      Animated.timing(mappingFeedbackOpacity, {
        toValue: 0.8,
        duration: 300,
        useNativeDriver: true,
      }).start();
      
      // Fade out after 2 seconds
      const timer = setTimeout(() => {
        Animated.timing(mappingFeedbackOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start();
      }, 2000);
      
      return () => clearTimeout(timer);
    } else {
      // Ensure it's hidden when not mapping
      Animated.timing(mappingFeedbackOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [mappingState, sensorReadings.isMoving, mappingFeedbackOpacity]);

  // Add a feature to the current wall
  const handleAddFeature = (featureType: FeatureType) => {
    if (mappingState !== 'completed') {
      Alert.alert('Not Available', 'You can add features after completing the wall mapping.');
      return;
    }
    
    // Check if there's a current project, floor, and at least one wall
    if (!currentProject || !currentProject.currentFloorId) {
      Alert.alert('Error', 'No active project or floor selected.');
      return;
    }
    
    const floor = currentProject.floors.find(f => f.id === currentProject.currentFloorId);
    if (!floor || floor.walls.length === 0) {
      Alert.alert('Error', 'Please create a wall first.');
      return;
    }
    
    // Get current feature count
    const typeCount = state.featureCounts[featureType];
    const nextCount = typeCount + 1;
    
    // Create the label based on feature type
    const labelPrefix = featureType === 'window' ? 'W' : 
                       featureType === 'door' ? 'D' : 'SGD';
    
    // Show feature placement instructions with label
    Alert.alert(
      `Add ${labelPrefix}${nextCount}`,
      `Placing a new ${featureType === 'sliding-door' ? 'sliding door' : featureType} labeled as ${labelPrefix}${nextCount}`,
      [
        { 
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Place at Center',
          onPress: () => {
            // For simplicity, add feature at normalized position 0.5 (middle of the wall)
            // with a default width
            const defaultWidth = 1.0; // 1 meter
            addFeature(featureType, 0.5, defaultWidth);
          }
        }
      ]
    );
  };

  const [isOffline, setIsOffline] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<number>(Date.now());
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

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

  // Initialize sensors when component mounts
  useEffect(() => {
    initializeSensors();

    // Cleanup when component unmounts
    return () => {
      cleanupSubscriptions();
    };
  }, []); // Empty dependency array means this only runs on mount/unmount

  // Add a delay before initializing sensors after modal closes
  const handleFloorCreated = async () => {
    setFloorManagerVisible(false);
    // Give time for the modal animation to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    // Then initialize sensors
    const success = await initializeSensors();
    if (!success) {
      Alert.alert(
        'Sensor Error',
        'Failed to initialize sensors. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  if (isInitializing) {
    return (
      <SensorStatus
        isInitializing={isInitializing}
        sensorData={sensorData}
        retryAttempts={retryAttempts}
        error={error}
      />
    );
  }

  return (
    <ImageBackground 
      source={require('../../assets/splash.png')} 
      style={styles.backgroundImage}
      imageStyle={{ opacity: 0.08 }}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Mapping</Text>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.navigate('Home' as never)}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Map View */}
          <View style={styles.mapContainer}>
            <MapView 
              editable={mappingState === 'completed'}
              showMeasurements={true}
              currentPoints={mappingState === 'mapping' ? currentPoints : undefined}
            />
            
            {/* Sensor Status Overlay */}
            {mappingState === 'mapping' && (
              <>
                <View style={styles.sensorOverlay}>
                  <Text style={styles.sensorHeading}>
                    Heading: {Math.round(sensorReadings.heading)}°
                  </Text>
                  <Text style={styles.sensorReading}>
                    Steps: {sensorReadings.steps}
                  </Text>
                  <View style={styles.sensorStatusRow}>
                    <Text style={styles.sensorLabel}>Movement:</Text>
                    <View style={[
                      styles.sensorStatusIndicator, 
                      {backgroundColor: sensorReadings.isMoving ? '#4CAF50' : '#9E9E9E'}
                    ]} />
                  </View>
                </View>
                
                {/* Visual feedback when moving */}
                <View style={styles.mappingFeedback}>
                  {/* @ts-ignore */}
                  <View style={{opacity: mappingFeedbackOpacity, width: '100%', alignItems: 'center' as const}}>
                    <View style={styles.mappingFeedbackIcon}>
                      <Ionicons 
                        name="footsteps-outline" 
                        size={48} 
                        color="#FFFFFF" 
                      />
                    </View>
                    <Text style={styles.mappingFeedbackText}>
                      Move around the room's perimeter
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Offline Status Banner */}
          {isOffline && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={20} color="#FFA000" />
              <Text style={styles.offlineText}>
                Working offline - Changes will sync when connected
              </Text>
            </View>
          )}

          {/* Control Panel */}
          <View style={styles.controlPanel}>
            {/* Floor Selector */}
            <View style={styles.floorSelector}>
              <View style={styles.floorInfo}>
                <Text style={styles.sectionTitle}>Floor: {currentFloorName}</Text>
                <Text style={styles.floorDetails}>
                  {wallCount} {wallCount === 1 ? 'wall' : 'walls'}
                </Text>
              </View>
              <View style={styles.floorButtons}>
                <TouchableOpacity 
                  style={styles.iconButton}
                  onPress={() => setFloorManagerVisible(true)}
                >
                  <Ionicons name="layers-outline" size={24} color="#2196F3" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.iconButton}
                  onPress={() => setWallEditorVisible(true)}
                  disabled={!currentFloor || currentFloor.walls.length === 0}
                >
                  <Ionicons 
                    name="construct-outline" 
                    size={24} 
                    color={!currentFloor || currentFloor.walls.length === 0 ? '#ccc' : '#2196F3'} 
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sensor Error Warning */}
            {sensorError && (
              <View style={styles.errorBanner}>
                <Ionicons name="warning-outline" size={20} color="#FFA000" />
                <Text style={styles.errorText}>
                  Sensor issue: {sensorError}
                </Text>
              </View>
            )}

            {/* Mapping Controls */}
            <View style={styles.mappingControls}>
              {mappingState === 'idle' && (
                <Button
                  title="Start Mapping"
                  onPress={handleStartMapping}
                  type="primary"
                  size="large"
                  icon={
                    <Ionicons
                      name="map-outline"
                      size={20} 
                      color="white"
                      style={{ marginRight: 8 }}
                    />
                  }
                />
              )}

              {mappingState === 'mapping' && (
                <View style={styles.buttonRow}>
                  <Button
                    title="Pause"
                    onPress={handlePauseMapping}
                    type="secondary"
                  />
                  <Button
                    title="Stop"
                    onPress={handleStopMapping}
                    type="danger"
                  />
                </View>
              )}

              {mappingState === 'paused' && (
                <View style={styles.buttonRow}>
                  <Button
                    title="Resume"
                    onPress={handleResumeMapping}
                    type="primary"
                  />
                  <Button
                    title="Stop"
                    onPress={handleStopMapping}
                    type="danger"
                  />
                </View>
              )}
            </View>

            {/* Feature Buttons */}
            <FeatureButtons
              onAddFeature={handleAddFeature}
              disabled={mappingState !== 'completed'}
            />

            {/* Additional Controls */}
            <View style={styles.additionalControls}>
              <Button
                title="Calibrate Compass"
                onPress={handleCalibrate}
                type="secondary"
                disabled={isCalibrating || mappingState === 'mapping' || !sensorsAvailable.magnetometer}
              />
              <Button
                title="Export Map"
                onPress={handleExport}
                type="primary"
                disabled={!currentProject || !currentProject.currentFloorId || !currentFloor?.walls.length}
              />
            </View>
          </View>
        </View>

        {/* Floor Manager Modal */}
        <FloorManager 
          visible={isFloorManagerVisible} 
          onClose={handleFloorCreated} 
        />
        
        {/* Wall & Feature Editor Modal */}
        <WallEditor 
          visible={isWallEditorVisible} 
          onClose={() => setWallEditorVisible(false)} 
        />
        
        {/* Map Exporter Modal */}
        <MapExporter
          visible={isMapExporterVisible}
          onClose={() => setMapExporterVisible(false)}
        />
        
        {/* Sensor Initialization Overlay */}
        {isInitializing && (
          <View style={styles.sensorInitOverlay}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.sensorInitText}>Initializing Sensors...</Text>
            <View style={styles.sensorInitContainer}>
              <View style={styles.sensorInitRow}>
                <Text style={styles.sensorInitLabel}>Accelerometer:</Text>
                <View style={[
                  styles.sensorInitIndicator, 
                  {backgroundColor: sensorInitStatus.accelerometer ? '#4CAF50' : '#9E9E9E'}
                ]} />
              </View>
              
              <View style={styles.sensorInitRow}>
                <Text style={styles.sensorInitLabel}>Compass:</Text>
                <View style={[
                  styles.sensorInitIndicator, 
                  {backgroundColor: sensorInitStatus.magnetometer ? '#4CAF50' : '#9E9E9E'}
                ]} />
              </View>
              
              <View style={styles.sensorInitRow}>
                <Text style={styles.sensorInitLabel}>Step Detection:</Text>
                <View style={[
                  styles.sensorInitIndicator, 
                  {backgroundColor: sensorInitStatus.pedometer ? '#4CAF50' : '#9E9E9E'}
                ]} />
              </View>
            </View>
          </View>
        )}

        {/* Compass Calibration Overlay */}
        {isCalibrating && (
          <View style={styles.calibrationOverlay}>
            <View style={styles.calibrationContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
              <Text style={styles.calibrationText}>
                Calibrating Compass... ({calibrationCountdown})
              </Text>
              <Text style={styles.calibrationInstructions}>
                Point your device to North and hold steady.{'\n\n'}
                For best results:{'\n'}
                • Move away from electronic devices{'\n'}
                • Stay away from metal objects{'\n'}
                • Hold your phone flat and level
              </Text>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={cancelCalibration}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(33, 150, 243, 0.9)',
    borderBottomLeftRadius: Platform.select({ ios: 20, android: 0 }),
    borderBottomRightRadius: Platform.select({ ios: 20, android: 0 }),
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  mapContainer: {
    flex: 1,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  controlPanel: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  floorSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floorInfo: {
    flex: 1,
  },
  floorDetails: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  floorButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    marginLeft: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  mappingControls: {
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: 12,
  },
  additionalControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  sensorOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.5)',
  },
  sensorHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#2196F3',
  },
  sensorReading: {
    fontSize: 14,
    marginBottom: 4,
  },
  sensorStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sensorLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  sensorStatusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  mappingFeedback: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -125 }, { translateY: -70 }],
    width: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mappingFeedbackIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(33, 150, 243, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  mappingFeedbackText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
    marginBottom: 8,
  },
  errorText: {
    color: '#333',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },

  // Sensor initialization styles
  sensorInitOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  sensorInitText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 24,
  },
  sensorInitContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 16,
    borderRadius: 12,
    width: '80%',
    maxWidth: 300,
  },
  sensorInitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sensorInitLabel: {
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  sensorInitIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  
  // Calibration styles
  calibrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  calibrationContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    width: '80%',
    maxWidth: 300,
  },
  calibrationText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    color: '#2196F3',
  },
  calibrationInstructions: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    color: '#555',
  },
  cancelButton: {
    marginTop: 16,
    padding: 8,
    backgroundColor: '#f44336',
    borderRadius: 4,
    width: '80%',
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statusText: {
    marginTop: 10,
    color: colors.text,
    fontSize: 16,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
    marginBottom: 8,
  },
  offlineText: {
    color: '#333',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
});
