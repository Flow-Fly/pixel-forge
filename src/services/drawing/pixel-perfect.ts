import { type Point } from '../../tools/base-tool';

/**
 * Pixel-perfect algorithm to remove L-shapes and make lines look cleaner.
 * Based on the algorithm used in Aseprite.
 */
export class PixelPerfect {
  static apply(points: Point[]): Point[] {
    if (points.length < 3) return points;

    const newPoints = [...points];
    let i = 0;

    while (i < newPoints.length - 2) {
      const p1 = newPoints[i];
      const p2 = newPoints[i + 1];
      const p3 = newPoints[i + 2];

      if (
        (p1.x === p2.x && p2.y === p3.y) ||
        (p1.y === p2.y && p2.x === p3.x)
      ) {
        // L-shape detected, remove the corner pixel (p2)
        newPoints.splice(i + 1, 1);
        // Don't increment i, check the new sequence
      } else {
        i++;
      }
    }

    return newPoints;
  }
}
