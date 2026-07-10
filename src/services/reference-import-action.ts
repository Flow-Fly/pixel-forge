import type { ProjectContext } from '../stores/project-context';
import type { Layer } from '../types/layer';

const SUPPORTED_REFERENCE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const REFERENCE_IMAGE_TYPE_BY_EXTENSION = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

export async function importReferenceImageFile(
  context: ProjectContext,
  file: File
): Promise<Layer | null> {
  const mimeType = getSupportedReferenceImageType(file);
  if (!mimeType) return null;

  const layer = await context.layers.addReferenceLayerFromFile(
    normalizeReferenceImageFile(file, mimeType),
    context.project.width.value,
    context.project.height.value
  );
  context.dirtyRect.requestFullRedraw();
  return layer;
}

export function isSupportedReferenceImageFile(file: File): boolean {
  return getSupportedReferenceImageType(file) !== null;
}

function getSupportedReferenceImageType(file: File): string | null {
  const type = file.type.toLowerCase();
  if (SUPPORTED_REFERENCE_IMAGE_TYPES.has(type)) return type;

  return REFERENCE_IMAGE_TYPE_BY_EXTENSION.get(getFileExtension(file.name)) ?? null;
}

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function normalizeReferenceImageFile(file: File, mimeType: string): File {
  if (file.type === mimeType) return file;

  return new File([file], file.name, {
    lastModified: file.lastModified,
    type: mimeType,
  });
}
