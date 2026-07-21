// Keep existing client imports stable while the shared workspace owns the
// persisted project contract.
export {
  PROJECT_VERSION,
  decodeProjectFile,
  type ProjectCelFile,
  type ProjectFile,
  type ProjectFileInput,
  type ProjectFrameFile,
  type ProjectLayerFile,
} from '@pixel-forge/shared';
