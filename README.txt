DEEPSEEK DESK — WINDOWS DESKTOP APP

Install DeepSeek Desk Setup 0.3.0.exe and open DeepSeek Desk from Start.
Node.js and Python are not required to use the installed app.

EXACT 1017 SETUP
Click Set up exact DeepSeek 1017 in the sidebar, then Check this PC. The app
checks Ubuntu on WSL, GPU memory, available RAM and disk. Install WSL opens the
Windows installation flow; Windows may require elevation, reboot and first-run
Ubuntu account creation. This OS setup cannot be silently skipped.

On suitable hardware, Download & set up installs reference dependencies in an
isolated Ubuntu environment, downloads the exact pinned checkpoint, converts it
for the detected GPU count, and starts a loopback-only authenticated model API.
Progress and errors appear in the setup panel. If repository access is required,
enter an authorized Hugging Face token; the desktop app does not save it.
No smaller model is substituted.

After setup, Start installed model loads it without downloading again. Launch
initiation enables automatic startup on later app launches; disable it in
Connection settings. Closing the app stops its managed model process group.
The frontend uses port 11436 automatically. Ready appears only after weights
load. Each launch generates a new local authentication token.

Exact model: dealignai/DeepSeek-V4.1-Flash-1017-UNCENSORED-FP8
Pinned revision: c19ca5ca4eaeb79d29fdf08aea8327da95b1116a
Original code and MIT license are included in runtime/. The new server.py adapter
provides text chat and tool calls, without vision or streaming.

This is a very large GPU reference implementation, not an offloading engine.
Conservative setup checks: about 523 GiB free aggregate GPU memory, 612 GB
available RAM for the converter, and 1.13 TB free disk for fresh setup. These
are guardrails for this implementation, not universal model requirements.
Complete converted weights skip conversion RAM/disk checks. Data lives inside
Ubuntu at ~/.local/share/deepseek-desk-1017. Failed downloads can be retried.
CUDA inference with the full checkpoint could not be tested on the Mac.

Manual connections to local OpenAI-compatible servers remain available.
No paid model API or cloud fallback is configured.

FEATURES
- Persistent chats and automatic local model discovery.
- Web search through DuckDuckGo without a key; optional Brave API key.
- Read public HTTPS pages and use results in model conversations.
- List, search, read and edit text files in a chosen workspace folder.
- Review proposed changes and commands before execution; backups for file edits.
- A text editor, command output panel, stop button and undo for the latest save.
- Get editable app source copies source to Documents/DeepSeek Desk Source.
  The model can propose changes there; rebuild to use them in the app.

The default workspace is Documents/DeepSeek Desk Workspace. Open folder changes
which files the assistant can access. The file tools exclude credential patterns,
dependency folders and symlinks. Approved shell commands run with ordinary user
permissions and can access outside that folder; they are not sandboxed. Web
queries go to the chosen search provider. Provider throttling and CAPTCHA can
interrupt searches; errors are shown instead of invented results.

Task transcripts and backups are stored locally in the app data folder (Settings
> Open app data). Optional API keys use OS encrypted storage when available.

BUILD / MODIFY
Install Node.js, run npm ci, npm test, then npm start.
Build the Windows x64 installer with npm run build:win.
This build is unsigned: Windows may display an unknown-publisher warning.

VALIDATION
Unit tests cover path boundaries, backups, conflicts, command cancellation,
agent tool approvals, truncated calls, local-only endpoints and search parsing.
A native macOS Electron smoke run tests the UI against a mock model server;
it is not a test of the actual DeepSeek checkpoint. Windows executable runtime
validation requires a Windows machine. No self-training loop is implemented.
