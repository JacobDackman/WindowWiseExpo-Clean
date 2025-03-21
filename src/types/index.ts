// Basic structures

export type Point = {
  x: number;
  y: number;
};

export type FeatureType = 'window' | 'door' | 'sliding-door';

export interface Feature {
  id: string;
  type: FeatureType;
  position: number; // Normalized position along the wall (0-1)
  width: number; // Width in meters
  label: string; // E.g., "W1" for Window 1
}

export interface Wall {
  id: string;
  points: Point[];
  features: Feature[];
}

export interface Floor {
  id: string;
  name: string;
  walls: Wall[];
  dateCreated: number;
  dateModified: number;
}

export interface Project {
  id: string;
  name: string;
  floors: Floor[];
  currentFloorId: string;
  dateCreated: number;
  dateModified: number;
}

// App state

export type MappingState = 'idle' | 'mapping' | 'paused' | 'completed';

export interface AppSettings {
  stepLength: number; // Average step length in meters
  autoSaveInterval: number; // Auto-save interval in milliseconds
  showMeasurements: boolean;
  highAccuracyMode: boolean;
}

export interface FeatureCounts {
  'window': number;
  'door': number;
  'sliding-door': number;
}

export interface AppState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;
  mappingState: MappingState;
  settings: AppSettings;
  featureCounts: FeatureCounts;
}

// Sensor data

export interface SensorData {
  accelerometer?: {
    x: number;
    y: number;
    z: number;
  };
  magnetometer?: {
    x: number;
    y: number;
    z: number;
  };
  gyroscope?: {
    x: number;
    y: number;
    z: number;
  };
  pedometer?: {
    steps: number;
    distance?: number;
  };
  timestamp: number;
}

export interface SensorsAvailability {
  accelerometer: boolean;
  magnetometer: boolean;
  gyroscope: boolean;
  pedometer: boolean;
}

// Actions for reducer

export type Action =
  | { type: 'CREATE_PROJECT'; payload: { name: string } }
  | { type: 'SELECT_PROJECT'; payload: { id: string } }
  | { type: 'DELETE_PROJECT'; payload: { id: string } }
  | { type: 'ADD_FLOOR'; payload: { name: string } }
  | { type: 'SELECT_FLOOR'; payload: { id: string } }
  | { type: 'DELETE_FLOOR'; payload: { id: string } }
  | { type: 'ADD_WALL'; payload: { floorId: string; points: Point[] } }
  | { type: 'DELETE_WALL'; payload: { floorId: string; wallId: string } }
  | { type: 'ADD_FEATURE'; payload: { floorId: string; wallId: string; feature: Feature } }
  | { type: 'DELETE_FEATURE'; payload: { floorId: string; wallId: string; featureId: string } }
  | { type: 'START_MAPPING' }
  | { type: 'PAUSE_MAPPING' }
  | { type: 'STOP_MAPPING' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOAD_DATA'; payload: { projects: Project[] } };

// Context types

export interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  startMapping: () => void;
  pauseMapping: () => void;
  stopMapping: () => void;
  addFeature: (type: FeatureType, position: number, width: number) => void;
  saveProject: () => Promise<void>;
  exportMap: () => Promise<string>;
}
