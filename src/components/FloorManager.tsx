import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { Button } from './Button';
import { Floor } from '../types';

interface FloorManagerProps {
  visible: boolean;
  onClose: () => void;
}

export const FloorManager: React.FC<FloorManagerProps> = ({
  visible,
  onClose,
}) => {
  const { state, dispatch } = useApp();
  const { currentProject } = state;
  
  const [newFloorName, setNewFloorName] = useState('');
  const [isAddingFloor, setIsAddingFloor] = useState(false);
  
  // Handle creating a new floor
  const handleCreateFloor = () => {
    if (!newFloorName.trim()) {
      Alert.alert('Error', 'Please enter a floor name');
      return;
    }
    
    dispatch({
      type: 'ADD_FLOOR',
      payload: { name: newFloorName.trim() },
    });
    
    setNewFloorName('');
    setIsAddingFloor(false);
  };
  
  // Handle selecting a floor
  const handleSelectFloor = (floorId: string) => {
    dispatch({
      type: 'SELECT_FLOOR',
      payload: { id: floorId },
    });
  };
  
  // Handle deleting a floor
  const handleDeleteFloor = (floor: Floor) => {
    Alert.alert(
      'Delete Floor',
      `Are you sure you want to delete "${floor.name}"? This will also delete all walls and features on this floor.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            dispatch({
              type: 'DELETE_FLOOR',
              payload: { id: floor.id },
            });
          },
        },
      ]
    );
  };
  
  // Render a floor item
  const renderFloorItem = ({ item }: { item: Floor }) => {
    const isSelected = currentProject?.currentFloorId === item.id;
    
    return (
      <TouchableOpacity
        style={[
          styles.floorItem,
          isSelected && styles.selectedFloorItem,
        ]}
        onPress={() => handleSelectFloor(item.id)}
      >
        <View style={styles.floorItemContent}>
          <Text 
            style={[
              styles.floorName,
              isSelected && styles.selectedFloorName,
            ]}
          >
            {item.name}
          </Text>
          
          <Text style={styles.floorStats}>
            {item.walls.length} wall{item.walls.length !== 1 ? 's' : ''}
          </Text>
        </View>
        
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteFloor(item)}
        >
          <Ionicons name="trash-outline" size={20} color="#f44336" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };
  
  // Render the empty list message
  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="layers-outline" size={48} color="#CCCCCC" />
      <Text style={styles.emptyText}>No floors yet</Text>
      <Text style={styles.emptySubtext}>
        Create your first floor to start mapping
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
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Floor Manager</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            {/* Project name */}
            <Text style={styles.projectName}>
              Project: {currentProject?.name}
            </Text>
            
            {/* Floor list */}
            <FlatList
              data={currentProject?.floors || []}
              renderItem={renderFloorItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={renderEmptyList}
              style={styles.floorList}
              contentContainerStyle={styles.floorListContent}
            />
            
            {/* Add floor form */}
            {isAddingFloor ? (
              <View style={styles.addFloorForm}>
                <TextInput
                  style={styles.input}
                  value={newFloorName}
                  onChangeText={setNewFloorName}
                  placeholder="Floor name (e.g., Ground Floor)"
                  autoFocus
                />
                
                <View style={styles.formButtons}>
                  <Button
                    title="Cancel"
                    onPress={() => {
                      setIsAddingFloor(false);
                      setNewFloorName('');
                    }}
                    type="secondary"
                  />
                  
                  <Button
                    title="Create"
                    onPress={handleCreateFloor}
                    disabled={!newFloorName.trim()}
                  />
                </View>
              </View>
            ) : (
              <Button
                title="Add New Floor"
                onPress={() => setIsAddingFloor(true)}
                type="primary"
                icon={
                  <Ionicons
                    name="add-circle-outline"
                    size={18}
                    color="white"
                    style={{ marginRight: 6 }}
                  />
                }
              />
            )}
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
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
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 20,
  },
  floorList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  floorListContent: {
    flexGrow: 1,
  },
  floorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedFloorItem: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  floorItemContent: {
    flex: 1,
  },
  floorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  selectedFloorName: {
    color: '#2196F3',
  },
  floorStats: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    padding: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  addFloorForm: {
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
