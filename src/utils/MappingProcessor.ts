import { Point, AppSettings, SensorData } from '../types';
import { ENV } from '../config/env';

/**
 * The MappingProcessor handles the conversion of raw sensor data
 * into a series of points that represent walls.
 */
export class MappingProcessor {
  private settings: AppSettings;
  private points: Point[] = [];
  private heading: number = 0;
  private lastUpdateTime: number = 0;
  private calibrationOffset: number = 0;
  private stepCount: number = 0;
  private totalDistance: number = 0;
  
  constructor(settings: AppSettings) {
    this.settings = settings;
    this.reset();
  }
  
  /**
   * Reset all tracking data.
   */
  reset() {
    this.points = [];
    this.heading = 0;
    this.lastUpdateTime = Date.now();
    this.calibrationOffset = 0;
    this.stepCount = 0;
    this.totalDistance = 0;
    
    // Start with a single point at the origin
    this.points.push({ x: 0, y: 0 });
  }
  
  private validateSensorData(sensorData: SensorData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for required sensor data
    if (!sensorData.accelerometer) {
      errors.push('Missing accelerometer data');
    }
    if (!sensorData.magnetometer) {
      errors.push('Missing magnetometer data');
    }
    if (!sensorData.gyroscope) {
      errors.push('Missing gyroscope data');
    }

    // Validate data quality
    if (sensorData.accelerometer) {
      const { x, y, z } = sensorData.accelerometer;
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        errors.push('Invalid accelerometer values');
      }
    }
    if (sensorData.magnetometer) {
      const { x, y, z } = sensorData.magnetometer;
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        errors.push('Invalid magnetometer values');
      }
    }
    if (sensorData.gyroscope) {
      const { x, y, z } = sensorData.gyroscope;
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        errors.push('Invalid gyroscope values');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Process new sensor data and update the tracked points.
   */
  processSensorData(sensorData: SensorData) {
    try {
      // Validate sensor data
      const validation = this.validateSensorData(sensorData);
      if (!validation.isValid) {
        if (ENV.ENABLE_DEBUG_LOGGING) {
          console.warn('Sensor data validation failed:', validation.errors);
        }
        return {
          success: false,
          errors: validation.errors
        };
      }

      // Process magnetometer data for heading
      let currentHeading: number | null = null;
      let currentMovement: { distance: number; direction: number } | null = null;
      let currentRotation: number | null = null;

      if (sensorData.magnetometer) {
        currentHeading = this.calculateHeading(sensorData.magnetometer);
        if (currentHeading === null) {
          throw new Error('Failed to calculate heading from magnetometer data');
        }
      }

      // Process accelerometer data for movement
      if (sensorData.accelerometer) {
        currentMovement = this.calculateMovement(sensorData.accelerometer);
        if (currentMovement === null) {
          throw new Error('Failed to calculate movement from accelerometer data');
        }
      }

      // Process gyroscope data for rotation
      if (sensorData.gyroscope) {
        currentRotation = this.calculateRotation(sensorData.gyroscope);
        if (currentRotation === null) {
          throw new Error('Failed to calculate rotation from gyroscope data');
        }
      }

      return {
        success: true,
        heading: currentHeading,
        movement: currentMovement,
        rotation: currentRotation
      };

    } catch (error) {
      if (ENV.ENABLE_DEBUG_LOGGING) {
        console.error('Error processing sensor data:', error);
      }
      return {
        success: false,
        errors: [(error as Error).message]
      };
    }
  }
  
  private calculateHeading(magnetometerData: { x: number; y: number; z: number }): number | null {
    try {
      // Implementation of heading calculation
      const heading = Math.atan2(magnetometerData.y, magnetometerData.x);
      return (heading * 180 / Math.PI + 360) % 360;
    } catch (error) {
      if (ENV.ENABLE_DEBUG_LOGGING) {
        console.error('Error calculating heading:', error);
      }
      return null;
    }
  }
  
  private calculateMovement(accelerometerData: { x: number; y: number; z: number }): { distance: number; direction: number } | null {
    try {
      // Implementation of movement calculation
      const magnitude = Math.sqrt(
        accelerometerData.x * accelerometerData.x +
        accelerometerData.y * accelerometerData.y
      );
      
      const direction = Math.atan2(accelerometerData.y, accelerometerData.x);
      return {
        distance: magnitude * ENV.STEP_LENGTH,
        direction: (direction * 180 / Math.PI + 360) % 360
      };
    } catch (error) {
      if (ENV.ENABLE_DEBUG_LOGGING) {
        console.error('Error calculating movement:', error);
      }
      return null;
    }
  }
  
  private calculateRotation(gyroscopeData: { x: number; y: number; z: number }): number | null {
    try {
      // Implementation of rotation calculation
      return (Math.atan2(gyroscopeData.y, gyroscopeData.x) * 180 / Math.PI + 360) % 360;
    } catch (error) {
      if (ENV.ENABLE_DEBUG_LOGGING) {
        console.error('Error calculating rotation:', error);
      }
      return null;
    }
  }
  
  /**
   * Check for a potential loop closure.
   * Returns true if the current path forms a closed loop.
   */
  checkLoopClosure(): boolean {
    if (this.points.length < 10) {
      return false; // Need at least 10 points for a meaningful loop
    }
    
    const startPoint = this.points[0];
    const currentPoint = this.points[this.points.length - 1];
    
    // Calculate distance between first and current point
    const distance = Math.sqrt(
      Math.pow(currentPoint.x - startPoint.x, 2) +
      Math.pow(currentPoint.y - startPoint.y, 2)
    );
    
    // Consider a loop closed if the end point is within 0.5 meters of the start
    const isLoopClosed = distance < 0.5;
    
    return isLoopClosed;
  }
  
  /**
   * Close the loop by adding a final point that connects to the start point.
   * Returns the final simplified points.
   */
  closeLoop(): Point[] {
    if (this.points.length < 3) {
      return this.points;
    }
    
    // Add a copy of the first point to close the loop
    this.points.push({ ...this.points[0] });
    
    // Simplify the final points
    return this.simplifyPoints();
  }
  
  /**
   * Simplify the current points to reduce noise and complexity.
   * Uses a basic distance-based algorithm.
   */
  private simplifyPoints(): Point[] {
    if (this.points.length < 3) {
      return this.points;
    }
    
    // Simplified points will always include the first and last point
    const simplified: Point[] = [this.points[0]];
    
    // Tolerance for simplification (in meters)
    const tolerance = 0.1;
    
    // Douglas-Peucker simplification algorithm
    const douglasPeuckerSimplify = (
      points: Point[],
      startIndex: number,
      endIndex: number,
      tolerance: number
    ) => {
      if (endIndex <= startIndex + 1) {
        return;
      }
      
      let maxDistance = 0;
      let maxIndex = 0;
      
      const startPoint = points[startIndex];
      const endPoint = points[endIndex];
      
      // Line from start to end
      const lineLength = Math.sqrt(
        Math.pow(endPoint.x - startPoint.x, 2) +
        Math.pow(endPoint.y - startPoint.y, 2)
      );
      
      // Check distance of each point from the line
      for (let i = startIndex + 1; i < endIndex; i++) {
        const point = points[i];
        
        // Calculate distance from point to line
        let distance;
        
        if (lineLength === 0) {
          // If start and end are the same point, use distance to that point
          distance = Math.sqrt(
            Math.pow(point.x - startPoint.x, 2) +
            Math.pow(point.y - startPoint.y, 2)
          );
        } else {
          // Distance from point to line using the formula:
          // d = ||(p - a) × (b - a)|| / ||b - a||
          const cross = (point.x - startPoint.x) * (endPoint.y - startPoint.y) -
                       (point.y - startPoint.y) * (endPoint.x - startPoint.x);
          distance = Math.abs(cross / lineLength);
        }
        
        if (distance > maxDistance) {
          maxDistance = distance;
          maxIndex = i;
        }
      }
      
      // If the maximum distance is greater than our tolerance,
      // recursively simplify the two segments
      if (maxDistance > tolerance) {
        douglasPeuckerSimplify(points, startIndex, maxIndex, tolerance);
        simplified.push(points[maxIndex]);
        douglasPeuckerSimplify(points, maxIndex, endIndex, tolerance);
      }
    };
    
    // Run the simplification algorithm
    douglasPeuckerSimplify(this.points, 0, this.points.length - 1, tolerance);
    
    // Add the last point
    simplified.push(this.points[this.points.length - 1]);
    
    // Update the points with the simplified version
    this.points = [...simplified].sort((a, b) => {
      const indexA = this.points.findIndex(p => p.x === a.x && p.y === a.y);
      const indexB = this.points.findIndex(p => p.x === b.x && p.y === b.y);
      return indexA - indexB;
    });
    
    return this.points;
  }
  
  /**
   * Get the current collection of points.
   */
  getPoints(): Point[] {
    return [...this.points];
  }
  
  /**
   * Get the current heading.
   */
  getCurrentHeading(): number {
    return this.heading;
  }
  
  /**
   * Get the total distance traveled.
   */
  getTotalDistance(): number {
    return this.totalDistance;
  }
  
  /**
   * Calibrate the compass by setting a reference direction.
   */
  calibrate(currentHeading: number) {
    // If currentHeading should be interpreted as North (0 degrees),
    // calculate the offset needed
    this.calibrationOffset = (360 - currentHeading) % 360;
  }
}
