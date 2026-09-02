// Keep existing client imports stable while the shared workspace owns the
// persisted project contract.
export {
  PROJECT_VERSION,
  decodeProjectFile,
  decodeProjectFileWithDiagnostics,
  type ProjectCelFile,
  type ProjectCompatibilityDiagnostics,
  type ProjectFile,
  type ProjectFileDecodeResult,
  type ProjectFileInput,
  type ProjectFrameFile,
  type ProjectLayerFile,
  type ProjectPaletteEntryFile,
} from '@pixel-forge/shared';
