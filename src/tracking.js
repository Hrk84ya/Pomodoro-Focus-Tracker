/**
 * Tracking module — Session_Count and Total_Focus_Time accumulation.
 *
 * Owns the zeroed initial tracking state and `recordFocusCompletion`. All
 * state is a plain in-memory object (Req 6.3, 6.4) and every operation is
 * pure: `recordFocusCompletion` returns a NEW object rather than mutating its
 * input, so reset (which simply keeps the existing tracking object) never
 * changes Session_Count or Total_Focus_Time (Req 4.6).
 *
 * @typedef {import("./types.js").Tracking} Tracking
 */

/**
 * Create a fresh, zeroed tracking state (Req 4.5).
 *
 * A factory is used (instead of a shared constant) so each caller gets its
 * own object and there is no accidental shared mutable state.
 *
 * @returns {Tracking} `{ sessionCount: 0, totalFocusMinutes: 0 }`
 */
export function createTracking() {
  return {
    sessionCount: 0,
    totalFocusMinutes: 0,
  };
}

/**
 * Record the completion of a Focus_Period (Req 4.1, 4.2).
 *
 * Returns a NEW tracking object with `sessionCount` incremented by 1 and
 * `totalFocusMinutes` increased by the completed period's `focusMinutes`.
 * The input `tracking` is never mutated, which is what allows reset to leave
 * tracking totals untouched (Req 4.6).
 *
 * @param {Tracking} tracking     Current tracking totals.
 * @param {number} focusMinutes   Focus_Duration of the completed focus period.
 * @returns {Tracking}            New tracking totals.
 */
export function recordFocusCompletion(tracking, focusMinutes) {
  return {
    sessionCount: tracking.sessionCount + 1,
    totalFocusMinutes: tracking.totalFocusMinutes + focusMinutes,
  };
}
