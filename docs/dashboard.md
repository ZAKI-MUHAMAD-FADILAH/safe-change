# Local Web Dashboard

The safe-change local dashboard provides a clean, visual interface for monitoring baseline state, inspecting verification history, and tracking active safety rules during AI agent sessions.

## Overview

The dashboard runs as an embedded, zero-dependency HTTP server directly from the safe-change binary. It requires no external web frameworks, Node dependencies, or internet connectivity. The interface uses a liquid-glass light design system built on Apple San Francisco typography, structured layout grids, and interactive inspection drawers.

## Running the Dashboard

To launch the dashboard server in your project repository:

```bash
safe-change dashboard
```

Upon startup, the command initializes the server and outputs the local access URL:

```
safe-change dashboard listening at http://127.0.0.1:4242
Press Ctrl+C to stop.
```

Open `http://127.0.0.1:4242` in any modern web browser to access the interface.

## Dashboard Architecture and Panels

The dashboard aggregates repository health into four primary functional panels:

### 1. System State (Header Metric Grid)
The top section highlights four key operational indicators:
- **System State**: Real-time status indicating whether the current working tree has active regressions flagged or if all safety verifications are passing cleanly.
- **Monitored Baseline**: Number of tracked files and confirmation of the active baseline check state.
- **Safety History**: Total number of historical runs recorded in the persistent safety log.
- **Active Guardrails**: Total count of active safety policies enforced on the codebase.

### 2. Monitored Baseline & Verification Scope
Displays the current baseline configuration:
- Head commit hash, target branch, and creation timestamp.
- Overview of monitored checks (`build`, `test`, `lint`) and their execution timeouts.
- File change statistics comparing the working directory to the recorded baseline.

### 3. Regression Timeline (Historical Verification Stream)
An interactive chronological pipeline stream displaying recorded runs:
- Sequential run badges with timestamps and descriptive labels.
- Color-coded status markers indicating whether an execution passed or introduced a regression.
- Visual file differential counts (`+` added, `~` modified, `-` deleted).
- Interactive card selection: clicking any timeline entry reveals an inspection drawer with comprehensive check outputs and execution metrics.

### 4. Safety Guardrails & Active Rules Registry
Lists the rules enforced during `safe-change check`:
- Displays active built-in rules (e.g., `no-delete-migrations`, `no-modify-lockfile`, `max-deleted-files`).
- Shows rule condition types, target file patterns, threshold boundaries, and severity levels (`error` vs `warn`).
- Displays custom user-defined rules registered in `.safe-change/rules.json`.

## Port Configuration

By default, the dashboard binds to port `4242`. If port `4242` is occupied or if you are running multiple projects simultaneously, specify a custom port with `--port` or `-p`:

```bash
safe-change dashboard --port 5000
safe-change dashboard -p 8080
```

If the specified port cannot be bound, the CLI reports an error and exits cleanly without hanging.

## Security and Privacy

The dashboard is engineered with security boundaries appropriate for proprietary development environments:

- **Localhost-Only Binding**: The HTTP server strictly binds to `127.0.0.1`. It never listens on `0.0.0.0` or external network interfaces, preventing remote access over local area networks or public IP addresses.
- **Air-Gapped Operation**: The dashboard assets, CSS styles, and typography are rendered locally without third-party CDN dependencies, tracking scripts, or external network requests.
- **Read-Only Access**: The dashboard interface provides read-only inspection of `.safe-change/` artifacts. It cannot mutate repository state, alter Git history, or modify source code files.
