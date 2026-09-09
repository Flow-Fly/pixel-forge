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
}

export const siteString = (maxLength = 256): SiteSchema => ({ type: 'string', minLength: 1, maxLength });
export const siteInteger = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER): SiteSchema => ({ type: 'integer', minimum, maximum });
export const siteEnum = (values: readonly string[]): SiteSchema => ({ type: 'string', enum: values });
export const siteArray = (items: SiteSchema, maxItems: number, minItems = 0): SiteSchema => ({ type: 'array', items, minItems, maxItems });
export const siteObject = (properties: Readonly<Record<string, SiteSchema>>, optional: readonly string[] = []): SiteSchema => ({
  type: 'object', properties, required: Object.keys(properties).filter((key) => !optional.includes(key)), additionalProperties: false,
});

/** Validation and published schemas use the same bounded definitions. */
export function matchesSiteSchema(value: unknown, schema: SiteSchema, depth = 0): boolean {
  if (depth > 24) return false;
  if (schema.oneOf) return schema.oneOf.filter((item) => matchesSiteSchema(value, item, depth + 1)).length === 1;
  if ('const' in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value as string)) return false;
  switch (schema.type) {
    case 'null': return value === null;
    case 'boolean': return typeof value === 'boolean';
    case 'integer':
    case 'number': return typeof value === 'number' && Number.isFinite(value)
      && (schema.type !== 'integer' || Number.isSafeInteger(value))
      && value >= (schema.minimum ?? -Number.MAX_VALUE) && value <= (schema.maximum ?? Number.MAX_VALUE);
    case 'string': return typeof value === 'string' && value.length >= (schema.minLength ?? 0)
      && value.length <= (schema.maxLength ?? Number.MAX_SAFE_INTEGER)
      && (!schema.pattern || new RegExp(schema.pattern).test(value));
    case 'array': return Array.isArray(value) && value.length >= (schema.minItems ?? 0)
      && value.length <= (schema.maxItems ?? 0) && !!schema.items
      && value.every((item) => matchesSiteSchema(item, schema.items!, depth + 1))
      && (!schema.uniqueItems || new Set(value.map((item) => JSON.stringify(item))).size === value.length);
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
      const record = value as Record<string, unknown>;
      return Object.keys(record).every((key) => !!schema.properties?.[key])
        && (schema.required ?? []).every((key) => Object.hasOwn(record, key))
        && Object.entries(record).every(([key, child]) => matchesSiteSchema(child, schema.properties![key], depth + 1));
    }
    default: return 'const' in schema || !!schema.enum;
  }
}
