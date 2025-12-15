/**
 * Custom palette saved by user
 */
export interface CustomPalette {
  id: string;
  name: string;
  colors: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Stored format in IndexedDB
 */
export interface StoredCustomPalette {
  id: string;
  name: string;
  colors: string[];
  createdAt: number;
  updatedAt: number;
}
