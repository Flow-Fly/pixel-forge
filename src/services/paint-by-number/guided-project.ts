import { v4 as uuidv4 } from 'uuid';
import { normalizeProjectName } from '../project-defaults';
import { workspaceStore, type WorkspaceProjectOptions } from '../../stores/workspace';
import {
  GUIDED_DRAWING_VERSION,
  type GuidedDrawingSettings,
} from '../../types/guided-drawing';
import { PROJECT_VERSION, type ProjectFile } from '../../types/project';
import type { NumberedGuide } from './guide-generator';

export interface GuidedProjectInput {
  guide: NumberedGuide;
  settings: GuidedDrawingSettings;
  name?: string;
  sourceName?: string;
  createdAt?: number;
}

interface GuidedProjectWorkspace {
  createProjectFromFile(
    project: ProjectFile,
    options?: WorkspaceProjectOptions,
  ): ReturnType<typeof workspaceStore.createProjectFromFile>;
}

export function createGuidedProjectFile(input: GuidedProjectInput): ProjectFile {
  validateGuide(input.guide);

  const layerId = uuidv4();
  const frameId = uuidv4();
  const { guide } = input;

  return {
    version: PROJECT_VERSION,
    name: normalizeProjectName(input.name ?? defaultGuidedProjectName(input.sourceName)),
    width: guide.width,
    height: guide.height,
    palette: [...guide.palette],
    layers: [
      {
        id: layerId,
        name: 'Painting',
        type: 'image',
        visible: true,
        opacity: 255,
        blendMode: 'normal',
        continuous: false,
        data: new Uint8Array(0),
      },
    ],
    frames: [
      {
        id: frameId,
        duration: 100,
        cels: [
          {
            layerId,
            data: new Uint8Array(0),
            indexData: Array.from(new Uint8Array(guide.width * guide.height)),
          },
        ],
      },
    ],
    animation: {
      fps: 12,
      currentFrameIndex: 0,
    },
    tags: [],
    guidedDrawing: {
      version: GUIDED_DRAWING_VERSION,
      width: guide.width,
      height: guide.height,
      target: Array.from(guide.target),
      guideColorCount: guide.palette.length,
      settings: cloneSettings(input.settings),
      sourceName: input.sourceName,
      createdAt: input.createdAt ?? Date.now(),
    },
  };
}

export async function createGuidedProject(
  input: GuidedProjectInput,
  options: WorkspaceProjectOptions = {},
  workspace: GuidedProjectWorkspace = workspaceStore,
) {
  return workspace.createProjectFromFile(createGuidedProjectFile(input), {
    activate: options.activate ?? true,
    saveActiveContext: options.saveActiveContext ?? true,
  });
}

function validateGuide(guide: NumberedGuide): void {
  if (guide.width < 1 || guide.height < 1) {
    throw new RangeError('A guided project needs positive dimensions');
  }
  if (guide.target.length !== guide.width * guide.height) {
    throw new RangeError('Guide target does not match its dimensions');
  }
  if (guide.palette.length < 1) {
    throw new RangeError('A guided project needs at least one paint color');
  }

  for (const index of guide.target) {
    if (index > guide.palette.length) {
      throw new RangeError('Guide target contains an unknown palette index');
    }
  }
}

function cloneSettings(settings: GuidedDrawingSettings): GuidedDrawingSettings {
  return {
    ...settings,
    restrictedPalette: settings.restrictedPalette
      ? [...settings.restrictedPalette]
      : undefined,
  };
}

function defaultGuidedProjectName(sourceName?: string): string {
  const baseName = sourceName?.replace(/\.[^.]+$/, '').trim();
  return baseName ? `${baseName} guide` : 'Guided drawing';
}
