import React, { useState, useEffect, useRef } from 'react';
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

export const MappingScreen: React.FC = () => {
  const navigation = useNavigation();
  const { state, dispatch, startMapping, pauseMapping, stopMapping, addFeature, saveProject } = useApp();
  const { currentProject, mappingState, settings } = state;
  const { isTracking, sensorData, sensorsAvailable, error: sensorError } = useSensors();
  
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
  
  const pointsRef = useRef<Point[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get current floor info
  const currentFloor = currentProject?.floors.find(
    f => f.id === currentProject?.currentFloorId
  );
  const currentFloorName = currentFloor?.name || 'No Floor';
  const wallCount = currentFloor?.walls.length || 0;
  
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

  // Process sensor data when tracking
  useEffect(() => {
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
  }, [mappingState, sensorData]);

  // Check if a project is selected
  useEffect(() => {
    if (!currentProject) {
      navigation.navigate('Home' as never);
    } else if (currentProject.floors.length === 0) {
      // If there are no floors, open the floor manager modal
      setFloorManagerVisible(true);
    }
  }, [currentProject, navigation]);

  // Start mapping
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
    
    mappingProcessor.reset();
    pointsRef.current = [];
    setCurrentPoints([]);
    startMapping();
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
  const handleStopMapping = () => {
    stopMapping();
    
    if (currentProject && currentProject.currentFloorId && pointsRef.current.length > 2) {
      // Get simplified and closed points
      const finalPoints = mappingProcessor.closeLoop();
      
      // Add the wall to the current floor
      dispatch({
        type: 'ADD_WALL',
        payload: {
          floorId: currentProject.currentFloorId,
          points: finalPoints,
        },
      });
      
      // Save the project
      saveProject();
      
      // Show success message
      Alert.alert(
        'Wall Mapped',
        'The wall has been added to the current floor.',
        [{ text: 'OK' }]
      );
    } else if (pointsRef.current.length <= 2) {
      Alert.alert(
        'Not Enough Points',
        'Please walk around the room to create at least 3 points for a wall.',
        [{ text: 'OK' }]
      );
    }
  };

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

  // Calibrate the compass
  const handleCalibrate = () => {
    if (!sensorsAvailable.magnetometer) {
      Alert.alert(
        'Sensor Unavailable',
        'Compass (magnetometer) is not available on this device.'
      );
      return;
    }
    
    setIsCalibrating(true);
    
    Alert.alert(
      'Compass Calibration',
      'Point your phone to North and hold it steady for 3 seconds.',
      [{ text: 'Cancel', onPress: () => setIsCalibrating(false) }]
    );
    
    // Use the current magnetometer reading for calibration
    if (sensorData.magnetometer) {
      timerRef.current = setTimeout(() => {
        const heading = Math.atan2(
          sensorData.magnetometer!.y,
          sensorData.magnetometer!.x
        ) * (180 / Math.PI);
        
        mappingProcessor.calibrate(heading);
        setIsCalibrating(false);
        
        Alert.alert('Calibration Complete', 'Compass has been calibrated.');
      }, 3000);
    }
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  };

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
          onClose={() => setFloorManagerVisible(false)} 
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
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
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
});
