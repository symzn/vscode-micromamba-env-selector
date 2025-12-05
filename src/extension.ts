import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Interface to store selected environment info
interface MicromambaEnvItem extends vscode.QuickPickItem {
    envPath: string;
}

// Interface for cached configuration
interface MambaConfig {
    rootPrefix: string;
    exe: string;
    envTxtPath: string;
}

let myStatusBarItem: vscode.StatusBarItem;

// Singleton to cache configuration (root prefix, exe path) to avoid repeated shell calls
let cachedMambaConfig: MambaConfig | undefined;

export function activate(context: vscode.ExtensionContext) {
    // 1. Setup UI
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    myStatusBarItem.command = 'micromamba-envs.select'; 
    context.subscriptions.push(myStatusBarItem);

    // 2. Register Commands
    let disposable = vscode.commands.registerCommand('micromamba-envs.select', () => {
        selectEnvironment(context);
    });
    context.subscriptions.push(disposable);

    // 3. Restore last environment on startup
    const lastEnvPath = context.workspaceState.get<string>('currentMicromambaEnvPath');
    if (lastEnvPath) {
        setEnvironment(context, lastEnvPath);
    } else {
        myStatusBarItem.text = "$(circle-slash) Micromamba";
        myStatusBarItem.show();
    }
}

/**
 * Retrieves mamba configuration.
 * - Checks VS Code settings first.
 * - If missing, executes shell (once) to get MAMBA_ROOT_PREFIX and MAMBA_EXE.
 */
async function getMambaConfig(): Promise<MambaConfig> {
    if (cachedMambaConfig) {
        return cachedMambaConfig;
    }

    const config = vscode.workspace.getConfiguration('micromamba-envs');
    let rootPrefix = config.get<string>('rootPrefix') || '';
    let exe = config.get<string>('micromambaBinary') || '';
    let envTxtPath = config.get<string>('environmentsTxtPath') || '';

    // Default path for environments.txt if not provided
    if (!envTxtPath) {
        envTxtPath = path.join(os.homedir(), '.conda', 'environments.txt');
    }

    // If we are missing critical info, try to fetch it from the shell
    if (!rootPrefix || !exe) {
        try {
            const shellVars = await fetchMambaVarsFromShell();
            if (!rootPrefix && shellVars.rootPrefix) {
                rootPrefix = shellVars.rootPrefix;
            }
            if (!exe && shellVars.exe) {
                exe = shellVars.exe;
            }
        } catch (error) {
            console.error("Failed to fetch mamba vars from shell:", error);
        }
    }

    // Fallback for exe if still not found
    if (!exe) {
        exe = 'micromamba';
    }

    cachedMambaConfig = { rootPrefix, exe, envTxtPath };
    return cachedMambaConfig;
}

/**
 * Executes a shell command to retrieve environment variables.
 * Uses an interactive login shell to ensure profiles (.bashrc, .zshrc) are loaded.
 */
function fetchMambaVarsFromShell(): Promise<{ rootPrefix: string, exe: string }> {
    return new Promise((resolve, reject) => {
        let shellCommand = '';
        const isWin = os.platform() === 'win32';

        if (isWin) {
            // PowerShell command to print variables
            shellCommand = `powershell -Command "echo $env:MAMBA_ROOT_PREFIX; echo $env:MAMBA_EXE"`;
        } else {
            // Unix: Use bash login shell to load profiles
            shellCommand = `bash -l -c "echo $MAMBA_ROOT_PREFIX; echo $MAMBA_EXE"`;
        }

        cp.exec(shellCommand, { timeout: 5000 }, (err, stdout, stderr) => {
            if (err) {
                return reject(err);
            }
            const lines = stdout.trim().split(/[\r\n]+/);
            // Expecting line 0: Root Prefix, line 1: Exe
            const result = {
                rootPrefix: lines[0] ? lines[0].trim() : '',
                exe: lines.length > 1 && lines[1] ? lines[1].trim() : ''
            };
            resolve(result);
        });
    });
}

/**
 * Helper to normalize paths across platforms (handles drive letters on Windows).
 */
function normalize(raw_path: string) {
    let norm_path = path.normalize(raw_path);
    if (process.platform === "win32") {
        norm_path = norm_path.toLowerCase();
    }
    return norm_path;
}

async function selectEnvironment(context: vscode.ExtensionContext) {
    // 1. Get configuration
    let config: MambaConfig;
    try {
        config = await getMambaConfig();
    } catch (e) {
        vscode.window.showErrorMessage(`Error loading configuration: ${e}`);
        return;
    }

    if (!fs.existsSync(config.envTxtPath)) {
        vscode.window.showErrorMessage(`File not found: ${config.envTxtPath}`);
        return;
    }

    // 2. Read environments.txt
    const content = fs.readFileSync(config.envTxtPath, 'utf-8');
    const lines = content.split(/[\r\n]+/).filter(line => line.trim() !== '');

    // 3. Prepare context (Workspace path & Current Active Env)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const currentWorkspacePath = workspaceFolders ? normalize(workspaceFolders[0].uri.fsPath) : null;
    
    // Retrieve the currently active environment path from storage
    const storedPath = context.workspaceState.get<string>('currentMicromambaEnvPath');
    const currentActivePath = storedPath ? normalize(storedPath) : '';

    const workspaceItems: MicromambaEnvItem[] = [];
    const rootItems: MicromambaEnvItem[] = [];

    const normalizedRootPrefix = config.rootPrefix ? normalize(config.rootPrefix) : '';
    
    // Keep a reference to the active item to highlight it later
    let activeItem: MicromambaEnvItem | undefined;

    lines.forEach(envPath => {
        const normalizedPath = normalize(envPath);
        const label = path.basename(normalizedPath);
        
        // Determine if it is the active environment
        const isActive = currentActivePath === normalizedPath;

        const item: MicromambaEnvItem = {
            label: label, 
            description: normalizedPath,
            envPath: normalizedPath
        };

        // Classification Logic
        let isWorkspaceEnv = false;
        if (currentWorkspacePath && normalizedPath.startsWith(currentWorkspacePath)) {
            isWorkspaceEnv = true;
        }

        // Icon Selection: $(project) for workspace, $(globe) for global
        let icon = isWorkspaceEnv ? '$(project)' : '$(globe)';

        // Label Formatting
        if (isActive) {
            // Add a checkmark AND the type icon + (Active) mention
            item.label = `$(check) ${icon} ${label}`;
            item.description = `(Active) ${normalizedPath}`;
            activeItem = item; // Capture the active item
        } else {
            item.label = `${icon} ${label}`;
        }

        // Add to appropriate list
        if (isWorkspaceEnv) {
            workspaceItems.push(item);
        } else if (normalizedRootPrefix && normalizedPath.startsWith(normalizedRootPrefix)) {
            rootItems.push(item);
        }
    });

    // 4. Build the picker list
    const pickerItems: (MicromambaEnvItem | vscode.QuickPickItem)[] = [];

    if (workspaceItems.length > 0) {
        pickerItems.push({ label: 'Workspace Environments', kind: vscode.QuickPickItemKind.Separator });
        pickerItems.push(...workspaceItems);
    }

    if (rootItems.length > 0) {
        pickerItems.push({ label: 'Root / Global Environments', kind: vscode.QuickPickItemKind.Separator });
        pickerItems.push(...rootItems);
    }

    if (pickerItems.length === 0) {
        vscode.window.showInformationMessage("No matching environments found in workspace or root prefix.");
        return;
    }

    // 5. Create and Show Custom QuickPick (allows setting active item)
    const quickPick = vscode.window.createQuickPick<MicromambaEnvItem | vscode.QuickPickItem>();
    quickPick.placeholder = `Select an environment (Source: ${path.basename(config.envTxtPath)})`;
    quickPick.matchOnDescription = true;
    quickPick.items = pickerItems; 

    // Highlight the currently active environment in the list
    if (activeItem) {
        quickPick.activeItems = [activeItem];
    }

    // Handle events
    quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        // Ensure it's not a separator
        if (selected && 'envPath' in selected) {
            setEnvironment(context, (selected as MicromambaEnvItem).envPath, config.exe);
        }
        quickPick.hide();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
}

function setEnvironment(context: vscode.ExtensionContext, envPath: string, manualExe?: string) {
    // Determine mamba executable
    let binary = manualExe || 'micromamba';
    if (!manualExe && cachedMambaConfig) {
        binary = cachedMambaConfig.exe;
    } else if (!manualExe) {
        const config = vscode.workspace.getConfiguration('micromamba-envs');
        binary = config.get<string>('micromambaBinary') || 'micromamba';
    }

    const envNameDisplay = path.basename(envPath);

    myStatusBarItem.text = `$(sync~spin) Micromamba: ${envNameDisplay}...`;
    myStatusBarItem.show();

    // Construct Shell Command
    // Using simple quotes for paths to handle spaces correctly on all platforms
    let shellCommand = '';
    if (os.platform() === 'win32') {
        const cmd = `${binary} run -p '${envPath}' cmd /c set`;
        shellCommand = `powershell -Command "${cmd}"`;
    } else {
        const cmd = `${binary} run -p '${envPath}' env`;
        shellCommand = `bash -c "${cmd}"`;
    }

    cp.exec(shellCommand, { maxBuffer: 1024 * 1024 * 10 }, async (err, stdout, stderr) => {
        if (err) {
            console.error(err);
            myStatusBarItem.text = `$(error) Micromamba: Error`;
            vscode.window.showErrorMessage(`Error loading env: ${stderr || err.message}`);
            return;
        }

        const envVars = parseEnvOutput(stdout);

        // Fix missing variables for Terminal prompt
        if (!envVars['CONDA_DEFAULT_ENV']) {
            envVars['CONDA_DEFAULT_ENV'] = envNameDisplay;
        }
        if (!envVars['CONDA_PREFIX']) {
            envVars['CONDA_PREFIX'] = envPath;
        }

        // 1. Inject into VS Code Terminal
        const envCollection = context.environmentVariableCollection;
        envCollection.clear();
        for (const [key, value] of Object.entries(envVars)) {
            envCollection.replace(key, value);
        }

        // 2. Configure Python extension
        if (vscode.workspace.workspaceFolders) {
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            
            // Write .env file (useful for other tools/extensions)
            writeEnvFile(path.join(rootPath, '.env'), envVars);

            // Determine Python path inside the environment
            const prefix = envVars['CONDA_PREFIX'] || envPath;
            const isWin = os.platform() === 'win32';
            const pythonPath = isWin 
                    ? path.join(prefix, 'python.exe') 
                    : path.join(prefix, 'bin', 'python');

            if (fs.existsSync(pythonPath)) {
                let finalPath = pythonPath;

                // Logic to use ${workspaceFolder} if possible (Git friendly)
                if (normalize(pythonPath).startsWith(normalize(rootPath))) {
                    let relPath = path.relative(rootPath, pythonPath);
                    // Force forward slashes for JSON compatibility
                    relPath = relPath.split(path.sep).join('/');
                    finalPath = `\${workspaceFolder}/${relPath}`;
                }

                const pythonConfig = vscode.workspace.getConfiguration('python');
                
                // Update settings.json
                await pythonConfig.update('defaultInterpreterPath', finalPath, vscode.ConfigurationTarget.Workspace);
                
                // --- CRITICAL FIX ---
                // Force VS Code to forget any manually selected interpreter
                // allowing the 'defaultInterpreterPath' setting to take effect immediately.
                try {
                    await vscode.commands.executeCommand("python.clearWorkspaceInterpreter");
                } catch (e) {
                    console.log("Could not clear workspace interpreter (Python extension might not be active)", e);
                }
            }
        }

        // 3. UI Update
        context.workspaceState.update('currentMicromambaEnvPath', envPath);
        myStatusBarItem.text = `$(check) ${envNameDisplay}`;
        myStatusBarItem.tooltip = `Active Env: ${envPath}`;
        myStatusBarItem.show();
    });
}

function parseEnvOutput(output: string): { [key: string]: string } {
    const envs: { [key: string]: string } = {};
    const lines = output.split(/[\r\n]+/);
    lines.forEach(line => {
        // Skip empty or malformed lines
        if (!line || !line.includes('=')) return;
        
        const idx = line.indexOf('=');
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        
        envs[key] = value;
    });
    return envs;
}

function writeEnvFile(filepath: string, envs: { [key: string]: string }) {
    let content = '';
    for (const [key, value] of Object.entries(envs)) {
        // Basic escaping for .env format
        content += `${key}="${value.replace(/"/g, '\\"')}"\n`;
    }
    fs.writeFile(filepath, content, (err) => {
        if (err) console.error("Error writing .env", err);
    });
}

export function deactivate() {}