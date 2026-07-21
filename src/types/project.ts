// Keep existing client imports stable while the shared workspace owns the
// persisted project contract.
export {
  PROJECT_VERSION,
  assertProjectFile,
  decodeProjectFile,
  type LegacyProjectImageData,
  type ProjectCelFile,
  type ProjectCelFileInput,
  type ProjectFile,
  type ProjectFileInput,
  type ProjectFrameFile,
  type ProjectFrameFileInput,
  type ProjectImageData,
  type ProjectLayerFile,
  type ProjectLayerFileInput,
} from '@pixel-forge/shared';
