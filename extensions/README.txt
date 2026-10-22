DeepSeek Desk custom tools (format 1)

In Extensions, click Install plugin JSON and select echo-example.json.
Review the commands, then install. Enable, disable or remove it in Extensions.
Ask the model to use the echo example. A command approval appears before execution.

Each plugin declares format: 1, a lowercase id, name, description, and 1–8 tools.
Each tool has a lowercase name, description and commands keyed by win32 and/or darwin.
The AI supplies an input string, appended as one shell-quoted argument to the command.
Commands run in the current workspace with normal user permissions, not in a sandbox.
A plugin only appears on an OS for which it declares a command. Required executables
must already be installed. No arbitrary JavaScript is loaded into the app renderer.

This is DeepSeek Desk's own tool-plugin format. VS Code VSIX files are not supported.
Built-in language completion runs locally; it is not model-powered autocomplete.
