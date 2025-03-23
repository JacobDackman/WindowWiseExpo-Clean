/**
 * Helper to log and report app crashes
 * @param {Error} error - The error that occurred
 * @param {string} componentName - Where the error happened
 */
export const reportCrash = (error: Error, componentName = 'Unknown') => {
  console.error(`[CRASH] ${componentName}: ${error.message}`);
  
  // In a production app, you would send this to a crash reporting service
  // like Crashlytics, Sentry, etc.
  
  // For now, we just log it
  console.error(error);
};
