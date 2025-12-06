# VSCode Micromamba Envs

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/symzn.vscode-micromamba-envs?style=flat-square&label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=symzn.vscode-micromamba-envs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Preface**
This extension is a replacement for my previous extension ([vscode-micromamba-env](https://github.com/symzn/vscode-micromamba-env)). The previous version relied on the `ms-python-envs` API (Environment Provider), which unfortunately suffers from several upstream issues. This new version takes a new standalone approach by directly managing environment variables and interacting with the shell, ensuring a reliable experience for Micromamba users.

---

A simple and efficient VS Code extension to discover, select, and activate your **Micromamba** environments.

## Features

- **Discovery**: Automatically reads your environments from `~/.conda/environments.txt`.
- **Filtering**: Separates environments into "Workspace" (local to your project) and "Root/Global" (in your Micromamba root prefix).
- **Activation**:
  - Injects environment variables directly into the VS Code Integrated Terminal.
  - Automatically updates the **Python** extension path (`python.defaultInterpreterPath`).
  - **Auto-configuration**: Automatically disables `python.terminal.activateEnvironment` in your workspace to prevent conflicts with the standard Python extension.
  - Generates a `.env` file in your workspace root for other tools.
- **Performance**: Caches critical Micromamba configuration (`MAMBA_ROOT_PREFIX`, `MAMBA_EXE`) by querying your shell only once per session.

## Usage

1. Open the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run `Micromamba: Select Environment`.
3. Choose your environment from the list.
4. The status bar will update, and new terminals will use this environment.

## Configuration

You can customize the extension in your `settings.json`:

```json
{
  "micromamba-envs.micromambaBinary": "/path/to/micromamba", 
  "micromamba-envs.rootPrefix": "/home/user/micromamba",
  "micromamba-envs.environmentsTxtPath": "/home/user/.conda/environments.txt"
}
```

- `micromamba-envs.micromambaBinary`: (Optional) Manually specify the micromamba executable. If left empty, the extension attempts to find it via your shell variables (`MAMBA_EXE`).
- `micromamba-envs.rootPrefix`: (Optional) Manually specify the root prefix to filter global environments. If empty, it is detected via `MAMBA_ROOT_PREFIX`.
- `micromamba-envs.environmentsTxtPath`: (Optional) Path to the file listing your environments. Defaults to `~/.conda/environments.txt`.

## Git & Team Workflow

This extension is designed to be friendly with version control systems like Git.

### 1. `settings.json` Handling
When you select an environment, the extension updates your workspace settings (`.vscode/settings.json`):
1. Sets `python.defaultInterpreterPath` to the selected environment.
2. Sets `python.terminal.activateEnvironment` to `false` (to avoid conflicts).

- **Local Environments** (e.g., inside your project folder): The extension uses **relative paths** with `${workspaceFolder}` (e.g., `${workspaceFolder}/.conda/bin/python`). This allows you to commit the `.vscode/settings.json` file so your team automatically uses the correct environment setup.
- **Global Environments**: The extension uses **absolute paths**. Be careful not to commit `.vscode/settings.json` if you use a machine-specific global path.

### 2. The `.env` File
To ensure seamless integration with C++ libraries (DLLs) and other tools, this extension generates a `.env` file at the root of your workspace containing all necessary environment variables.

**⚠️ Important:** This file contains local paths and variables. You should add it to your `.gitignore`:

```gitignore
# .gitignore
.env
```

## Requirements
- **Micromamba** must be installed.
- Your shell (Bash, Zsh, PowerShell) should be configured properly (e.g., via `micromamba shell init ...`) so that `MAMBA_ROOT_PREFIX` is accessible if you don't provide it in settings.

## Contributing

Contributions are welcome! Please feel free to open an issue to report a bug or suggest a feature. If you want to contribute code, please open a Pull Request.

## Development

To get started with development:

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/symzn/vscode-micromamba-env-selector.git
    cd vscode-micromamba-env-selector
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Compile the code**:
    ```bash
    npm run compile
    ```
    You can also run `npm run watch` to automatically recompile on file changes.

4.  **Launch in Debug Mode**:
    -   Press `F5` in VS Code to open a new "Extension Development Host" window with the extension running.
    -   You can now test your changes in this new window.

5. **Package creation**
    - Install packaging tool `vsce`
    ```bash
    npm install -g @vscode/vsce
    ```
    - Build package
    ```bash
    vsce package
    ```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.