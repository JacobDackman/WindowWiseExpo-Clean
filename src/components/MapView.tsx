import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Dimensions,
  Text,
  PanResponderInstance,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Point, Feature, Wall } from '../types';

interface MapViewProps {
  editable?: boolean;
  showMeasurements?: boolean;
  currentPoints?: Point[];
}

export const MapView: React.FC<MapViewProps> = ({
  editable = false,
  showMeasurements = false,
  currentPoints,
}) => {
  const { state } = useApp();
  const { currentProject } = state;
  
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  // Reference to the SVG viewport for transformations
  const viewportRef = useRef({ scale, offset });
  
  // Update the ref when scale or offset changes
  useEffect(() => {
    viewportRef.current = { scale, offset };
  }, [scale, offset]);
  
  // Create pan responder for pan and zoom gestures
  const panResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderGrant: (_e, _gestureState) => {
        // Save the initial touch position for drag calculations
      },
      
      onPanResponderMove: (_e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        // Handle panning
        setOffset(prev => ({
          x: prev.x + gestureState.dx / viewportRef.current.scale,
          y: prev.y + gestureState.dy / viewportRef.current.scale,
        }));
      },
      
      onPanResponderRelease: () => {
        // Finalize the pan operation
      },
    })
  ).current;
  
  // Get the current floor
  const currentFloor = currentProject?.floors.find(
    f => f.id === currentProject.currentFloorId
  );
  
  // Auto-fit the map to the container
  useEffect(() => {
    if (!currentFloor || containerSize.width === 0 || containerSize.height === 0) {
      return;
    }
    
    // Calculate the bounding box for all walls
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    let hasPoints = false;
    
    // Include all wall points in bounding box
    currentFloor.walls.forEach(wall => {
      wall.points.forEach(point => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
        hasPoints = true;
      });
    });
    
    // Also include current tracking points if available
    if (currentPoints && currentPoints.length > 0) {
      currentPoints.forEach(point => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
        hasPoints = true;
      });
    }
    
    // If no points, use default values
    if (!hasPoints) {
      minX = -5;
      minY = -5;
      maxX = 5;
      maxY = 5;
    }
    
    // Add padding
    const padding = 1; // 1 meter padding
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Calculate width and height of the content
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Calculate scale to fit
    const scaleX = containerSize.width / contentWidth;
    const scaleY = containerSize.height / contentHeight;
    const newScale = Math.min(scaleX, scaleY) * 0.9; // 90% to add some margin
    
    // Calculate offset to center the content
    const newOffsetX = (containerSize.width / newScale - contentWidth) / 2 - minX;
    const newOffsetY = (containerSize.height / newScale - contentHeight) / 2 - minY;
    
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [currentFloor, containerSize, currentPoints]);
  
  // Function to transform points from model coordinates to view coordinates
  const transformPoint = (point: Point): Point => {
    return {
      x: (point.x + offset.x) * scale,
      y: (point.y + offset.y) * scale,
    };
  };
  
  // Function to calculate distances and dimensions
  const calculateWallLength = (wall: Wall): number => {
    let totalLength = 0;
    
    for (let i = 1; i < wall.points.length; i++) {
      const dx = wall.points[i].x - wall.points[i - 1].x;
      const dy = wall.points[i].y - wall.points[i - 1].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }
    
    return totalLength;
  };
  
  // Render a wall path
  const renderWall = (wall: Wall, index: number) => {
    if (wall.points.length < 2) return null;
    
    // Convert points to path format
    const pathPoints = wall.points.map(transformPoint);
    const pathData = pathPoints.reduce((path, point, i) => (
      i === 0 
        ? `M ${point.x} ${point.y}` 
        : `${path} L ${point.x} ${point.y}`
    ), '');
    
    return (
      <View key={`wall-${index}`} style={styles.wallContainer}>
        {/* Wall path */}
        <View
          style={[
            styles.wallPath,
            { borderWidth: 2 * (1 / scale), borderColor: '#2196F3' }
          ]}
        />
        
        {/* Length measurement */}
        {showMeasurements && (
          <Text style={styles.measurement}>
            {calculateWallLength(wall).toFixed(1)}m
          </Text>
        )}
        
        {/* Features */}
        {wall.features.map((feature, featureIndex) => (
          <View
            key={`feature-${featureIndex}`}
            style={[
              styles.feature,
              feature.type === 'window' ? styles.window :
              feature.type === 'door' ? styles.door :
              styles.slidingDoor,
              {
                // Position the feature along the wall
                // This is a simplified positioning - in a real app, we would 
                // calculate the exact position along the polyline
                left: '50%', 
                top: '50%',
              }
            ]}
          >
            <Text style={styles.featureLabel}>{feature.label}</Text>
          </View>
        ))}
      </View>
    );
  };
  
  // Render the current mapping line
  const renderCurrentLine = () => {
    if (!currentPoints || currentPoints.length < 2) return null;
    
    // Convert points to path format
    const pathPoints = currentPoints.map(transformPoint);
    const pathData = pathPoints.reduce((path, point, i) => (
      i === 0 
        ? `M ${point.x} ${point.y}` 
        : `${path} L ${point.x} ${point.y}`
    ), '');
    
    return (
      <View 
        style={[
          styles.currentLine,
          { borderWidth: 2 * (1 / scale), borderColor: '#4CAF50' }
        ]} 
      />
    );
  };
  
  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setContainerSize({ width, height });
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.mapContainer}>
        {/* Render walls */}
        {currentFloor?.walls.map((wall, index) => renderWall(wall, index))}
        
        {/* Render current mapping line */}
        {renderCurrentLine()}
        
        {/* Grid and reference lines could be added here */}
        
        {/* Debug info */}
        {__DEV__ && (
          <View style={styles.debugInfo}>
            <Text style={styles.debugText}>
              Scale: {scale.toFixed(2)}, Offset: ({offset.x.toFixed(1)}, {offset.y.toFixed(1)})
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  wallContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  wallPath: {
    position: 'absolute',
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  currentLine: {
    position: 'absolute',
    borderColor: '#4CAF50',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  feature: {
    position: 'absolute',
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  window: {
    backgroundColor: 'rgba(33, 150, 243, 0.2)',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  door: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  slidingDoor: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  featureLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
  },
  measurement: {
    position: 'absolute',
    fontSize: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    padding: 2,
    borderRadius: 4,
  },
  debugInfo: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 5,
    borderRadius: 5,
  },
  debugText: {
    color: 'white',
    fontSize: 10,
  },
});
