type NoDimensions = Record<string, never>;
type AllowedValue<Values extends readonly string[]> = Values[number];

const ENTRY_POINTS = ['direct', 'file_handler'] as const;
const PROJECT_CREATION_SOURCES = ['blank', 'import', 'guided_drawing'] as const;
const PROJECT_OPEN_SOURCES = ['library', 'file', 'session_restore'] as const;
const DRAWING_TOOLS = ['pencil', 'eraser', 'fill', 'shape', 'other'] as const;
const SAVE_DESTINATIONS = ['local_library', 'download'] as const;
const EXPORT_FORMATS = ['png', 'gif', 'webp', 'aseprite', 'pixel_forge'] as const;

export type ProductEventDimensions = {
  editor_loaded: {
    readonly entryPoint: AllowedValue<typeof ENTRY_POINTS>;
  };
  project_created: {
    readonly source: AllowedValue<typeof PROJECT_CREATION_SOURCES>;
  };
  project_opened: {
    readonly source: AllowedValue<typeof PROJECT_OPEN_SOURCES>;
  };
  first_drawing_action: {
    readonly tool: AllowedValue<typeof DRAWING_TOOLS>;
  };
  second_frame_created: NoDimensions;
  playback_started: NoDimensions;
  project_saved: {
    readonly destination: AllowedValue<typeof SAVE_DESTINATIONS>;
  };
  export_completed: {
    readonly format: AllowedValue<typeof EXPORT_FORMATS>;
  };
  tutorial_started: NoDimensions;
  tutorial_completed: NoDimensions;
  tutorial_skipped: NoDimensions;
};

export type ProductEventName = keyof ProductEventDimensions;

type ProductEventFor<Name extends ProductEventName> = Readonly<{
  name: Name;
  dimensions: Readonly<ProductEventDimensions[Name]>;
}>;

export type ProductEvent = {
  [Name in ProductEventName]: ProductEventFor<Name>;
}[ProductEventName];

export function parseProductEvent(value: unknown): ProductEvent | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['name', 'dimensions'])) return undefined;
  if (!isRecord(value.dimensions)) return undefined;

  const dimensions = value.dimensions;

  switch (value.name) {
    case 'editor_loaded':
      return parseEditorLoaded(dimensions);
    case 'project_created':
      return parseProjectCreated(dimensions);
    case 'project_opened':
      return parseProjectOpened(dimensions);
    case 'first_drawing_action':
      return parseFirstDrawingAction(dimensions);
    case 'project_saved':
      return parseProjectSaved(dimensions);
    case 'export_completed':
      return parseExportCompleted(dimensions);
    case 'second_frame_created':
    case 'playback_started':
    case 'tutorial_started':
    case 'tutorial_completed':
    case 'tutorial_skipped':
      if (!hasExactKeys(dimensions, [])) return undefined;
      return createEvent(value.name, {});
    default:
      return undefined;
  }
}

function parseEditorLoaded(dimensions: Record<string, unknown>): ProductEvent | undefined {
  if (!hasExactKeys(dimensions, ['entryPoint'])) return undefined;
  if (!isAllowedValue(dimensions.entryPoint, ENTRY_POINTS)) return undefined;
  return createEvent('editor_loaded', { entryPoint: dimensions.entryPoint });
}

function parseProjectCreated(dimensions: Record<string, unknown>): ProductEvent | undefined {
  if (!hasExactKeys(dimensions, ['source'])) return undefined;
  if (!isAllowedValue(dimensions.source, PROJECT_CREATION_SOURCES)) return undefined;
  return createEvent('project_created', { source: dimensions.source });
}

function parseProjectOpened(dimensions: Record<string, unknown>): ProductEvent | undefined {
  if (!hasExactKeys(dimensions, ['source'])) return undefined;
  if (!isAllowedValue(dimensions.source, PROJECT_OPEN_SOURCES)) return undefined;
  return createEvent('project_opened', { source: dimensions.source });
}

function parseFirstDrawingAction(dimensions: Record<string, unknown>): ProductEvent | undefined {
  if (!hasExactKeys(dimensions, ['tool'])) return undefined;
  if (!isAllowedValue(dimensions.tool, DRAWING_TOOLS)) return undefined;
  return createEvent('first_drawing_action', { tool: dimensions.tool });
}

function parseProjectSaved(dimensions: Record<string, unknown>): ProductEvent | undefined {
  if (!hasExactKeys(dimensions, ['destination'])) return undefined;
  if (!isAllowedValue(dimensions.destination, SAVE_DESTINATIONS)) return undefined;
  return createEvent('project_saved', { destination: dimensions.destination });
}

function parseExportCompleted(dimensions: Record<string, unknown>): ProductEvent | undefined {
  if (!hasExactKeys(dimensions, ['format'])) return undefined;
  if (!isAllowedValue(dimensions.format, EXPORT_FORMATS)) return undefined;
  return createEvent('export_completed', { format: dimensions.format });
}

function createEvent<Name extends ProductEventName>(
  name: Name,
  dimensions: ProductEventDimensions[Name]
): ProductEventFor<Name> {
  return Object.freeze({
    name,
    dimensions: Object.freeze({ ...dimensions }),
  });
}

function isAllowedValue<const Values extends readonly string[]>(
  value: unknown,
  allowedValues: Values
): value is Values[number] {
  return typeof value === 'string' && allowedValues.some((allowed) => allowed === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
