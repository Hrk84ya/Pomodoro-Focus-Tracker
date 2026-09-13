/**
 * View + Completion cue — DOM rendering and the visual/audio completion signal.
 *
 * Owns pure formatting helpers (`formatMMSS`, `formatHM`), `render(snapshot)`
 * DOM updates, and `presentCompletionCue`. Side effects (DOM, audio) live here
 * at the edge. See tasks 6.1, 6.4, and 7.1 for the implementations.
 *
 * @typedef {import("./types.js").PeriodType} PeriodType
 * @typedef {import("./types.js").EngineState} EngineState
 * @typedef {import("./types.js").Tracking} Tracking
 */

// Implementation added in tasks 6.1 (formatMMSS, formatHM), 6.4 (render),
// and 7.1 (presentCompletionCue).

/**
 * CSS class toggled on the flash target to present the visible completion cue.
 * The stylesheet defines the flash animation for this class (task 6.3).
 */
const CUE_CLASS = "completion-cue";

/**
 * Human-readable label for each {@link PeriodType}, shown in `#period-label`.
 * Used by `render` to translate the machine period type into display text
 * while `data-period` carries the raw type for styling (Req 3.5).
 *
 * @type {Record<PeriodType, string>}
 */
const PERIOD_LABELS = {
  focus: "Focus",
  short_break: "Short Break",
  long_break: "Long Break",
};

/**
 * IDs of the Settings_Panel inputs that must be disabled while the engine is
 * running (Req 1.6). These match the `id` attributes defined in index.html.
 *
 * @type {readonly string[]}
 */
const SETTINGS_INPUT_IDS = [
  "focus-minutes",
  "short-break-minutes",
  "long-break-minutes",
  "long-break-interval",
];

/** How long, in ms, the cue class stays applied before being removed. */
const CUE_DURATION_MS = 600;

/**
 * Default audio-context factory used by `presentCompletionCue`.
 *
 * Performs Web Audio feature detection (`window.AudioContext` with the
 * `webkitAudioContext` fallback) and returns a live `AudioContext` instance,
 * or `null` when no Web Audio support is available. Kept separate so tests can
 * inject a factory that returns `null` or throws to force audio failure without
 * touching the visual path (task 7.2).
 *
 * @returns {AudioContext|null} A new audio context, or null if unsupported.
 */
function defaultAudioContextFactory() {
  const Ctx =
    (typeof window !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext)) ||
    null;
  return Ctx ? new Ctx() : null;
}

/**
 * Toggle the visual completion-cue class on the given target, unconditionally.
 *
 * The class is added immediately and removed after `CUE_DURATION_MS` so the
 * cue can retrigger on the next Period completion. This is the visible
 * on-screen change of the Completion_Cue and must always run regardless of
 * audio availability (Req 5.1, 5.3).
 *
 * @param {Element} [target=document.body] - Element to flash. Defaults to the
 *   document body when a DOM is present.
 * @returns {void}
 */
function flashScreen(target) {
  const el =
    target || (typeof document !== "undefined" ? document.body : null);
  if (!el || !el.classList) return;
  el.classList.add(CUE_CLASS);
  if (typeof setTimeout === "function") {
    setTimeout(() => el.classList.remove(CUE_CLASS), CUE_DURATION_MS);
  }
}

/**
 * Present the Completion_Cue when a Period countdown reaches zero.
 *
 * The visible on-screen change always happens first and unconditionally via
 * `flashScreen`. A best-effort Web Audio beep is then attempted inside a
 * try/catch with feature detection, so a missing, blocked, or throwing audio
 * API can never prevent the visual cue (Req 5.1, 5.2, 5.3).
 *
 * @param {object} [options] - Optional overrides for testability.
 * @param {Element} [options.target] - Element to flash (see `flashScreen`).
 * @param {() => (AudioContext|null)} [options.audioContextFactory] - Factory
 *   that returns an AudioContext or null. Defaults to Web Audio feature
 *   detection; tests can inject one that returns null or throws to force
 *   audio failure (task 7.2).
 * @returns {void}
 */
function presentCompletionCue(options = {}) {
  const { target, audioContextFactory = defaultAudioContextFactory } = options;

  // 1) Visual change ALWAYS happens first, independent of the audio outcome.
  flashScreen(target);

  // 2) Best-effort sound via Web Audio API; any failure is swallowed so the
  //    visual cue (already presented above) is never blocked (Req 5.3).
  try {
    const ctx = audioContextFactory();
    if (!ctx) return; // No audio support / blocked → visual only.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (_) {
    // Sound unavailable/blocked/threw → visual cue already presented (Req 5.3).
  }
}

/**
 * Format a second count as a two-digit MM:SS string.
 *
 * Negative inputs clamp to 0 and fractional inputs are floored, so the result
 * always matches `^\d{2}:\d{2}$` and recomposes to the (clamped, floored)
 * input via minutes * 60 + seconds. Pure — no DOM access (Req 2.5).
 *
 * @param {number} totalSeconds - Non-negative seconds remaining in a Period.
 * @returns {string} The remaining time formatted as "MM:SS".
 */
function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Format a minute count as whole hours plus two-digit minutes ("1h 05m").
 *
 * Negative inputs clamp to 0 and fractional inputs are floored. The decomposed
 * value is value-preserving: hours * 60 + minutes equals the (clamped, floored)
 * input, with minutes in 0-59. Pure — no DOM access (Req 4.4).
 *
 * @param {number} totalMinutes - Non-negative total minutes of focus time.
 * @returns {string} The total focus time formatted as "Hh MMm".
 */
function formatHM(totalMinutes) {
  const m = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/**
 * A flattened view of the current app state used by `render` to update the DOM.
 *
 * The App controller (task 8.1) builds this from the {@link EngineState} and
 * {@link Tracking} models each time state changes. Field names intentionally
 * mirror those models so the controller can assemble it directly:
 *   `{ periodType, remainingSeconds, isRunning }` from EngineState,
 *   `{ sessionCount, totalFocusMinutes }` from Tracking, plus a `message`.
 *
 * @typedef {Object} ViewSnapshot
 * @property {PeriodType} periodType        Current Period ("focus" | "short_break" | "long_break").
 * @property {number} remainingSeconds      Remaining time of the current Period, in seconds.
 * @property {boolean} isRunning            Whether the countdown is active (drives settings lock, Req 1.6).
 * @property {number} sessionCount          Completed Focus_Periods this page session (Req 4.3).
 * @property {number} totalFocusMinutes     Accumulated focus minutes; formatted via `formatHM` (Req 4.4).
 * @property {string} [message]             Validation / running-lock message; empty/omitted clears it (Req 1.5, 1.8).
 */

/**
 * Small helper: set an element's text content only when the element exists.
 * Keeps `render` safe to call in a DOM-less environment (e.g. Node tests),
 * where each lookup returns null and every update becomes a no-op.
 *
 * @param {Element|null} el   The target element, or null when absent.
 * @param {string} text       The text content to assign.
 * @returns {void}
 */
function setText(el, text) {
  if (el) el.textContent = text;
}

/**
 * Render the current {@link ViewSnapshot} into the DOM.
 *
 * Updates the period label (text + `data-period`), the MM:SS timer display,
 * the session count, the formatted total focus time, and the settings message
 * region, and disables/enables the Settings_Panel inputs based on `isRunning`
 * (Req 1.6, 3.5, 4.3, 4.4). Every DOM lookup is guarded, so the whole function
 * is a no-op when the relevant elements (or `document` itself) are absent,
 * making it safe to import and call from Node without a DOM.
 *
 * @param {ViewSnapshot} snapshot - The flattened state to render.
 * @returns {void}
 */
function render(snapshot) {
  if (typeof document === "undefined" || !snapshot) return;

  // Period label: human-readable text + raw type on data-period for styling.
  const periodEl = document.getElementById("period-label");
  if (periodEl) {
    const type = snapshot.periodType;
    setText(periodEl, PERIOD_LABELS[type] || String(type ?? ""));
    if (typeof periodEl.setAttribute === "function") {
      periodEl.setAttribute("data-period", String(type ?? ""));
    }
  }

  // Countdown display, formatted MM:SS (Req 2.5, 3.5).
  setText(
    document.getElementById("timer-display"),
    formatMMSS(snapshot.remainingSeconds)
  );

  // Tracking stats (Req 4.3, 4.4).
  setText(
    document.getElementById("session-count"),
    String(snapshot.sessionCount ?? 0)
  );
  setText(
    document.getElementById("total-focus-time"),
    formatHM(snapshot.totalFocusMinutes)
  );

  // Validation / running-lock message; empty string clears the region.
  setText(document.getElementById("settings-message"), snapshot.message || "");

  // Lock the Settings_Panel inputs while the engine is running (Req 1.6).
  for (const id of SETTINGS_INPUT_IDS) {
    const input = document.getElementById(id);
    if (input) input.disabled = Boolean(snapshot.isRunning);
  }
}

export {
  formatMMSS,
  formatHM,
  render,
  presentCompletionCue,
  flashScreen,
  CUE_CLASS,
};
