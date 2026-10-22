# DeepSeek Jailbroken App

Desktop chat, web research, workspace files and reviewed commands, powered by a separately running local model.

## Download

[Open the latest release](https://github.com/WINSTON672/deepseek-desk/releases/latest) and expand **Assets**:

- Windows: `DeepSeek-Desk-Setup-<version>.exe`
- Apple Silicon Mac: `DeepSeek-Desk-<version>-mac-arm64.dmg`
- Intel Mac: `DeepSeek-Desk-<version>-mac-x64.dmg`

Installers are unsigned. On Mac, open the DMG and drag the app into Applications. The installed app is named **DeepSeek Desk**.

## Extensions and editor

Open **Extensions** in the sidebar to toggle Web research, Terminal, Git tools and PDF reader, or install a custom tool plugin. Git must be installed separately. PDF extraction reads text from workspace files; it does not OCR scanned pages.

The editor includes line numbers, syntax highlighting, bracket matching and completion for supported languages, with dark/light/midnight themes and JSON formatting. Completion is language-based, not model-powered.

Custom plugins use this app's JSON format, not VS Code VSIX. Start with [echo-example.json](extensions/echo-example.json) and [plugin instructions](extensions/README.txt). Every AI-triggered plugin command requires approval and runs with normal user permissions.

## Updates

Install version 0.3.2 or later once to get the updater. The app checks GitHub on launch and every six hours. Use **Check for updates** at any time.

Windows offers **Download update**, then **Install & restart**. Save edited files and stop running work first. Mac update notices open the release page to download a replacement DMG; unsigned Mac builds do not install updates automatically.

To publish another version, update the version in `package.json` and `package-lock.json`, then push to `main`. GitHub Actions tests and builds all three installers, publishes the versioned release, and uploads the Windows update manifest. Use a new version for each release; existing release tags are not overwritten.

## Exact 1017 setup

The selected checkpoint is `dealignai/DeepSeek-V4.1-Flash-1017-UNCENSORED-FP8`. Model weights are not bundled. No smaller model is substituted.

Windows automatic setup requires WSL2, Ubuntu, NVIDIA GPUs and very large GPU/RAM/storage capacity. **Install WSL2** waits for the installer and checks the result. Approve the Windows administrator prompt; restart if required. **Open Ubuntu** lets you finish first-launch account prompts. Then use **Check this PC** and **Download & set up**.

Mac uses a compatible local model server configured in Connection settings. The exact checkpoint's CUDA reference engine cannot run on Mac through this setup.

The app uses the specified third-party checkpoint; it does not modify or verify its refusal behavior. Full CUDA inference, interactive WSL installation, and Windows upgrade installation remain unverified. Automated setup/updater tests and a native Mac interface smoke test have passed.

See [README.txt](README.txt) for additional setup details. Upstream model code retains its [MIT license](runtime/LICENSE).
