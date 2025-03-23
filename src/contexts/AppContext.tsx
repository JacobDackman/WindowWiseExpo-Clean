import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import { View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

import {
  AppState,
  AppContextType,
  AppSettings,
  Action,
  Project,
  Floor,
  Wall,
  Feature,
  FeatureType,
  Point,
  SensorData,
} from '../types';
import { ENV } from '../config/env';
import { storage } from '../utils/storage';

// Default settings
const defaultSettings: AppSettings = {
  stepLength: ENV.STEP_LENGTH,
  autoSaveInterval: ENV.AUTO_SAVE_INTERVAL,
  showMeasurements: ENV.SHOW_MEASUREMENTS,
  highAccuracyMode: ENV.ENABLE_HIGH_ACCURACY_MODE,
};

// Storage keys
const STORAGE_KEYS = {
  PROJECTS: 'windowwise:projects',
  SETTINGS: 'windowwise:settings',
};

// Initial state
const initialState: AppState = {
  projects: [],
  currentProject: null,
  isLoading: true,
  error: null,
  mappingState: 'idle',
  settings: defaultSettings,
  featureCounts: {
    'window': 0,
    'door': 0,
    'sliding-door': 0,
  },
};

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Reducer function
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_DATA':
      return {
        ...state,
        projects: action.payload.projects,
        isLoading: false,
      };

    case 'CREATE_PROJECT': {
      const now = Date.now();
      const newProject: Project = {
        id: uuidv4(),
        name: action.payload.name,
        floors: [],
        currentFloorId: '',
        dateCreated: now,
        dateModified: now,
      };

      return {
        ...state,
        projects: [...state.projects, newProject],
        currentProject: newProject,
        featureCounts: {
          'window': 0,
          'door': 0,
          'sliding-door': 0,
        },
      };
    }

    case 'SELECT_PROJECT': {
      const selectedProject = state.projects.find(p => p.id === action.payload.id) || null;
      
      // Reset feature counts when selecting a project
      const featureCounts = { 'window': 0, 'door': 0, 'sliding-door': 0 };
      
      // Count features in the current floor if available
      if (selectedProject && selectedProject.currentFloorId) {
        const currentFloor = selectedProject.floors.find(f => f.id === selectedProject.currentFloorId);
        if (currentFloor) {
          currentFloor.walls.forEach(wall => {
            wall.features.forEach(feature => {
              if (feature.type in featureCounts) {
                featureCounts[feature.type]++;
              }
            });
          });
        }
      }
      
      return {
        ...state,
        currentProject: selectedProject,
        featureCounts,
        mappingState: 'idle',
      };
    }

    case 'DELETE_PROJECT': {
      const updatedProjects = state.projects.filter(p => p.id !== action.payload.id);
      
      // If we're deleting the current project, select another one or null
      let currentProject = state.currentProject;
      if (currentProject && currentProject.id === action.payload.id) {
        currentProject = updatedProjects.length > 0 ? updatedProjects[0] : null;
      }
      
      return {
        ...state,
        projects: updatedProjects,
        currentProject,
      };
    }

    case 'ADD_FLOOR': {
      if (!state.currentProject) return state;
      
      const now = Date.now();
      const newFloor: Floor = {
        id: uuidv4(),
        name: action.payload.name,
        walls: [],
        dateCreated: now,
        dateModified: now,
      };
      
      const updatedProject: Project = {
        ...state.currentProject,
        floors: [...state.currentProject.floors, newFloor],
        currentFloorId: newFloor.id,
        dateModified: now,
      };
      
      return {
        ...state,
        currentProject: updatedProject,
        projects: state.projects.map(p => (
          p.id === updatedProject.id ? updatedProject : p
        )),
      };
    }

    case 'SELECT_FLOOR': {
      if (!state.currentProject) return state;
      
      // Reset feature counts for the newly selected floor
      const featureCounts = { 'window': 0, 'door': 0, 'sliding-door': 0 };
      
      // Count features in the selected floor
      const selectedFloor = state.currentProject.floors.find(f => f.id === action.payload.id);
      if (selectedFloor) {
        selectedFloor.walls.forEach(wall => {
          wall.features.forEach(feature => {
            if (feature.type in featureCounts) {
              featureCounts[feature.type]++;
            }
          });
        });
      }
      
      const updatedProject: Project = {
        ...state.currentProject,
        currentFloorId: action.payload.id,
        dateModified: Date.now(),
      };
      
      return {
        ...state,
        currentProject: updatedProject,
        projects: state.projects.map(p => (
          p.id === updatedProject.id ? updatedProject : p
        )),
        featureCounts,
      };
    }

    case 'DELETE_FLOOR': {
      if (!state.currentProject) return state;
      
      const updatedFloors = state.currentProject.floors.filter(f => f.id !== action.payload.id);
      
      // If we're deleting the current floor, select another one if available
      let currentFloorId = state.currentProject.currentFloorId;
      if (currentFloorId === action.payload.id) {
        currentFloorId = updatedFloors.length > 0 ? updatedFloors[0].id : '';
      }
      
      const updatedProject: Project = {
        ...state.currentProject,
        floors: updatedFloors,
        currentFloorId,
        dateModified: Date.now(),
      };
      
      return {
        ...state,
        currentProject: updatedProject,
        projects: state.projects.map(p => (
          p.id === updatedProject.id ? updatedProject : p
        )),
      };
    }

    case 'ADD_WALL': {
      if (!state.currentProject || !action.payload.points.length) return state;
      
      const { floorId, points } = action.payload;
      
      // Find the floor
      const floorIndex = state.currentProject.floors.findIndex(f => f.id === floorId);
      if (floorIndex === -1) return state;
      
      // Create new wall
      const newWall: Wall = {
        id: uuidv4(),
        points,
        features: [],
      };
      
      // Update the floor
      const updatedFloor = {
        ...state.currentProject.floors[floorIndex],
        walls: [...state.currentProject.floors[floorIndex].walls, newWall],
        dateModified: Date.now(),
      };
      
      // Update the floors array
      const updatedFloors = [...state.currentProject.floors];
      updatedFloors[floorIndex] = updatedFloor;
      
      // Update the project
      const updatedProject: Project = {
        ...state.currentProject,
        floors: updatedFloors,
        dateModified: Date.now(),
      };
      
      return {
        ...state,
        currentProject: updatedProject,
        projects: state.projects.map(p => (
          p.id === updatedProject.id ? updatedProject : p
        )),
        mappingState: 'completed',
      };
    }

    case 'DELETE_WALL': {
      if (!state.currentProject) return state;
      
      const { floorId, wallId } = action.payload;
      
      // Find the floor
      const floorIndex = state.currentProject.floors.findIndex(f => f.id === floorId);
      if (floorIndex === -1) return state;
      
      // Filter out the wall
      const updatedWalls = state.currentProject.floors[floorIndex].walls.filter(w => w.id !== wallId);
      
      // Update the floor
      const updatedFloor = {
        ...state.currentProject.floors[floorIndex],
        walls: updatedWalls,
        dateModified: Date.now(),
      };
      
      // Update the floors array
      const updatedFloors = [...state.currentProject.floors];
      updatedFloors[floorIndex] = updatedFloor;
      
      // Update the project
      const updatedProject: Project = {
        ...state.currentProject,
        floors: updatedFloors,
        dateModified: Date.now(),
      };
      
      return {
        ...state,
        currentProject: updatedProject,
        projects: state.projects.map(p => (
          p.id === updatedProject.id ? updatedProject : p
        )),
      };
    }

    case 'ADD_FEATURE': {
      if (!state.currentProject) return state;
      
      const { floorId, wallId, feature } = action.payload;
      
      // Find the floor
      const floorIndex = state.currentProject.floors.findIndex(f => f.id === floorId);
      if (floorIndex === -1) return state;
      
      // Find the wall
      const wallIndex = state.currentProject.floors[floorIndex].walls.findIndex(w => w.id === wallId);
      if (wallIndex === -1) return state;
      
      // Add the feature
      const updatedWall = {
        ...state.currentProject.floors[floorIndex].walls[wallIndex],
        features: [...state.currentProject.floors[floorIndex].walls[wallIndex].features, feature],
      };
      
      // Update walls array
      const updatedWalls = [...state.currentProject.floors[floorIndex].walls];
      updatedWalls[wallIndex] = updatedWall;
      
      // Update floor
      const updatedFloor = {
        ...state.currentProject.floors[floorIndex],
        walls: updatedWalls,
        dateModified: Date.now(),
      };
      
      // Update floors array
      const updatedFloors = [...state.currentProject.floors];
      updatedFloors[floorIndex] = updatedFloor;
      
      // Update project
      const updatedProject: Project = {
        ...state.currentProject,
        floors: updatedFloors,
        dateModified: Date.now(),
      };
      
      // Update feature counts
      const featureCounts = { ...state.featureCounts };
      featureCounts[feature.type]++;
      
      return {
        ...state,
        currentProject: updatedProject,
        projects: state.projects.map(p => (
          p.id === updatedProject.id ? updatedProject : p
        )),
        featureCounts,
      };
    }

    case 'DELETE_FEATURE': {
      if (!state.currentProject) return state;
      
      const { floorId, wallId, featureId } = action.payload;
      
      // Find the floor
      const floorIndex = state.currentProject.floors.findIndex(f => f.id === floorId);
      if (floorIndex === -1) return state;
      
      // Find the wall
      const wallIndex = state.currentProject.floors[floorIndex].walls.findIndex(w => w.id === wallId);
      if (wallIndex === -1) return state;
      
      // Find the feature to decrement the count
      const featureToDelete = state.currentProject.floors[floorIndex].walls[wallIndex].features.find(f => f.id === featureId);
      if (!featureToDelete) return state;
      
      // Filter out the feature
      const updatedFeatures = state.currentProject.floors[floorIndex].walls[wallIndex].features.filter(f => f.id !== featureId);
      
      // Update wall
      const updatedWall = {
        ...state.currentProject.floors[floorIndex].walls[wallIndex],
        features: updatedFeatures,
      };
      
      // Update walls array
      const updatedWalls = [...state.currentProject.floors[floorIndex].walls];
      updatedWalls[wallIndex] = updatedWall;
      
      // Update floor
      const updatedFloor = {
        ...state.currentProject.floors[floorIndex],
        walls: updatedWalls,
        dateModified: Date.now(),
      };
      
      // Update floors array
      const updatedFloors = [...state.currentProject.floors];
      updatedFloors[floorIndex] = updatedFloor;
      
      // Update project
      const updatedProject: Project = {
        ...state.currentProject,
        floors: updatedFloors,
        dateModified: Date.now(),
      };
      
      // Update feature counts
      const featureCounts = { ...state.featureCounts };
      featureCounts[featureToDelete.type]--;
      
      return {
        ...state,
        currentProject: updatedProject,
        projects: state.projects.map(p => (
          p.id === updatedProject.id ? updatedProject : p
        )),
        featureCounts,
      };
    }

    case 'START_MAPPING':
      return {
        ...state,
        mappingState: 'mapping',
      };

    case 'PAUSE_MAPPING':
      return {
        ...state,
        mappingState: 'paused',
      };

    case 'STOP_MAPPING':
      return {
        ...state,
        mappingState: 'completed',
      };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
        },
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    default:
      return state;
  }
}

// Provider component
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load data from AsyncStorage
  useEffect(() => {
    const loadData = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        
        // Load settings
        const settingsData = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (settingsData) {
          const parsedSettings = JSON.parse(settingsData);
          dispatch({
            type: 'UPDATE_SETTINGS',
            payload: parsedSettings,
          });
        }
        
        // Load projects
        const projectsData = await AsyncStorage.getItem(STORAGE_KEYS.PROJECTS);
        if (projectsData) {
          const parsedProjects = JSON.parse(projectsData);
          dispatch({
            type: 'LOAD_DATA',
            payload: { projects: parsedProjects },
          });
        } else {
          dispatch({
            type: 'LOAD_DATA',
            payload: { projects: [] },
          });
        }
      } catch (error) {
        console.error('Error loading data:', error);
        dispatch({
          type: 'SET_ERROR',
          payload: 'Failed to load application data',
        });
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    loadData();
  }, []);

  // Save projects to AsyncStorage when they change
  useEffect(() => {
    const saveProjects = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(state.projects));
      } catch (error) {
        console.error('Error saving projects:', error);
        dispatch({
          type: 'SET_ERROR',
          payload: 'Failed to save projects',
        });
      }
    };

    if (!state.isLoading) {
      saveProjects();
    }
  }, [state.projects, state.isLoading]);

  // Save settings to AsyncStorage when they change
  useEffect(() => {
    const saveSettings = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
      } catch (error) {
        console.error('Error saving settings:', error);
      }
    };

    if (!state.isLoading) {
      saveSettings();
    }
  }, [state.settings, state.isLoading]);

  // Start mapping
  const startMapping = () => {
    dispatch({ type: 'START_MAPPING' });
  };

  // Pause mapping
  const pauseMapping = () => {
    dispatch({ type: 'PAUSE_MAPPING' });
  };

  // Stop mapping
  const stopMapping = () => {
    dispatch({ type: 'STOP_MAPPING' });
  };

  // Add a feature to the current wall
  const addFeature = (type: FeatureType, position: number, width: number) => {
    if (!state.currentProject || !state.currentProject.currentFloorId) return;
    
    // Find the current floor
    const currentFloor = state.currentProject.floors.find(f => f.id === state.currentProject?.currentFloorId);
    if (!currentFloor || !currentFloor.walls.length) return;
    
    // For simplicity, add the feature to the last wall
    const lastWall = currentFloor.walls[currentFloor.walls.length - 1];
    
    // Create feature ID
    const featureId = uuidv4();
    
    // Create label based on type and count
    const count = state.featureCounts[type] + 1;
    const prefix = type === 'window' ? 'W' : type === 'door' ? 'D' : 'SD';
    const label = `${prefix}${count}`;
    
    // Create the feature
    const feature: Feature = {
      id: featureId,
      type,
      position,
      width,
      label,
    };
    
    // Dispatch action to add the feature
    dispatch({
      type: 'ADD_FEATURE',
      payload: {
        floorId: currentFloor.id,
        wallId: lastWall.id,
        feature,
      },
    });
  };

  // Save the current project
  const saveProject = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(state.projects));
      return Promise.resolve();
    } catch (error) {
      console.error('Error saving project:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: 'Failed to save project',
      });
      return Promise.reject(error);
    }
  };

  // Export the map as an image
  const exportMap = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      // This is a placeholder for actual map export functionality
      // In a real implementation, we would use react-native-view-shot to capture the map view
      // and save it to the filesystem
      
      // Mock a successful response for now
      setTimeout(() => {
        resolve(FileSystem.documentDirectory + 'map.png');
      }, 500);
    });
  };

  // Context value
  const contextValue: AppContextType = {
    state,
    dispatch,
    startMapping,
    pauseMapping,
    stopMapping,
    addFeature,
    saveProject,
    exportMap,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

// Hook for using the context
export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
