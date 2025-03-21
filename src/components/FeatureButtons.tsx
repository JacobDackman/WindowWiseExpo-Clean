import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { FeatureType } from '../types';

interface FeatureButtonsProps {
  onAddFeature: (type: FeatureType) => void;
  disabled?: boolean;
}

export const FeatureButtons: React.FC<FeatureButtonsProps> = ({
  onAddFeature,
  disabled = false,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Features</Text>
      
      <View style={styles.buttonContainer}>
        <Button
          title="Window"
          onPress={() => onAddFeature('window')}
          type="secondary"
          style={styles.button}
          disabled={disabled}
          icon={
            <Ionicons
              name="square-outline"
              size={18}
              color={disabled ? '#CCCCCC' : '#2196F3'}
              style={styles.iconStyle}
            />
          }
        />
        
        <Button
          title="Door"
          onPress={() => onAddFeature('door')}
          type="secondary"
          style={styles.button}
          disabled={disabled}
          icon={
            <Ionicons
              name="exit-outline"
              size={18}
              color={disabled ? '#CCCCCC' : '#2196F3'}
              style={styles.iconStyle}
            />
          }
        />
        
        <Button
          title="Sliding Door"
          onPress={() => onAddFeature('sliding-door')}
          type="secondary"
          style={styles.button}
          disabled={disabled}
          icon={
            <Ionicons
              name="reorder-two-outline"
              size={18}
              color={disabled ? '#CCCCCC' : '#2196F3'}
              style={styles.iconStyle}
            />
          }
        />
      </View>
      
      {disabled && (
        <Text style={styles.disabledHint}>
          Complete mapping to add features
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  button: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  iconStyle: {
    marginRight: 6,
  },
  disabledHint: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
});
