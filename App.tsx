// First, import the polyfill (must be first)
import 'react-native-get-random-values';

// Then import React and other dependencies (only once)
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View, Text, ActivityIndicator, ImageBackground, LogBox } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

import { AppProvider } from './src/contexts/AppContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { MappingScreen } from './src/screens/MappingScreen';
import ErrorBoundary from './src/components/ErrorBoundary';

// Rest of your code...

// Ignore specific harmless warnings
LogBox.ignoreLogs([
  'Asyncstorage has been extracted',
  'Require cycle:',
  'Non-serializable values were found in the navigation state',
]);

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn('Error preventing splash screen auto-hide:', error);
});

// Define the navigation stack
const Stack = createNativeStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Load assets and other resources
  useEffect(() => {
    const prepare = async () => {
      try {
        // Pre-load assets
        const images = [
          require('./assets/icon.png'),
          require('./assets/splash.png'),
          require('./assets/adaptive-icon.png'),
        ];
        
        // Cache images
        const cacheImages = images.map(image => {
          return Asset.fromModule(image).downloadAsync();
        });
        
        // Wait for assets to load
        await Promise.all(cacheImages);
        
        // Artificial small delay to ensure everything is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Success - hide splash screen
        await SplashScreen.hideAsync();
      } catch (error) {
        console.error('Error during app initialization:', error);
        setLoadError(error instanceof Error ? error : new Error('Failed to initialize app'));
        // Hide splash screen even on error, so we can show our own error UI
        SplashScreen.hideAsync().catch(console.error);
      } finally {
        setIsReady(true);
      }
    };

    prepare();
  }, []);

  // Show loading indicator while initializing
  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading WindowWise...</Text>
      </View>
    );
  }

  // Show error screen if initialization failed
  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorHeader}>Initialization Error</Text>
        <Text style={styles.errorText}>{loadError.message}</Text>
        <Text style={styles.errorHint}>
          Try restarting the app. If the problem persists, please reinstall the application.
        </Text>
      </View>
    );
  }

  // Main app
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <AppProvider>
          <ImageBackground 
            source={require('./assets/splash.png')} 
            style={styles.backgroundImage}
            imageStyle={{ opacity: 0.12 }}
          >
            <NavigationContainer fallback={<Text>Loading navigation...</Text>}>
              <ErrorBoundary>
                <Stack.Navigator 
                  initialRouteName="Home"
                  screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                >
                  <Stack.Screen name="Home" component={HomeScreen} />
                  <Stack.Screen name="Mapping" component={MappingScreen} />
                </Stack.Navigator>
              </ErrorBoundary>
            </NavigationContainer>
          </ImageBackground>
        </AppProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    color: '#333',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 20,
  },
  errorHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#e53935',
    marginBottom: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
