type NoDimensions = Record<string, never>;

export type ProductEventDimensions = {
  editor_loaded: {
    readonly entryPoint: 'direct' | 'file_handler';
  };
  project_created: {
    readonly source: 'blank' | 'import' | 'guided_drawing';
  };
  project_opened: {
    readonly source: 'library' | 'file' | 'session_restore';
  };
  first_drawing_action: {
    readonly tool: 'pencil' | 'eraser' | 'fill' | 'shape' | 'other';
  };
  second_frame_created: NoDimensions;
  playback_started: NoDimensions;
  project_saved: {
    readonly destination: 'local_library' | 'download';
  };
  export_completed: {
    readonly format: 'png' | 'gif' | 'webp' | 'aseprite' | 'pixel_forge';
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

const ENTRY_POINTS = ['direct', 'file_handler'] as const;
const PROJECT_CREATION_SOURCES = ['blank', 'import', 'guided_drawing'] as const;
const PROJECT_OPEN_SOURCES = ['library', 'file', 'session_restore'] as const;
const DRAWING_TOOLS = ['pencil', 'eraser', 'fill', 'shape', 'other'] as const;
const SAVE_DESTINATIONS = ['local_library', 'download'] as const;
const EXPORT_FORMATS = ['png', 'gif', 'webp', 'aseprite', 'pixel_forge'] as const;

export function parseProductEvent(value: unknown): ProductEvent | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['name', 'dimensions'])) return undefined;
  if (!isRecord(value.dimensions)) return undefined;

  const dimensions = value.dimensions;

  switch (value.name) {
    case 'editor_loaded':
      if (!hasExactKeys(dimensions, ['entryPoint'])) return undefined;
      if (!isAllowedValue(dimensions.entryPoint, ENTRY_POINTS)) return undefined;
      return createEvent('editor_loaded', { entryPoint: dimensions.entryPoint });
    case 'project_created':
      if (!hasExactKeys(dimensions, ['source'])) return undefined;
      if (!isAllowedValue(dimensions.source, PROJECT_CREATION_SOURCES)) return undefined;
      return createEvent('project_created', { source: dimensions.source });
    case 'project_opened':
      if (!hasExactKeys(dimensions, ['source'])) return undefined;
      if (!isAllowedValue(dimensions.source, PROJECT_OPEN_SOURCES)) return undefined;
      return createEvent('project_opened', { source: dimensions.source });
    case 'first_drawing_action':
      if (!hasExactKeys(dimensions, ['tool'])) return undefined;
      if (!isAllowedValue(dimensions.tool, DRAWING_TOOLS)) return undefined;
      return createEvent('first_drawing_action', { tool: dimensions.tool });
    case 'project_saved':
      if (!hasExactKeys(dimensions, ['destination'])) return undefined;
      if (!isAllowedValue(dimensions.destination, SAVE_DESTINATIONS)) return undefined;
      return createEvent('project_saved', { destination: dimensions.destination });
    case 'export_completed':
      if (!hasExactKeys(dimensions, ['format'])) return undefined;
      if (!isAllowedValue(dimensions.format, EXPORT_FORMATS)) return undefined;
      return createEvent('export_completed', { format: dimensions.format });
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
