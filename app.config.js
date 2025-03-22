module.exports = ({ config }) => {
  // Get environment variables with fallbacks
  const APP_ENV = process.env.APP_ENV || 'development';
  const APP_VERSION = process.env.APP_VERSION || '1.0.0';
  const ENABLE_HIGH_ACCURACY_MODE = process.env.ENABLE_HIGH_ACCURACY_MODE === 'true';
  const ENABLE_DEBUG_LOGGING = process.env.ENABLE_DEBUG_LOGGING === 'true';
  const SENSOR_UPDATE_INTERVAL = parseInt(process.env.SENSOR_UPDATE_INTERVAL || '100', 10);
  const STEP_LENGTH = parseFloat(process.env.STEP_LENGTH || '0.75');
  const AUTO_SAVE_INTERVAL = parseInt(process.env.AUTO_SAVE_INTERVAL || '60000', 10);
  const SHOW_MEASUREMENTS = process.env.SHOW_MEASUREMENTS !== 'false';

  return {
    ...config,
    extra: {
      ...config.extra,
      APP_ENV,
      APP_VERSION,
      ENABLE_HIGH_ACCURACY_MODE,
      ENABLE_DEBUG_LOGGING,
      SENSOR_UPDATE_INTERVAL,
      STEP_LENGTH,
      AUTO_SAVE_INTERVAL,
      SHOW_MEASUREMENTS,
    },
  };
}; 