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
    isInitializing: sensorInitializing
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
  const initializationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // Refs for network status and auto-save
  const [isOffline, setIsOffline] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<number>(Date.now());
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      // Clear any existing initialization timeout
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }

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

      // Set a timeout to exit initialization if it gets stuck
      initializationTimeoutRef.current = setTimeout(() => {
        if (isInitializing) {
          setIsInitializing(false);
          setError('Sensor initialization timed out. Please try again.');
          Alert.alert(
            'Sensor Timeout',
            'Unable to initialize sensors in a reasonable time. Please check your device settings and try again.',
            [{ text: 'OK' }]
          );
        }
      }, 15000); // 15 seconds failsafe

      // Then try to initialize sensors
      const success = await startSensors();
      
      // Clear the timeout since initialization completed (success or failure)
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }
      
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
      // Clear the timeout in case of error
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }
      
      console.error('Sensor initialization error:', error);
      Alert.alert(
        'Sensor Error',
        error instanceof Error ? error.message : 'Failed to initialize sensors',
        [{ text: 'OK', onPress: () => navigation.navigate('Home' as never) }]
      );
      setIsInitializing(false);
      return false;
    }
  }, [startSensors, navigation, isInitializing]);

  // Setup initial sensor check when component mounts, but don't auto-initialize
  useEffect(() => {
    let mounted = true;
    
    // Set a timeout to exit initialization state if it gets stuck
    const failsafeTimeout = setTimeout(() => {
      if (isInitializing && mounted) {
        setIsInitializing(false);
        setError('Sensor initialization timed out. Please try again.');
        Alert.alert(
          'Sensor Timeout',
          'Unable to initialize sensors. Please check your device settings and try again.',
          [{ text: 'OK' }]
        );
      }
    }, 20000); // 20 second failsafe (longer than the usual timeout)
    
    // We'll check if sensors are available, but wait for user action to fully initialize
    const checkSensors = async () => {
      try {
        // Don't automatically call initializeSensors() here to avoid double initialization
        // Just update UI to reflect sensor availability
        const [accelAvailable, magAvailable] = await Promise.all([
          Accelerometer.isAvailableAsync(),
          Magnetometer.isAvailableAsync(),
        ]);
        
        if (mounted) {
          setSensorInitStatus(prev => ({
            ...prev,
            accelerometer: accelAvailable,
            magnetometer: magAvailable,
          }));
          
          // Update error state if sensors aren't available
          if (!accelAvailable || !magAvailable) {
            const missingSensors = [];
            if (!accelAvailable) missingSensors.push('accelerometer');
            if (!magAvailable) missingSensors.push('magnetometer');
            setError(`Missing sensors: ${missingSensors.join(', ')}`);
          }
        }
      } catch (error) {
        console.error('[MappingScreen] Sensor check error:', error);
      }
    };
    
    checkSensors();
    
    return () => {
      mounted = false;
      cleanupSubscriptions();
      clearTimeout(failsafeTimeout);
      
      // Also clear the initialization timeout
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }
    };
  }, []);

  // Check network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

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

  // Start mapping with sensor checks and proper initialization
  const handleStartMapping = () => {
    if (!currentProject || !currentProject.currentFloorId) {
      Alert.alert('Error', 'Please create a floor first');
      return;
    }
    
    if (sensorsAvailable.magnetometer === false) {
      Alert.alert(
        'Sensor Unavailable',
        'Compass (magnetometer) sensor is required for mapping. This device may not support accurate mapping.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    if (sensorsAvailable.pedometer === false) {
      Alert.alert(
        'Sensor Unavailable',
        'Step detection is required for mapping. This device may not support accurate mapping.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Reset the mapping processor
    mappingProcessor.reset();
    pointsRef.current = [];
    setCurrentPoints([]);
    
    // Only initialize sensors if they're not already initialized
    if (!sensorTracking) {
      // Show a loading indicator while initializing
      setIsInitializing(true);
      
      // Initialize sensors first, then start mapping
      initializeSensors().then((success) => {
        if (success) {
          startMapping();
        } else {
          // If sensor initialization failed, exit initialization state
          setIsInitializing(false);
        }
      }).catch((error) => {
        console.error('Failed to initialize sensors:', error);
        setIsInitializing(false);
        Alert.alert('Error', 'Failed to initialize sensors. Please try again.');
      });
    } else {
      // Sensors already initialized, just start mapping
      startMapping();
    }
  };

  // Pause and resume mapping
  const handlePauseMapping = () => pauseMapping();
  const handleResumeMapping = () => startMapping();

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

  // Calibrate the compass
  const handleCalibrate = () => {
    if (!sensorsAvailable.magnetometer) {
      Alert.alert('Sensor Unavailable', 'Compass is not available');
      return;
    }
    
    setIsCalibrating(true);
    setCalibrationCountdown(3);
    
    // Store readings for calibration
    const readings: number[] = [];
    
    // Create countdown and collect readings
    const countdownInterval = setInterval(() => {
      setCalibrationCountdown(prev => prev > 1 ? prev - 1 : 0);
    }, 1000);
    
    const collectReadings = () => {
      if (sensorData?.magnetometer) {
        const heading = Math.atan2(
          sensorData.magnetometer.y,
          sensorData.magnetometer.x
        ) * (180 / Math.PI);
        
        readings.push((heading + 360) % 360);
        
        if (readings.length > 10) readings.shift();
      }
    };
    
    const readingInterval = setInterval(collectReadings, 100);
    
    timerRef.current = setTimeout(() => {
      clearInterval(countdownInterval);
      clearInterval(readingInterval);
      
      if (readings.length >= 5) {
        try {
          // Calculate average heading
          readings.sort((a, b) => a - b);
          const filteredReadings = readings.length > 2 ? readings.slice(1, -1) : readings;
          const avg = filteredReadings.reduce((sum, val) => sum + val, 0) / filteredReadings.length;
          
          mappingProcessor.calibrate(avg);
          setIsCalibrating(false);
          
          Alert.alert('Calibration Complete', `Compass calibrated to ${Math.round(avg)}° from magnetic North`);
        } catch (error) {
          console.error('Calibration error:', error);
          setIsCalibrating(false);
          Alert.alert('Calibration Error', 'Please try again.');
        }
      } else {
        setIsCalibrating(false);
        Alert.alert('Calibration Failed', 'Could not get reliable compass readings.');
      }
      
      timerRef.current = null;
    }, 3000);
  };

  // Function to handle cancellation of calibration
  const cancelCalibration = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    setIsCalibrating(false);
  };

  // Handle floor creation
  const handleFloorCreated = async () => {
    setFloorManagerVisible(false);
    await new Promise(resolve => setTimeout(resolve, 500));
    const success = await initializeSensors();
    if (!success) {
      Alert.alert('Sensor Error', 'Failed to initialize sensors');
    }
  };

  // Handle map export
  const handleExport = () => setMapExporterVisible(true);

  // Add feature
  const handleAddFeature = (featureType: FeatureType) => {
    if (mappingState !== 'completed') {
      Alert.alert('Not Available', 'Complete wall mapping first');
      return;
    }
    
    if (!currentProject?.currentFloorId) {
      Alert.alert('Error', 'No active project or floor');
      return;
    }
    
    const floor = currentProject.floors.find(f => f.id === currentProject.currentFloorId);
    if (!floor?.walls.length) {
      Alert.alert('Error', 'Create a wall first');
      return;
    }
    
    const typeCount = state.featureCounts[featureType];
    const nextCount = typeCount + 1;
    const labelPrefix = featureType === 'window' ? 'W' : featureType === 'door' ? 'D' : 'SGD';
    
    Alert.alert(
      `Add ${labelPrefix}${nextCount}`,
      `New ${featureType === 'sliding-door' ? 'sliding door' : featureType}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Place at Center', onPress: () => addFeature(featureType, 0.5, 1.0) }
      ]
    );
  };

  // Use SensorStatus when initializing
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

  // Main render
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
          {/* Map Container */}
          <View style={styles.mapContainer}>
            <MapView 
              editable={mappingState === 'completed'}
              showMeasurements={true}
              currentPoints={mappingState === 'mapping' ? currentPoints : undefined}
            />
          </View>

          {/* Control Panel */}
          <View style={styles.controlPanel}>
            <View style={styles.floorSelector}>
              <View style={styles.floorInfo}>
                <Text style={styles.sectionTitle}>Floor: {currentFloorName}</Text>
                <Text style={styles.floorDetails}>{wallCount} {wallCount === 1 ? 'wall' : 'walls'}</Text>
              </View>
            </View>

            {/* Mapping Controls */}
            <View style={styles.mappingControls}>
              {mappingState === 'idle' && (
                <Button
                  title="Start Mapping"
                  onPress={handleStartMapping}
                  type="primary"
                  size="large"
                  icon={<Ionicons name="map-outline" size={20} color="white" />}
                />
              )}

              {mappingState === 'mapping' && (
                <View style={styles.buttonRow}>
                  <Button title="Pause" onPress={handlePauseMapping} type="secondary" />
                  <Button title="Stop" onPress={handleStopMapping} type="danger" />
                </View>
              )}

              {mappingState === 'paused' && (
                <View style={styles.buttonRow}>
                  <Button title="Resume" onPress={handleResumeMapping} type="primary" />
                  <Button title="Stop" onPress={handleStopMapping} type="danger" />
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
                disabled={isCalibrating || !sensorsAvailable.magnetometer}
              />
              <Button
                title="Export Map"
                onPress={handleExport}
                type="primary"
                disabled={!currentFloor?.walls.length}
              />
            </View>
          </View>
        </View>

        {/* Modals */}
        <FloorManager 
          visible={isFloorManagerVisible} 
          onClose={handleFloorCreated} 
        />
        
        <WallEditor 
          visible={isWallEditorVisible} 
          onClose={() => setWallEditorVisible(false)} 
        />
        
        <MapExporter
          visible={isMapExporterVisible}
          onClose={() => setMapExporterVisible(false)}
        />
      </SafeAreaView>
    </ImageBackground>
  );
};

// Styles
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
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  controlPanel: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
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
});
