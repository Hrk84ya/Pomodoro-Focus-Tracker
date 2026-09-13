/**
 * Settings module — configuration values, validation, and the running-lock rule.
 *
 * Owns DEFAULTS, RANGES, `validateField`, and `applySetting`. See tasks 2.1
 * and 2.3 for the implementations.
 *
 * @typedef {import("./types.js").Config} Config
 * @typedef {import("./types.js").ValidationResult} ValidationResult
 */

/**
 * Default configuration values displayed when the Timer_App loads (Req 1.2).
 *
 * @type {Readonly<Config>}
 */
export const DEFAULTS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
});

/**
 * Inclusive accepted ranges per field: durations 1–120 minutes (Req 1.3),
 * the long-break interval 1–12 (Req 1.4).
 *
 * @type {Readonly<Record<keyof Config, { min: number, max: number }>>}
 */
export const RANGES = Object.freeze({
  focusMinutes: Object.freeze({ min: 1, max: 120 }),
  shortBreakMinutes: Object.freeze({ min: 1, max: 120 }),
  longBreakMinutes: Object.freeze({ min: 1, max: 120 }),
  longBreakInterval: Object.freeze({ min: 1, max: 12 }),
});

/**
 * Human-readable label for each configurable field, used in validation
 * messages so the user can identify the affected field (Req 1.5).
 *
 * @type {Readonly<Record<keyof Config, string>>}
 */
const FIELD_LABELS = Object.freeze({
  focusMinutes: "Focus duration",
  shortBreakMinutes: "Short break duration",
  longBreakMinutes: "Long break duration",
  longBreakInterval: "Long break interval",
});

/**
 * Builds a rejection {@link ValidationResult} carrying a message that names
 * the affected field and its accepted inclusive range (Req 1.5).
 *
 * @param {keyof Config} field
 * @param {number} min
 * @param {number} max
 * @returns {ValidationResult}
 */
function reject(field, min, max) {
  const label = FIELD_LABELS[field] ?? field;
  return {
    ok: false,
    message: `${label} must be a whole number from ${min} to ${max}.`,
  };
}

/**
 * Validates a single Settings_Panel field. Returns `{ ok: true, value }` when
 * `raw` represents a whole number within the field's inclusive range, else
 * `{ ok: false, message }` naming the field and its range (Req 1.3, 1.4, 1.5).
 *
 * Rejects empty, non-numeric, fractional, and out-of-range values.
 *
 * @param {keyof Config} field  Which configurable field is being validated.
 * @param {unknown} raw         The raw submitted input (typically a string).
 * @returns {ValidationResult}
 */
export function validateField(field, raw) {
  const range = RANGES[field];
  if (!range) {
    return { ok: false, message: `Unknown field: ${String(field)}.` };
  }
  const { min, max } = range;

  const trimmed = String(raw).trim();
  if (trimmed === "") return reject(field, min, max);

  // Require a plain decimal integer literal. This rejects alternate numeric
  // forms that `Number(...)` would otherwise silently coerce — hex ("0x10"),
  // exponent ("1e2"), binary ("0b101"), octal ("0o17") — because Req 1.3/1.4
  // describe whole-number DECIMAL minute/number entry (Req 1.5).
  if (!/^[+-]?\d+$/.test(trimmed)) return reject(field, min, max);

  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return reject(field, min, max);
  if (n < min || n > max) return reject(field, min, max);

  return { ok: true, value: n };
}

/**
 * Result of attempting to apply a single Settings_Panel change.
 *
 * @typedef {Object} ApplyResult
 * @property {Config} config       The resulting configuration; the original,
 *                                 unchanged config on any rejection.
 * @property {boolean} accepted    Whether the change was accepted and applied.
 * @property {string|null} message Rejection reason, or `null` on acceptance.
 */

/**
 * Attempts to apply a single field change to `config`, enforcing the
 * running-lock rule and field validation. The input `config` is never mutated;
 * on acceptance a new object is returned with the field updated.
 *
 * - WHILE the timer is running, the change is rejected and the config is left
 *   unchanged, with a running-lock message (Req 1.6, 1.8).
 * - ELSE the value is validated via {@link validateField}. On failure the
 *   config is left unchanged and the validation message is returned (Req 1.5).
 *   On success a new config with the parsed value is returned (Req 1.7).
 *
 * @param {Config} config       The current stored configuration.
 * @param {keyof Config} field  Which configurable field is being changed.
 * @param {unknown} raw         The raw submitted input (typically a string).
 * @param {boolean} isRunning   Whether the Timer_Engine is currently running.
 * @returns {ApplyResult}
 */
export function applySetting(config, field, raw, isRunning) {
  if (isRunning) {
    return {
      config,
      accepted: false,
      message: "settings cannot be changed while the timer is running",
    };
  }

  const result = validateField(field, raw);
  if (!result.ok) {
    return { config, accepted: false, message: result.message };
  }

  return {
    config: { ...config, [field]: result.value },
    accepted: true,
    message: null,
  };
}
