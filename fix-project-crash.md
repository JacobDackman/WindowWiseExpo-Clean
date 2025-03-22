# Fixes for WindowWise App Crash

The app is crashing after project creation due to several issues that need to be fixed. Here are the problems and their solutions:

## 1. Fix MappingScreen Floor Access

One likely issue is that the MappingScreen tries to access properties of a newly created project's floors, but there are no floors yet.

```jsx
// In MappingScreen.tsx
// Problem: This causes crashes when currentFloor is undefined
const currentFloor = currentProject?.floors.find(
  f => f.id === currentProject?.currentFloorId
);

// Fix: Add null check before accessing properties
if (!currentProject || !currentFloor) {
  // Show a message to create a floor first
  setFloorManagerVisible(true);
}
```

## 2. Fix Navigation Setup

The navigation setup needs to properly handle the state when there is no data.

```jsx
// In App.tsx
// Make sure navigation container has proper error handling
<NavigationContainer
  fallback={<Text>Loading...</Text>}
  onError={(error) => {
    console.error('Navigation error:', error);
  }}
>
  {/* ... */}
</NavigationContainer>
```

## 3. Fix Asset Loading

The icon and background image need proper asset loading:

```jsx
// In App.js
// Preload all assets
const loadAssets = async () => {
  try {
    const images = [
      require('./assets/icon.png'),
      require('./assets/splash.png'),
      // Add other images here
    ];
    
    const cacheImages = images.map(image => {
      return Asset.fromModule(image).downloadAsync();
    });
    
    await Promise.all(cacheImages);
  } catch (error) {
    console.error('Error loading assets:', error);
  }
};

// Call this in useEffect before showing the app
```

## 4. Fix ID Generation

Ensure UUIDs are generating correctly:

```jsx
// Make sure you have the uuid package installed
npm install uuid
```

## 5. Add Error Boundaries

Add error boundaries around key components to prevent the whole app from crashing:

```jsx
// Create ErrorBoundary.tsx
import React from 'react';
import { View, Text, Button } from 'react-native';

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, info) {
    console.error('Error caught by boundary:', error, info);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
            Something went wrong
          </Text>
          <Text style={{ marginBottom: 20, textAlign: 'center' }}>
            {this.state.error?.toString()}
          </Text>
          <Button
            title="Retry"
            onPress={() => this.setState({ hasError: false, error: null })}
          />
        </View>
      );
    }
    
    return this.props.children;
  }
}

export default ErrorBoundary;
```

## Implementation Steps

1. Fix the MappingScreen to properly handle empty projects
2. Implement proper asset loading in App.tsx
3. Add error boundaries around key screens
4. Test project creation flow carefully

These changes should fix the crashing issues and ensure assets load properly.
