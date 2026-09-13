/**
 * Shared type and constant definitions for the Pomodoro Focus Tracker.
 *
 * These are documentation-only JSDoc typedefs plus a couple of shared
 * constants. No runtime logic lives here — behavior is implemented in the
 * individual modules (engine, settings, tracking, view, app).
 *
 * All models are plain in-memory JavaScript objects. Nothing here is
 * serialized to persistent storage (Req 6.3, 6.4).
 */

/**
 * The kind of countdown interval currently active.
 *
 * @typedef {("focus" | "short_break" | "long_break")} PeriodType
 */

/**
 * Enumeration of the valid {@link PeriodType} values.
 *
 * @readonly
 * @enum {PeriodType}
 */
export const PERIOD_TYPES = Object.freeze({
  FOCUS: /** @type {PeriodType} */ ("focus"),
  SHORT_BREAK: /** @type {PeriodType} */ ("short_break"),
  LONG_BREAK: /** @type {PeriodType} */ ("long_break"),
});

/**
 * User-configurable durations (in minutes) and the long-break interval.
 * Durations accept whole numbers 1–120; the interval accepts 1–12 (Req 1).
 *
 * @typedef {Object} Config
 * @property {number} focusMinutes       Focus_Duration in minutes.
 * @property {number} shortBreakMinutes  Short_Break_Duration in minutes.
 * @property {number} longBreakMinutes   Long_Break_Duration in minutes.
 * @property {number} longBreakInterval  Focus periods before a long break.
 */

/**
 * The Timer_Engine's in-memory state (Req 2, 3).
 *
 * @typedef {Object} EngineState
 * @property {PeriodType} periodType      Current Period.
 * @property {number} remainingSeconds    Remaining time of current Period, in seconds.
 * @property {boolean} isRunning          Whether the countdown is active.
 * @property {number} focusSinceLongBreak Completed Focus_Periods since last Long_Break_Period.
 * @property {Config} config              Snapshot of durations used to seed new periods.
 */

/**
 * Productivity totals for the current page session (Req 4).
 *
 * @typedef {Object} Tracking
 * @property {number} sessionCount       Completed Focus_Periods this page session.
 * @property {number} totalFocusMinutes  Sum of Focus_Duration of completed focus periods.
 */

/**
 * Result of validating a single Settings_Panel field (Req 1.5).
 * On success `value` is present; on failure `message` is present.
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} ok          Whether the input was accepted.
 * @property {number} [value]      Parsed whole-number value when `ok` is true.
 * @property {string} [message]    Field + range message when `ok` is false.
 */

/**
 * Event emitted by the engine when a Period countdown reaches zero (Req 3, 4, 5).
 *
 * @typedef {Object} Transition
 * @property {PeriodType} completedPeriod    Period that just reached zero.
 * @property {number} completedFocusMinutes  Focus_Duration of the completed focus period (focus only).
 * @property {PeriodType} nextPeriod         Newly started Period.
 */

export {};
