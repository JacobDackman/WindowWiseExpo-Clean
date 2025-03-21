import { Point, AppSettings, SensorData } from '../types';

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
  
  /**
   * Process new sensor data and update the tracked points.
   */
  processSensorData(sensorData: SensorData) {
    try {
      // Update heading from magnetometer data
      if (sensorData.magnetometer) {
        this.updateHeading(sensorData.magnetometer);
      }
      
      // Handle step detection and distance calculation
      if (sensorData.pedometer && sensorData.pedometer.steps > this.stepCount) {
        const newSteps = sensorData.pedometer.steps - this.stepCount;
        this.stepCount = sensorData.pedometer.steps;
        
        // Calculate distance based on step length
        const distance = newSteps * this.settings.stepLength;
        this.totalDistance += distance;
        
        // Add a new point based on heading and distance
        this.addPointFromHeadingAndDistance(distance);
      }
      
      this.lastUpdateTime = Date.now();
      
      return true;
    } catch (error) {
      console.error('Error processing sensor data:', error);
      return false;
    }
  }
  
  /**
   * Update the current heading based on magnetometer data.
   */
  private updateHeading(magnetometer: { x: number; y: number; z: number }) {
    // Calculate heading in degrees (0-360)
    // Heading is calculated based on magnetometer's x and y values
    // atan2 returns values in the range (-PI, PI)
    const radians = Math.atan2(magnetometer.y, magnetometer.x);
    
    // Convert to degrees and normalize to 0-360
    let degrees = (radians * 180 / Math.PI) + 90;
    if (degrees < 0) {
      degrees += 360;
    }
    degrees %= 360;
    
    // Apply calibration offset
    this.heading = (degrees + this.calibrationOffset) % 360;
    
    // Optionally smooth heading with a moving average for stability
  }
  
  /**
   * Add a new point based on current heading and distance traveled.
   */
  private addPointFromHeadingAndDistance(distance: number) {
    if (this.points.length === 0) {
      this.points.push({ x: 0, y: 0 });
      return;
    }
    
    const lastPoint = this.points[this.points.length - 1];
    
    // Convert heading to radians for trig functions
    const radians = this.heading * (Math.PI / 180);
    
    // Calculate new point using trigonometry
    // In this coordinate system:
    // - x increases to the right
    // - y increases going up
    // - heading 0 is north (up), increases clockwise
    const newX = lastPoint.x + distance * Math.sin(radians);
    const newY = lastPoint.y + distance * Math.cos(radians);
    
    this.points.push({
      x: newX,
      y: newY
    });
    
    // Check if we should simplify the points
    if (this.points.length > 100) {
      this.simplifyPoints();
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
