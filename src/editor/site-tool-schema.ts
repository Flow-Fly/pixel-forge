/** The deliberately small JSON Schema subset used by the public site tools. */
export interface SiteSchema {
  readonly type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean' | 'null';
  readonly properties?: Readonly<Record<string, SiteSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
  readonly items?: SiteSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly const?: string | number | boolean | null;
  readonly enum?: readonly (string | number)[];
  readonly oneOf?: readonly SiteSchema[];
  readonly allOf?: readonly SiteSchema[];
  readonly contains?: SiteSchema;
}

export const siteString = (maxLength = 256): SiteSchema => ({
  type: 'string',
  minLength: 1,
  maxLength,
});
export const siteInteger = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER): SiteSchema => ({
  type: 'integer',
  minimum,
  maximum,
});
export const siteEnum = (values: readonly string[]): SiteSchema => ({
  type: 'string',
  enum: values,
});
export const siteArray = (items: SiteSchema, maxItems: number, minItems = 0): SiteSchema => ({
  type: 'array',
  items,
  minItems,
  maxItems,
});
export const siteObject = (
  properties: Readonly<Record<string, SiteSchema>>,
  optional: readonly string[] = []
): SiteSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
  additionalProperties: false,
});

/** Validation and published schemas use the same bounded definitions. */
export function matchesSiteSchema(value: unknown, schema: SiteSchema, depth = 0): boolean {
  if (depth > 24) return false;
  if (
    schema.oneOf &&
    schema.oneOf.filter((item) => matchesSiteSchema(value, item, depth + 1)).length !== 1
  )
    return false;
  if (schema.allOf && !schema.allOf.every((item) => matchesSiteSchema(value, item, depth + 1)))
    return false;
  if (
    schema.contains &&
    (!Array.isArray(value) ||
      !value.some((item) => matchesSiteSchema(item, schema.contains!, depth + 1)))
  )
    return false;
  if ('const' in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value as string)) return false;
  return matchesSchemaType(value, schema, depth);
}

function matchesSchemaType(value: unknown, schema: SiteSchema, depth: number): boolean {
  switch (schema.type) {
    case 'null':
      return value === null;
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
    case 'number':
      return matchesNumber(value, schema);
    case 'string':
      return matchesString(value, schema);
    case 'array':
      return matchesArray(value, schema, depth);
    case 'object':
      return matchesObject(value, schema, depth);
    default:
      return ['const', 'enum', 'oneOf', 'allOf', 'contains'].some((key) => Object.hasOwn(schema, key));
  }
}

function matchesNumber(value: unknown, schema: SiteSchema): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (schema.type === 'integer' && !Number.isSafeInteger(value)) return false;
  return (
    value >= (schema.minimum ?? -Number.MAX_VALUE) && value <= (schema.maximum ?? Number.MAX_VALUE)
  );
}

function matchesString(value: unknown, schema: SiteSchema): boolean {
  if (typeof value !== 'string') return false;
  if (
    value.length < (schema.minLength ?? 0) ||
    value.length > (schema.maxLength ?? Number.MAX_SAFE_INTEGER)
  )
    return false;
  return !schema.pattern || new RegExp(schema.pattern).test(value);
}

function matchesArray(value: unknown, schema: SiteSchema, depth: number): boolean {
  if (!Array.isArray(value) || !schema.items) return false;
  if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 0)) return false;
  if (
    schema.uniqueItems &&
    new Set(value.map((item) => JSON.stringify(item))).size !== value.length
  )
    return false;
  return value.every((item) => matchesSiteSchema(item, schema.items!, depth + 1));
}

function matchesObject(value: unknown, schema: SiteSchema, depth: number): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype || !schema.properties) return false;
  const record = value as Record<string, unknown>;
  if (!Object.keys(record).every((key) => Object.hasOwn(schema.properties!, key))) return false;
  if (!(schema.required ?? []).every((key) => Object.hasOwn(record, key))) return false;
  return Object.entries(record).every(([key, child]) =>
    matchesSiteSchema(child, schema.properties![key], depth + 1)
  );
}
