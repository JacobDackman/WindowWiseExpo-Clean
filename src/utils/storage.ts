import AsyncStorage from '@react-native-async-storage/async-storage';
import { Floor } from '../types';

const STORAGE_KEYS = {
  PROJECTS: '@WindowWise:projects',
  MAPPING_DATA: '@WindowWise:mappingData',
  LAST_SYNC: '@WindowWise:lastSync',
  PENDING_SYNC: '@WindowWise:pendingSync',
};

export interface StorageProject {
  id: string;
  name: string;
  floors: Floor[];
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'error';
}

interface PendingSyncItem {
  type: 'project' | 'mappingData';
  id: string;
  data: any;
  timestamp: number;
}

export const storage = {
  async saveProject(project: StorageProject): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.PROJECTS}:${project.id}`;
      await AsyncStorage.setItem(key, JSON.stringify({
        ...project,
        lastModified: Date.now(),
        syncStatus: 'pending'
      }));

      // Add to pending sync queue
      await this.addToPendingSync({
        type: 'project',
        id: project.id,
        data: project,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error saving project:', error);
      throw new Error('Failed to save project offline');
    }
  },

  async getProject(projectId: string): Promise<StorageProject | null> {
    try {
      const key = `${STORAGE_KEYS.PROJECTS}:${projectId}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading project:', error);
      return null;
    }
  },

  async getAllProjects(): Promise<StorageProject[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const projectKeys = keys.filter(key => key.startsWith(STORAGE_KEYS.PROJECTS));
      const projectData = await AsyncStorage.multiGet(projectKeys);
      return projectData
        .map(([_, value]) => value ? JSON.parse(value) : null)
        .filter(Boolean);
    } catch (error) {
      console.error('Error loading projects:', error);
      return [];
    }
  },

  async saveMappingData(projectId: string, floorId: string, data: any): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.MAPPING_DATA}:${projectId}:${floorId}`;
      const mappingData = {
        projectId,
        floorId,
        data,
        timestamp: Date.now(),
        syncStatus: 'pending'
      };
      
      await AsyncStorage.setItem(key, JSON.stringify(mappingData));

      // Add to pending sync queue
      await this.addToPendingSync({
        type: 'mappingData',
        id: `${projectId}:${floorId}`,
        data: mappingData,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error saving mapping data:', error);
      throw new Error('Failed to save mapping data offline');
    }
  },

  async getMappingData(projectId: string, floorId: string): Promise<any | null> {
    try {
      const key = `${STORAGE_KEYS.MAPPING_DATA}:${projectId}:${floorId}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading mapping data:', error);
      return null;
    }
  },

  async addToPendingSync(item: PendingSyncItem): Promise<void> {
    try {
      const pendingSync = await this.getPendingSync();
      pendingSync.push(item);
      await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(pendingSync));
    } catch (error) {
      console.error('Error adding to pending sync:', error);
    }
  },

  async getPendingSync(): Promise<PendingSyncItem[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SYNC);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting pending sync:', error);
      return [];
    }
  },

  async clearPendingSync(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_SYNC);
    } catch (error) {
      console.error('Error clearing pending sync:', error);
    }
  },

  async updateSyncStatus(type: 'project' | 'mappingData', id: string, status: 'synced' | 'error'): Promise<void> {
    try {
      const key = type === 'project' 
        ? `${STORAGE_KEYS.PROJECTS}:${id}`
        : `${STORAGE_KEYS.MAPPING_DATA}:${id}`;
      
      const data = await AsyncStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        parsed.syncStatus = status;
        await AsyncStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch (error) {
      console.error('Error updating sync status:', error);
    }
  }
}; 