import type { ProjectContext } from '../stores/project-context';
import { importReferenceImageFile } from './reference-import-action';

const REFERENCE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

export function openReferenceImagePicker(
  context: ProjectContext,
  onError: (error: unknown) => void,
  onImported: () => void = () => {}
) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = REFERENCE_IMAGE_ACCEPT;

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      await importReferenceImageFile(context, file);
      onImported();
    } catch (error) {
      onError(error);
    }
  };

  input.click();
}
