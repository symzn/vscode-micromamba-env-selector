# Changelog

All notable changes to the "vscode-micromamba-envs" extension will be documented in this file.

## [0.3.0] - 2025-12-06

### Fixed
- **Conflict Resolution**: The extension now automatically sets `python.terminal.activateEnvironment` to `false` in the workspace settings when an environment is selected. This prevents the Microsoft Python extension from overriding the environment variables injected by this extension.
- **Command Registration**: Ensured the command `Micromamba: Select Environment` is properly available in the Command Palette immediately upon activation.

---

## [0.2.0] - 2025-12-06

### Fixed
- **Linux Support**: Fixed an issue where Micromamba variables (`MAMBA_ROOT_PREFIX`, `MAMBA_EXE`) were not detected correctly on Linux. The extension now uses an interactive shell (`bash -ic`) to ensure user profiles (.bashrc/.zshrc) are properly loaded.

---

## [0.1.0] - 2025-12-05

### Added
- **Smart Selection**: The currently active environment is now automatically highlighted and pre-selected when opening the picker.
- **Visual Indicators**: Added icons to easily distinguish between environments:
  - `$(project)` for Workspace environments (local).
  - `$(globe)` for Global/Root environments.
  - `$(check)` for the active environment.
- **Git Friendliness**: When selecting a local environment (inside the project), the extension now writes a relative path using `${workspaceFolder}` in `settings.json`. This makes the configuration safe to commit to Git.
- **Python Integration**: Implemented a "Force Refresh" mechanism (`python.clearWorkspaceInterpreter`) to ensure VS Code immediately switches to the selected environment, bypassing internal caches.

### Changed
- Improved the detection logic for `environments.txt` location.
- Optimized startup performance by caching Micromamba configuration after the first shell call.

---

## [0.0.0] - 2025-12-05
- Basic discovery of environments from `~/.conda/environments.txt`.
- Activation of environments in VS Code Terminal.
- Generation of `.env` file for C++ and other tools support.