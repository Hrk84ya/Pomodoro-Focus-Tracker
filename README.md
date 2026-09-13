# Pomodoro Focus Tracker

A lightweight, dependency-free Pomodoro timer built with vanilla HTML, CSS, and JavaScript (ES modules). Stay focused with customizable work/break cycles and track your productivity over time.

###### Checkout the Pomodoro Tracker: [LIVE](https://hrk84ya.github.io/Pomodoro-Focus-Tracker/)
## Features

- **Pomodoro timer** — classic focus / short break / long break cycle with an animated progress ring
- **Customizable durations** — set focus, short break, and long break lengths (1–120 minutes)
- **Long-break interval** — choose how many focus sessions (1–12) trigger a long break
- **Session tracking** — counts completed sessions and total focus time
- **Input validation** — clear, field-specific error messages for out-of-range values
- **Accessible UI** — ARIA live regions, semantic markup, and keyboard-friendly controls
- **Zero dependencies** — no build step, no frameworks; just open and use

## Getting Started

No installation or build step is required.

1. Clone the repository:
   ```bash
   git clone https://github.com/Hrk84ya/Pomodoro-Focus-Tracker.git
   cd Pomodoro-Focus-Tracker
   ```
2. Serve the folder with any static file server (ES modules require HTTP, not `file://`):
   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```
3. Open http://localhost:8000 in your browser.

## Usage

1. Adjust durations in the **Settings** panel (defaults: 25 min focus, 5 min short break, 15 min long break every 4 sessions).
2. Press **Start** to begin a focus session.
3. **Pause** or **Reset** at any time.
4. The timer automatically cycles through focus and break periods, and your completed sessions and total focus time are tracked in the stats panel.

## Project Structure

```
├── index.html        # App markup (timer, controls, stats, settings)
├── styles.css        # Styling and timer ring animation
└── src/
    ├── app.js        # Entry point — wires everything together
    ├── engine.js     # Timer engine (countdown, period transitions)
    ├── settings.js   # Configuration, validation, defaults
    ├── tracking.js   # Session count & total focus time tracking
    ├── view.js       # DOM rendering / UI updates
    └── types.js      # Shared JSDoc type definitions
```

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.
