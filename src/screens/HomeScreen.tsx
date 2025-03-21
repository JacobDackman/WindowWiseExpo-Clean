import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  SafeAreaView,
  Alert,
  ImageBackground,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { useApp } from '../contexts/AppContext';
import { Project } from '../types';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const { projects } = state;

  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Handle creating a new project
  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      dispatch({
        type: 'CREATE_PROJECT',
        payload: { name: newProjectName.trim() },
      });
      setNewProjectName('');
      setCreateModalVisible(false);
      
      // Navigate to the mapping screen after creating a project
      navigation.navigate('Mapping' as never);
    } else {
      Alert.alert('Error', 'Please enter a project name');
    }
  };

  // Handle selecting a project
  const handleSelectProject = (projectId: string) => {
    dispatch({
      type: 'SELECT_PROJECT',
      payload: { id: projectId },
    });
    navigation.navigate('Mapping' as never);
  };

  // Handle deleting a project
  const handleDeleteProject = (projectId: string) => {
    Alert.alert(
      'Delete Project',
      'Are you sure you want to delete this project? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            dispatch({
              type: 'DELETE_PROJECT',
              payload: { id: projectId },
            });
          }
        }
      ]
    );
  };

  // Render a project item
  const renderProjectItem = ({ item }: { item: Project }) => {
    const date = new Date(item.dateModified);
    const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    return (
      <TouchableOpacity 
        style={styles.projectItem}
        onPress={() => handleSelectProject(item.id)}
      >
        <View style={styles.projectContent}>
          <Text style={styles.projectName}>{item.name}</Text>
          <Text style={styles.projectDate}>Last modified: {formattedDate}</Text>
          <Text style={styles.projectInfo}>
            {item.floors.length} floor{item.floors.length !== 1 ? 's' : ''}
          </Text>
        </View>
        
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteProject(item.id)}
        >
          <Ionicons name="trash-outline" size={24} color="#f44336" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Render empty project list message
  const EmptyProjectList = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="home-outline" size={64} color="#CCCCCC" />
      <Text style={styles.emptyText}>No projects yet</Text>
      <Text style={styles.emptySubtext}>
        Create a new project to start mapping your house
      </Text>
      <Button 
        title="Create New Project" 
        onPress={() => setCreateModalVisible(true)}
        type="primary"
        size="large"
        style={styles.emptyButton}
      />
    </View>
  );

  return (
    <ImageBackground 
      source={require('../../assets/splash.png')} 
      style={styles.backgroundImage}
      imageStyle={{ opacity: 0.12 }}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>WindowWise</Text>
          <Text style={styles.subtitle}>House Exterior Mapping Tool</Text>
        </View>

        <View style={styles.projectListContainer}>
          <View style={styles.projectListHeader}>
            <Text style={styles.sectionTitle}>My Projects</Text>
            <Button
              title="New Project"
              onPress={() => setCreateModalVisible(true)}
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
          </View>

          <FlatList
            data={projects}
            renderItem={renderProjectItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.projectList}
            ListEmptyComponent={EmptyProjectList}
          />
        </View>

        {/* Create Project Modal */}
        <Modal
          visible={isCreateModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setCreateModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Create New Project</Text>
              
              <TextInput
                style={styles.input}
                placeholder="Project Name"
                value={newProjectName}
                onChangeText={setNewProjectName}
                autoFocus
              />
              
              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  onPress={() => {
                    setNewProjectName('');
                    setCreateModalVisible(false);
                  }}
                  type="secondary"
                />
                <Button
                  title="Create"
                  onPress={handleCreateProject}
                  disabled={!newProjectName.trim()}
                />
              </View>
            </View>
          </View>
        </Modal>
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
    padding: 20,
    backgroundColor: 'rgba(33, 150, 243, 0.9)', // Semi-transparent header
    alignItems: 'center',
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
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  projectListContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(248, 248, 248, 0.7)', // Semi-transparent background
    borderRadius: 16,
    margin: 8,
  },
  projectListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  projectList: {
    flexGrow: 1,
  },
  projectItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
    borderLeftWidth: 5,
    borderLeftColor: '#2196F3',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectContent: {
    flex: 1,
  },
  projectName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  projectDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  projectInfo: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 16,
    margin: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
