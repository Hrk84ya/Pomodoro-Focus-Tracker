/**
 * Timer_Engine — pure state machine owning period cycling and countdown.
 *
 * Kept free of DOM/audio side effects so it is deterministic and testable.
 * Commands: start, pause, reset, tick. See tasks 3.1 and 3.3 for the
 * implementations.
 *
 * @typedef {import("./types.js").PeriodType} PeriodType
 * @typedef {import("./types.js").Config} Config
 * @typedef {import("./types.js").EngineState} EngineState
 * @typedef {import("./types.js").Transition} Transition
 */

import { PERIOD_TYPES } from "./types.js";

/** Seconds per minute — new periods seed `remainingSeconds` from minutes. */
const SECONDS_PER_MINUTE = 60;

/**
 * Create the initial Timer_Engine state seeded from a {@link Config}.
 *
 * The engine begins stopped on a Focus_Period whose remaining time equals the
 * configured Focus_Duration (focusMinutes × 60), with no focus periods yet
 * completed toward the next long break (Req 1.2, 2.2, 6.6).
 *
 * The provided config is snapshotted (shallow-copied) so later external
 * mutations of the caller's object do not leak into engine state.
 *
 * @param {Config} config Durations + interval used to seed new periods.
 * @returns {EngineState} A fresh, stopped focus-period engine state.
 */
export function createEngine(config) {
  return {
    periodType: PERIOD_TYPES.FOCUS,
    remainingSeconds: config.focusMinutes * SECONDS_PER_MINUTE,
    isRunning: false,
    focusSinceLongBreak: 0,
    config: { ...config },
  };
}

/**
 * Begin counting down the current Period from its remaining time (Req 2.2).
 *
 * If the engine is already running, this is a no-op that leaves the remaining
 * time unchanged (Req 2.6). Pure: returns a new state and never mutates input.
 *
 * @param {EngineState} state Current engine state.
 * @returns {EngineState} A running engine state with unchanged remaining time.
 */
export function start(state) {
  if (state.isRunning) {
    return { ...state };
  }
  return { ...state, isRunning: true };
}

/**
 * Stop counting down while retaining the current Period's remaining time
 * unchanged (Req 2.3).
 *
 * If the engine is not running, this is a no-op that leaves the current Period
 * and its remaining time unchanged (Req 2.7). Pure: returns a new state and
 * never mutates input.
 *
 * @param {EngineState} state Current engine state.
 * @returns {EngineState} A stopped engine state with unchanged remaining time.
 */
export function pause(state) {
  if (!state.isRunning) {
    return { ...state };
  }
  return { ...state, isRunning: false };
}

/**
 * Stop the countdown and return to a fresh Focus_Period (Req 2.4).
 *
 * The reset engine is stopped, its current Period is a Focus_Period, and its
 * remaining time equals the currently configured Focus_Duration
 * (config.focusMinutes × 60). `focusSinceLongBreak` is preserved so reset does
 * not disturb long-break cycling or tracking totals (Req 4.6). Pure: returns a
 * new state and never mutates input.
 *
 * @param {EngineState} state Current engine state.
 * @returns {EngineState} A stopped focus-period engine state.
 */
export function reset(state) {
  return {
    ...state,
    periodType: PERIOD_TYPES.FOCUS,
    remainingSeconds: state.config.focusMinutes * SECONDS_PER_MINUTE,
    isRunning: false,
  };
}
/**
 * Decide which Period follows a completed Focus_Period (Req 3.1, 3.2).
 *
 * Given the number of Focus_Periods completed since the last Long_Break_Period
 * (before counting the one just finished), the engine starts a
 * Long_Break_Period when this completion reaches the Long_Break_Interval, and a
 * Short_Break_Period otherwise. Pure: depends only on its arguments.
 *
 * @param {number} focusSinceLongBreak Completed focus periods since last long break, excluding the one just finished.
 * @param {number} longBreakInterval   Focus periods required before a long break.
 * @returns {PeriodType} `"long_break"` or `"short_break"`.
 */
export function nextPeriodAfterFocus(focusSinceLongBreak, longBreakInterval) {
  const completedIncludingThis = focusSinceLongBreak + 1;
  return completedIncludingThis >= longBreakInterval
    ? PERIOD_TYPES.LONG_BREAK
    : PERIOD_TYPES.SHORT_BREAK;
}

/**
 * Advance the countdown by `elapsedSeconds`, cycling periods on zero (Req 3).
 *
 * The remaining time is decremented and clamped at 0 so a delayed tick never
 * goes negative. When the current Period reaches zero, the engine builds a
 * {@link Transition} describing the completed and newly started periods, seeds
 * the new period's remaining time from `config` (minutes × 60), and updates the
 * long-break counter:
 *
 * - Focus → Short_Break/Long_Break per {@link nextPeriodAfterFocus} (Req 3.1, 3.2).
 *   Starting a Short_Break increments `focusSinceLongBreak`; starting a
 *   Long_Break resets it to 0 (Req 3.3).
 * - Short_Break/Long_Break → Focus with remaining = Focus_Duration (Req 3.4).
 *
 * When the countdown does not reach zero, `transition` is `null` and the state
 * simply reflects the decremented remaining time. Pure: returns new values and
 * never mutates input.
 *
 * @param {EngineState} state Current engine state.
 * @param {number} [elapsedSeconds=1] Seconds elapsed since the previous tick.
 * @returns {{ state: EngineState, transition: (Transition|null) }} New state and optional transition.
 */
export function tick(state, elapsedSeconds = 1) {
  const remaining = Math.max(0, state.remainingSeconds - elapsedSeconds);

  if (remaining > 0) {
    return {
      state: { ...state, remainingSeconds: remaining },
      transition: null,
    };
  }

  const { config } = state;

  if (state.periodType === PERIOD_TYPES.FOCUS) {
    const nextPeriod = nextPeriodAfterFocus(
      state.focusSinceLongBreak,
      config.longBreakInterval,
    );

    const isLongBreak = nextPeriod === PERIOD_TYPES.LONG_BREAK;
    const nextRemainingSeconds =
      (isLongBreak ? config.longBreakMinutes : config.shortBreakMinutes) *
      SECONDS_PER_MINUTE;
    const nextFocusSinceLongBreak = isLongBreak
      ? 0
      : state.focusSinceLongBreak + 1;

    return {
      state: {
        ...state,
        periodType: nextPeriod,
        remainingSeconds: nextRemainingSeconds,
        focusSinceLongBreak: nextFocusSinceLongBreak,
      },
      transition: {
        completedPeriod: PERIOD_TYPES.FOCUS,
        completedFocusMinutes: config.focusMinutes,
        nextPeriod,
      },
    };
  }

  // Short_Break or Long_Break completed → start a Focus_Period (Req 3.4).
  return {
    state: {
      ...state,
      periodType: PERIOD_TYPES.FOCUS,
      remainingSeconds: config.focusMinutes * SECONDS_PER_MINUTE,
    },
    transition: {
      completedPeriod: state.periodType,
      completedFocusMinutes: 0,
      nextPeriod: PERIOD_TYPES.FOCUS,
    },
  };
}
