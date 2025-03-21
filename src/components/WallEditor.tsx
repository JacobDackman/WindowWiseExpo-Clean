import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { Button } from './Button';
import { Wall, Feature } from '../types';

interface WallEditorProps {
  visible: boolean;
  onClose: () => void;
}

export const WallEditor: React.FC<WallEditorProps> = ({
  visible,
  onClose,
}) => {
  const { state, dispatch } = useApp();
  const { currentProject } = state;
  
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  
  // Get current floor
  const currentFloor = currentProject?.floors.find(
    f => f.id === currentProject.currentFloorId
  );
  
  // Get selected wall
  const selectedWall = currentFloor?.walls.find(w => w.id === selectedWallId);
  
  // Handle wall selection
  const handleSelectWall = (wallId: string) => {
    setSelectedWallId(wallId);
  };
  
  // Handle wall deletion
  const handleDeleteWall = (wallId: string) => {
    if (!currentFloor) return;
    
    Alert.alert(
      'Delete Wall',
      'Are you sure you want to delete this wall and all its features?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            dispatch({
              type: 'DELETE_WALL',
              payload: {
                floorId: currentFloor.id,
                wallId,
              },
            });
            
            // Deselect the wall
            if (selectedWallId === wallId) {
              setSelectedWallId(null);
            }
          }
        }
      ]
    );
  };
  
  // Handle feature deletion
  const handleDeleteFeature = (featureId: string) => {
    if (!currentFloor || !selectedWallId) return;
    
    dispatch({
      type: 'DELETE_FEATURE',
      payload: {
        floorId: currentFloor.id,
        wallId: selectedWallId,
        featureId,
      },
    });
  };
  
  // Render a wall item in the list
  const renderWallItem = ({ item, index }: { item: Wall; index: number }) => {
    const isSelected = item.id === selectedWallId;
    
    return (
      <TouchableOpacity
        style={[
          styles.wallItem,
          isSelected && styles.selectedWallItem,
        ]}
        onPress={() => handleSelectWall(item.id)}
      >
        <View style={styles.wallItemContent}>
          <Text 
            style={[
              styles.wallName,
              isSelected && styles.selectedWallName,
            ]}
          >
            Wall {index + 1}
          </Text>
          
          <Text style={styles.wallStats}>
            {item.points.length} points, {item.features.length} feature{item.features.length !== 1 ? 's' : ''}
          </Text>
        </View>
        
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteWall(item.id)}
        >
          <Ionicons name="trash-outline" size={20} color="#f44336" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };
  
  // Render a feature item in the list
  const renderFeatureItem = ({ item }: { item: Feature }) => {
    // Determine feature type icon
    const iconName = 
      item.type === 'window' ? 'square-outline' :
      item.type === 'door' ? 'exit-outline' : 
      'reorder-two-outline';
    
    // Determine feature type label
    const typeLabel = 
      item.type === 'window' ? 'Window' :
      item.type === 'door' ? 'Door' : 
      'Sliding Door';
    
    return (
      <View style={styles.featureItem}>
        <View style={styles.featureInfo}>
          <View style={styles.featureIconContainer}>
            <Ionicons name={iconName} size={20} color="#2196F3" />
          </View>
          
          <View style={styles.featureDetails}>
            <Text style={styles.featureLabel}>{item.label}</Text>
            <Text style={styles.featureType}>{typeLabel}</Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={styles.deleteFeatureButton}
          onPress={() => handleDeleteFeature(item.id)}
        >
          <Ionicons name="close-circle-outline" size={20} color="#f44336" />
        </TouchableOpacity>
      </View>
    );
  };
  
  // Render empty list message
  const renderEmptyWalls = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="construct-outline" size={48} color="#CCCCCC" />
      <Text style={styles.emptyText}>No walls created</Text>
      <Text style={styles.emptySubtext}>
        Complete a mapping session to create walls
      </Text>
    </View>
  );
  
  // Render empty features message
  const renderEmptyFeatures = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="create-outline" size={36} color="#CCCCCC" />
      <Text style={styles.emptyText}>No features</Text>
      <Text style={styles.emptySubtext}>
        Add windows, doors, or sliding doors to this wall
      </Text>
    </View>
  );
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Wall & Feature Editor</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          {/* Current floor name */}
          <Text style={styles.floorName}>
            Floor: {currentFloor?.name || 'None selected'}
          </Text>
          
          {/* Wall list */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Walls</Text>
            <FlatList
              data={currentFloor?.walls || []}
              renderItem={renderWallItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={renderEmptyWalls}
              style={styles.wallList}
              contentContainerStyle={styles.listContent}
              horizontal={false}
            />
          </View>
          
          {/* Feature list for selected wall */}
          {selectedWallId && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Features for Selected Wall</Text>
              <FlatList
                data={selectedWall?.features || []}
                renderItem={renderFeatureItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={renderEmptyFeatures}
                style={styles.featureList}
                contentContainerStyle={styles.listContent}
              />
            </View>
          )}
          
          <Button
            title="Close"
            onPress={onClose}
            type="primary"
            style={styles.closeEditorButton}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '90%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  floorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  wallList: {
    maxHeight: 200,
  },
  featureList: {
    maxHeight: 150,
  },
  listContent: {
    flexGrow: 1,
  },
  wallItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedWallItem: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  wallItemContent: {
    flex: 1,
  },
  wallName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  selectedWallName: {
    color: '#2196F3',
  },
  wallStats: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    padding: 6,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  featureInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  featureIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureDetails: {
    flex: 1,
  },
  featureLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  featureType: {
    fontSize: 13,
    color: '#666',
  },
  deleteFeatureButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  closeEditorButton: {
    marginTop: 8,
  },
});
