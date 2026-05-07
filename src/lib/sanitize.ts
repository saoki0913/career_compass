export const REDACTED_VALUE = "[REDACTED]" as const;
const DROPPED_VALUE = "[DROPPED]" as const;

export type ScrubbedJson =
  | null
  | boolean
  | number
  | string
  | ScrubbedJson[]
  | { [key: string]: ScrubbedJson };

export interface ScrubOptions {
  maxDepth?: number;
  maxStringLength?: number;
}

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_STRING_LENGTH = 2000;

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /sk-ant-[a-zA-Z0-9-]{20,}/g,
  /whsec_[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{12,}/gi,
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /(?:better-auth\.session_token|guest_device_token|csrf_token|x-device-token|stripe-signature)=?["\s:]*[a-zA-Z0-9._:-]{8,}/gi,
  /(?:access|refresh|session|device|api|secret|token|password|authorization|cookie)["'\s:=]+[a-zA-Z0-9._:/+=-]{8,}/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
];

const DROP_KEY_PATTERNS = [
  /^(authorization|cookie|set-cookie|x-device-token|x-career-principal|stripe-signature)$/i,
  /(password|secret|token|cookie|authorization|signature|credential|api[_-]?key)/i,
  /^(body|rawBody|requestBody|responseBody|query|prompt|completion|messages|content|answer|draft|essay|esText|gakuchika|motivation)$/i,
];

const FREE_TEXT_KEY_PATTERNS = /^(message|value)$/i;

export function redactSensitive(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED_VALUE);
  }
  return truncate(result, DEFAULT_MAX_STRING_LENGTH);
}

export function scrubObject(value: unknown, options: ScrubOptions = {}): ScrubbedJson {
  return scrubValue(value, {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
  }, 0);
}

function scrubValue(
  value: unknown,
  options: Required<ScrubOptions>,
  depth: number,
  key?: string,
): ScrubbedJson {
  if (key && shouldDropKey(key)) {
    return DROPPED_VALUE;
  }
  if (key && typeof value === "string" && FREE_TEXT_KEY_PATTERNS.test(key)) {
    return redactSensitive(value) === value ? "[SCRUBBED_TEXT]" : redactSensitive(value);
  }
  if (depth > options.maxDepth) {
    return "[MAX_DEPTH]";
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return truncate(redactSensitive(value), options.maxStringLength);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(redactSensitive(value.message), options.maxStringLength),
      stack: process.env.NODE_ENV === "development" && value.stack
        ? truncate(redactSensitive(value.stack), options.maxStringLength)
        : null,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, options, depth + 1));
  }
  if (typeof value === "object") {
    const output: { [key: string]: ScrubbedJson } = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      output[entryKey] = scrubValue(entryValue, options, depth + 1, entryKey);
    }
    return output;
  }
  return String(value);
}

function shouldDropKey(key: string): boolean {
  return DROP_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...[TRUNCATED]`;
}
