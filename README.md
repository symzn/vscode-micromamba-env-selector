# VSCode Micromamba Envs

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

- micromamba-envs.micromambaBinary: (Optional) Manually specify the micromamba executable. If left empty, the extension attempts to find it via your shell variables (MAMBA_EXE).
- micromamba-envs.rootPrefix: (Optional) Manually specify the root prefix to filter global environments. If empty, it is detected via `MAMBA_ROOT_PREFIX`.
- micromamba-envs.environmentsTxtPath: (Optional) Path to the file listing your environments. Defaults to `~/.conda/environments.txt`.

## Requirements
- **Micromamba** must be installed.
- Your shell (Bash, Zsh, PowerShell) should be configured properly (e.g., via micromamba shell init ...) so that `MAMBA_ROOT_PREFIX` is accessible if you don't provide it in settings.

## Contributing

Contributions are welcome! Please feel free to open an issue to report a bug or suggest a feature. If you want to contribute code, please open a Pull Request.

## Development

To get started with development:

1.  **Clone the repository**:
    ```bash
    git clone [https://github.com/symzn/vscode-micromamba-env-selector.git](https://github.com/symzn/vscode-micromamba-env-selector.git)
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