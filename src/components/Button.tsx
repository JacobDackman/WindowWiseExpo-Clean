import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';

type ButtonType = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'normal' | 'large' | 'small';

interface ButtonProps {
  title: string;
  onPress: () => void;
  type?: ButtonType;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  type = 'primary',
  size = 'normal',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}) => {
  // Determine the button and text styles based on type and size
  const buttonStyles = [
    styles.button,
    styles[`${type}Button`],
    styles[`${size}Button`],
    disabled && styles.disabledButton,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`${type}Text`],
    styles[`${size}Text`],
    disabled && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={type === 'primary' ? 'white' : '#2196F3'}
          size={size === 'small' ? 'small' : 'small'}
        />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text style={textStyles}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 100,
  },
  // Type variants
  primaryButton: {
    backgroundColor: '#2196F3',
  },
  secondaryButton: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  dangerButton: {
    backgroundColor: '#f44336',
  },
  // Size variants
  normalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  largeButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 150,
  },
  smallButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 80,
  },
  // Text styles
  text: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryText: {
    color: 'white',
  },
  secondaryText: {
    color: '#2196F3',
  },
  dangerText: {
    color: 'white',
  },
  // Text size variants
  normalText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
  smallText: {
    fontSize: 14,
  },
  // Disabled state
  disabledButton: {
    backgroundColor: '#e0e0e0',
    borderColor: '#c0c0c0',
    opacity: 0.7,
  },
  disabledText: {
    color: '#a0a0a0',
  },
});
