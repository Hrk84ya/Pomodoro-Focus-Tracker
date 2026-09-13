/**
 * App controller — wires the engine, settings, tracking, and view together.
 *
 * Owns the ~1s clock (setInterval), routes control events to engine commands,
 * reacts to engine transitions, updates tracking, triggers the completion cue,
 * and re-renders the view. All state is in-memory only (Req 6.2–6.6): no
 * localStorage/sessionStorage and no network requests. Because nothing is
 * persisted, a browser reload re-runs `init` and naturally restores defaults
 * and zeroed counters (Req 6.5, 6.6).
 *
 * The side effects (DOM lookups, `setInterval`, audio via the view's cue) live
 * here at the edge. The controller keeps its mutable session state — `config`,
 * `engine`, `tracking`, `message`, and the interval bookkeeping — inside an
 * app instance created by {@link createApp}, so importing this module under
 * Node never touches the DOM until `init` is called with a live document.
 *
 * @typedef {import("./types.js").Config} Config
 * @typedef {import("./types.js").EngineState} EngineState
 * @typedef {import("./types.js").Tracking} Tracking
 * @typedef {import("./types.js").Transition} Transition
 * @typedef {import("./types.js").PeriodType} PeriodType
 */

import { DEFAULTS, applySetting } from "./settings.js";
import { createEngine, start, pause, reset, tick } from "./engine.js";
import { createTracking, recordFocusCompletion } from "./tracking.js";
import { render, presentCompletionCue } from "./view.js";
import { PERIOD_TYPES } from "./types.js";

/**
 * Tick cadence in milliseconds. Kept at or below one second so the display is
 * updated at least once per second (Req 2.5, 3.5, 4.3, 4.4). Actual elapsed
 * time is measured from timestamps rather than assumed from this interval, so
 * drift and background throttling never accumulate.
 */
const TICK_INTERVAL_MS = 250;

/** Milliseconds per second, for converting elapsed wall-clock time to seconds. */
const MS_PER_SECOND = 1000;

/**
 * Map each configurable field to the period whose remaining time should be
 * reseeded when the field changes while the engine is stopped. Only a change
 * to the currently displayed period's own duration should visibly move the
 * countdown; other accepted values simply apply to the next relevant period
 * (Req 1.7). `longBreakInterval` never reseeds remaining time.
 *
 * @type {Readonly<Record<string, PeriodType>>}
 */
const FIELD_TO_PERIOD = Object.freeze({
  focusMinutes: PERIOD_TYPES.FOCUS,
  shortBreakMinutes: PERIOD_TYPES.SHORT_BREAK,
  longBreakMinutes: PERIOD_TYPES.LONG_BREAK,
});

/** Seconds per minute — reseeding a period's remaining time from minutes. */
const SECONDS_PER_MINUTE = 60;

/**
 * @typedef {Object} AppInstance
 * @property {Config} config          Current stored configuration (Req 1.7).
 * @property {EngineState} engine     Current Timer_Engine state (Req 2, 3).
 * @property {Tracking} tracking      Session/focus totals for this page (Req 4).
 * @property {string} message         Current validation / running-lock message.
 * @property {(number|null)} intervalId  Active clock interval handle, or null.
 * @property {(number|null)} lastTickMs  Timestamp (ms) of the previous tick.
 * @property {() => number} now       Injectable clock (defaults to Date.now).
 * @property {(fn: Function, ms: number) => any} setIntervalFn  Injectable timer.
 * @property {(id: any) => void} clearIntervalFn                Injectable timer.
 */

/**
 * Create a fresh, in-memory app instance with defaults and zeroed counters
 * (Req 1.2, 4.5, 6.6). No DOM access happens here, so this is safe to call in
 * Node for the integration tests.
 *
 * Timing primitives are injectable so tests can drive the clock deterministically
 * without real timers; production code uses `Date.now` / `setInterval` /
 * `clearInterval`.
 *
 * @param {Object} [options]
 * @param {() => number} [options.now]            Clock source, defaults to Date.now.
 * @param {(fn: Function, ms: number) => any} [options.setIntervalFn]
 * @param {(id: any) => void} [options.clearIntervalFn]
 * @returns {AppInstance}
 */
export function createApp(options = {}) {
  const config = { ...DEFAULTS };
  return {
    config,
    engine: createEngine(config),
    tracking: createTracking(),
    message: "",
    intervalId: null,
    lastTickMs: null,
    now:
      options.now ||
      (() => (typeof Date !== "undefined" ? Date.now() : 0)),
    setIntervalFn:
      options.setIntervalFn ||
      ((fn, ms) =>
        typeof setInterval === "function" ? setInterval(fn, ms) : null),
    clearIntervalFn:
      options.clearIntervalFn ||
      ((id) => {
        if (typeof clearInterval === "function") clearInterval(id);
      }),
  };
}

/**
 * Build the flattened {@link import("./view.js").ViewSnapshot} the view renders,
 * assembling engine + tracking state plus the current message. Pure with
 * respect to the DOM.
 *
 * @param {AppInstance} app
 * @returns {{ periodType: PeriodType, remainingSeconds: number, isRunning: boolean, sessionCount: number, totalFocusMinutes: number, message: string }}
 */
export function snapshot(app) {
  return {
    periodType: app.engine.periodType,
    remainingSeconds: app.engine.remainingSeconds,
    isRunning: app.engine.isRunning,
    sessionCount: app.tracking.sessionCount,
    totalFocusMinutes: app.tracking.totalFocusMinutes,
    message: app.message,
  };
}

/**
 * Stop and clear the active clock interval, if any. Idempotent: calling it
 * when no interval is running is a no-op.
 *
 * @param {AppInstance} app
 * @returns {void}
 */
function clearClock(app) {
  if (app.intervalId !== null) {
    app.clearIntervalFn(app.intervalId);
    app.intervalId = null;
  }
  app.lastTickMs = null;
}

/**
 * Advance the engine by the whole seconds elapsed since the previous tick,
 * reacting to any period transition: record focus completions in tracking
 * (Req 4.1, 4.2) and present the completion cue for ANY period completion
 * (Req 5.1). Uses timestamp-based elapsed time so drift does not accumulate
 * (Req 2.5, 3.5). Re-renders after processing.
 *
 * @param {AppInstance} app
 * @returns {void}
 */
function onTick(app) {
  const nowMs = app.now();
  const previousMs = app.lastTickMs === null ? nowMs : app.lastTickMs;
  const elapsedSeconds = Math.floor((nowMs - previousMs) / MS_PER_SECOND);

  // Nothing to do until at least a whole second of wall-clock time has passed;
  // leave lastTickMs untouched so the leftover fraction carries into the next
  // tick and drift does not accumulate.
  if (elapsedSeconds <= 0) {
    return;
  }
  app.lastTickMs = previousMs + elapsedSeconds * MS_PER_SECOND;

  const { state, transition } = tick(app.engine, elapsedSeconds);
  app.engine = state;

  if (transition) {
    if (transition.completedPeriod === PERIOD_TYPES.FOCUS) {
      app.tracking = recordFocusCompletion(
        app.tracking,
        transition.completedFocusMinutes,
      );
    }
    // Any period completion presents the completion cue (Req 5.1).
    presentCompletionCue();
  }

  render(snapshot(app));
}

/**
 * Handle the start control: begin counting down and start the clock (Req 2.2).
 * Starting while already running is a no-op on remaining time (Req 2.6). The
 * clock is (re)seeded so the first elapsed measurement is taken from now.
 *
 * @param {AppInstance} app
 * @returns {void}
 */
export function handleStart(app) {
  app.engine = start(app.engine);
  app.message = "";

  if (app.intervalId === null) {
    app.lastTickMs = app.now();
    app.intervalId = app.setIntervalFn(() => onTick(app), TICK_INTERVAL_MS);
  }

  render(snapshot(app));
}

/**
 * Handle the pause control: stop counting down, retaining remaining time
 * (Req 2.3), and clear the clock. Pausing while stopped is a no-op (Req 2.7).
 *
 * @param {AppInstance} app
 * @returns {void}
 */
export function handlePause(app) {
  app.engine = pause(app.engine);
  clearClock(app);
  render(snapshot(app));
}

/**
 * Handle the reset control: stop, return to a fresh Focus_Period (Req 2.4),
 * and clear the clock. Tracking totals are preserved (Req 4.6). Any lingering
 * message is cleared.
 *
 * @param {AppInstance} app
 * @returns {void}
 */
export function handleReset(app) {
  app.engine = reset(app.engine);
  clearClock(app);
  app.message = "";
  render(snapshot(app));
}

/**
 * Handle a Settings_Panel change: apply the field through {@link applySetting},
 * enforcing the running-lock and validation rules. On acceptance the stored
 * config is updated and the engine's config snapshot is re-seeded so the value
 * applies to the next relevant period (Req 1.7); when the engine is stopped and
 * the changed field is the current period's own duration, the visible remaining
 * time is refreshed to the new duration. On rejection the previous value is
 * kept and the validation / running-lock message is shown (Req 1.5, 1.6, 1.8).
 * A running countdown's remaining time is never disrupted.
 *
 * @param {AppInstance} app
 * @param {keyof Config} field
 * @param {unknown} rawValue
 * @returns {void}
 */
export function handleSettingChange(app, field, rawValue) {
  const result = applySetting(app.config, field, rawValue, app.engine.isRunning);

  if (result.accepted) {
    app.config = result.config;
    // Keep the engine's config snapshot in step so new periods seed from the
    // updated durations/interval (Req 1.7).
    app.engine = { ...app.engine, config: { ...app.config } };

    // When stopped, reflect a change to the CURRENT period's own duration in
    // the displayed remaining time; other accepted values apply to the next
    // relevant period without disturbing the current countdown.
    if (
      !app.engine.isRunning &&
      FIELD_TO_PERIOD[field] === app.engine.periodType
    ) {
      const minutes = app.config[field];
      app.engine = {
        ...app.engine,
        remainingSeconds: minutes * SECONDS_PER_MINUTE,
      };
    }

    app.message = "";
  } else {
    // Rejected: config unchanged, surface the message (Req 1.5, 1.8).
    app.message = result.message || "";
  }

  render(snapshot(app));
}

/**
 * Bind DOM controls and settings inputs of the given app instance, then render
 * the initial state. Guards every DOM lookup so it is safe to call without a
 * live document (each binding is simply skipped).
 *
 * @param {AppInstance} app
 * @returns {AppInstance} the same app instance, for convenience/testing.
 */
export function bindDom(app) {
  if (typeof document === "undefined") {
    return app;
  }

  const startBtn = document.getElementById("start-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const resetBtn = document.getElementById("reset-btn");

  if (startBtn) startBtn.addEventListener("click", () => handleStart(app));
  if (pauseBtn) pauseBtn.addEventListener("click", () => handlePause(app));
  if (resetBtn) resetBtn.addEventListener("click", () => handleReset(app));

  const inputIds = [
    "focus-minutes",
    "short-break-minutes",
    "long-break-minutes",
    "long-break-interval",
  ];
  for (const id of inputIds) {
    const input = document.getElementById(id);
    if (!input) continue;
    const field = input.getAttribute("data-field") || input.name;
    const handler = (event) => {
      const target = event && event.target ? event.target : input;
      handleSettingChange(app, field, target.value);
    };
    // `change` fires on commit/blur; `input` gives live feedback while typing.
    input.addEventListener("change", handler);
    input.addEventListener("input", handler);
  }

  // Initial paint of defaults / zeroed counters (Req 1.2, 4.5, 6.6).
  render(snapshot(app));
  return app;
}

/**
 * Initialize the application: create the in-memory state, wire the DOM, and
 * render the initial view. Nothing is persisted, so this runs fresh on every
 * page load / reload (Req 6.5, 6.6).
 *
 * @param {Object} [options] Passed through to {@link createApp} (mainly for tests).
 * @returns {AppInstance} the initialized app instance.
 */
export function init(options = {}) {
  const app = createApp(options);
  return bindDom(app);
}

// Auto-initialize in a browser once the DOM is ready. Guarded so importing the
// module under Node (for the integration tests) never touches the DOM.
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
}
