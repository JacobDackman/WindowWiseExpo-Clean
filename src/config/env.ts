import Constants from 'expo-constants';

// Helper function to get environment variables with type safety and defaults
function getEnvVar<T>(key: string, defaultValue: T): T {
  const value = Constants.expoConfig?.extra?.[key];
  return value !== undefined ? value as T : defaultValue;
}

export const ENV = {
  // App Configuration
  APP_ENV: getEnvVar('APP_ENV', 'development'),
  APP_VERSION: getEnvVar('APP_VERSION', '1.0.0'),

  // Feature Flags
  ENABLE_HIGH_ACCURACY_MODE: getEnvVar('ENABLE_HIGH_ACCURACY_MODE', false),
  ENABLE_DEBUG_LOGGING: getEnvVar('ENABLE_DEBUG_LOGGING', false),

  // Sensor Configuration
  SENSOR_UPDATE_INTERVAL: getEnvVar('SENSOR_UPDATE_INTERVAL', 100),
  STEP_LENGTH: getEnvVar('STEP_LENGTH', 0.75),
  AUTO_SAVE_INTERVAL: getEnvVar('AUTO_SAVE_INTERVAL', 60000),

  // App Settings
  SHOW_MEASUREMENTS: getEnvVar('SHOW_MEASUREMENTS', true),
};

// Type definition for our environment variables
export type EnvVars = typeof ENV; 