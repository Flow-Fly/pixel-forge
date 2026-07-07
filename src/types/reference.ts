export type ReferenceLayerPosition = 'above' | 'below';

export interface ReferenceLayerData {
  /** v4.0+: original imported PNG/JPEG bytes, unchanged by editing. */
  bytes: Uint8Array;
  /** v4.0+: source MIME type, such as image/png or image/jpeg. */
  mimeType: string;
  /** v4.0+: canvas-space top-left position. */
  x: number;
  y: number;
  /** v4.0+: uniform image scale; non-integer values are valid. */
  scale: number;
  /** v4.0+: render as grayscale in reference overlays. */
  desaturate?: boolean;
  /** v4.0+: reference layer placement relative to artwork. Defaults to below. */
  position?: ReferenceLayerPosition;
}
