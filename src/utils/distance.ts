interface Point {
  x: number;
  y: number;
}

export function calculateDistance(point1: Point, point2: Point): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculatePosition(
  accelerometer: { x: number; y: number; z: number },
  magnetometer: { x: number; y: number; z: number }
): Point {
  // Calculate heading from magnetometer data
  const heading = Math.atan2(magnetometer.y, magnetometer.x);
  
  // Calculate acceleration magnitude in the horizontal plane
  const horizontalAccel = Math.sqrt(
    accelerometer.x * accelerometer.x + accelerometer.y * accelerometer.y
  );
  
  // Convert heading and acceleration to x,y coordinates
  return {
    x: horizontalAccel * Math.cos(heading),
    y: horizontalAccel * Math.sin(heading),
  };
} 