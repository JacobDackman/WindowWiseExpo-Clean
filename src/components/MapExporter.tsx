import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useApp } from '../contexts/AppContext';
import { Button } from './Button';

interface MapExporterProps {
  visible: boolean;
  onClose: () => void;
}

export const MapExporter: React.FC<MapExporterProps> = ({
  visible,
  onClose,
}) => {
  const { state, exportMap } = useApp();
  const { currentProject } = state;
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportedUri, setExportedUri] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'image' | 'pdf'>('image');
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  
  // Get current floor
  const currentFloor = currentProject?.floors.find(
    f => f.id === currentProject.currentFloorId
  );
  
  // Handle export button press
  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setIsPermissionDenied(true);
        setIsExporting(false);
        return;
      }
      
      // Export the map
      const uri = await exportMap();
      
      // Save to media library
      await MediaLibrary.saveToLibraryAsync(uri);
      
      // Update state
      setExportedUri(uri);
      setIsExporting(false);
      
      // Show success alert
      Alert.alert(
        'Export Successful',
        'The map has been saved to your device.'
      );
    } catch (error) {
      console.error('Error exporting map:', error);
      setIsExporting(false);
      
      // Show error alert
      Alert.alert(
        'Export Failed',
        'An error occurred while exporting the map. Please try again.'
      );
    }
  };
  
  // Handle share button press
  const handleShare = async () => {
    if (!exportedUri) return;
    
    try {
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(exportedUri);
      } else {
        Alert.alert(
          'Sharing Unavailable',
          'Sharing is not available on this device.'
        );
      }
    } catch (error) {
      console.error('Error sharing map:', error);
      
      Alert.alert(
        'Sharing Failed',
        'An error occurred while sharing the map. Please try again.'
      );
    }
  };
  
  // Handle format selection
  const toggleFormat = () => {
    setExportFormat(prev => prev === 'image' ? 'pdf' : 'image');
    setExportedUri(null); // Clear previous export when changing format
  };
  
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
            <Text style={styles.title}>Export Map</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          {/* Current project and floor info */}
          <ScrollView style={styles.infoContainer}>
            <Text style={styles.projectName}>
              Project: {currentProject?.name || 'None selected'}
            </Text>
            
            <Text style={styles.floorName}>
              Floor: {currentFloor?.name || 'None selected'}
            </Text>
            
            {!currentProject || !currentFloor ? (
              <View style={styles.warningContainer}>
                <Ionicons name="warning-outline" size={24} color="#FFA000" />
                <Text style={styles.warningText}>
                  Please select a project and floor to export.
                </Text>
              </View>
            ) : currentFloor.walls.length === 0 ? (
              <View style={styles.warningContainer}>
                <Ionicons name="warning-outline" size={24} color="#FFA000" />
                <Text style={styles.warningText}>
                  This floor has no walls to export.
                </Text>
              </View>
            ) : null}
            
            {/* Format selector */}
            <View style={styles.formatSelector}>
              <Text style={styles.formatTitle}>Export Format:</Text>
              
              <View style={styles.formatOptions}>
                <TouchableOpacity
                  style={[
                    styles.formatOption,
                    exportFormat === 'image' && styles.formatOptionSelected,
                  ]}
                  onPress={() => setExportFormat('image')}
                >
                  <Ionicons
                    name="image-outline"
                    size={20}
                    color={exportFormat === 'image' ? '#2196F3' : '#666'}
                  />
                  <Text
                    style={[
                      styles.formatText,
                      exportFormat === 'image' && styles.formatTextSelected,
                    ]}
                  >
                    Image
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.formatOption,
                    exportFormat === 'pdf' && styles.formatOptionSelected,
                  ]}
                  onPress={() => setExportFormat('pdf')}
                >
                  <Ionicons
                    name="document-outline"
                    size={20}
                    color={exportFormat === 'pdf' ? '#2196F3' : '#666'}
                  />
                  <Text
                    style={[
                      styles.formatText,
                      exportFormat === 'pdf' && styles.formatTextSelected,
                    ]}
                  >
                    PDF
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Preview of exported map */}
            {exportedUri && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewTitle}>Preview:</Text>
                <Image
                  source={{ uri: exportedUri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              </View>
            )}
            
            {/* Permission denied warning */}
            {isPermissionDenied && (
              <View style={styles.permissionWarning}>
                <Ionicons name="alert-circle-outline" size={24} color="#F44336" />
                <Text style={styles.permissionWarningText}>
                  Storage permission is required to save the map. Please enable it in device settings.
                </Text>
              </View>
            )}
          </ScrollView>
          
          {/* Action buttons */}
          <View style={styles.actionButtons}>
            {isExporting ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Exporting...</Text>
              </View>
            ) : (
              <>
                <Button
                  title="Export Map"
                  onPress={handleExport}
                  type="primary"
                  disabled={!currentProject || !currentFloor || currentFloor.walls.length === 0}
                  icon={
                    <Ionicons
                      name="download-outline"
                      size={18}
                      color="white"
                      style={{ marginRight: 6 }}
                    />
                  }
                />
                
                {exportedUri && (
                  <Button
                    title="Share Map"
                    onPress={handleShare}
                    type="secondary"
                    style={{ marginTop: 12 }}
                    icon={
                      <Ionicons
                        name="share-outline"
                        size={18}
                        color="#2196F3"
                        style={{ marginRight: 6 }}
                      />
                    }
                  />
                )}
              </>
            )}
          </View>
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
    maxHeight: '80%',
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
  infoContainer: {
    marginBottom: 20,
    maxHeight: 400,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  floorName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 160, 0, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    marginLeft: 8,
    flex: 1,
    color: '#333',
  },
  formatSelector: {
    marginBottom: 16,
  },
  formatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  formatOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EEE',
    width: '45%',
    justifyContent: 'center',
  },
  formatOptionSelected: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderColor: '#2196F3',
  },
  formatText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#666',
  },
  formatTextSelected: {
    color: '#2196F3',
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  permissionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  permissionWarningText: {
    marginLeft: 8,
    flex: 1,
    color: '#F44336',
  },
  actionButtons: {
    marginTop: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#666',
  },
});
