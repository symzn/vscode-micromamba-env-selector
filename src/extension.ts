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
    myStatusBarItem.command = 'micromamba-envs.select'; // Fixed command ID to match package.json
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
            // We echo variables separated by a newline
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

function normalize(raw_path:string) {
    let norm_path = path.normalize(raw_path);
    if (process.platform === "win32") {norm_path = norm_path.toLowerCase();}
    return norm_path;
}

async function selectEnvironment(context: vscode.ExtensionContext) {
    // 1. Get configuration (load from shell if necessary)
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

    // 3. Prepare groups (Workspace vs Root)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const currentWorkspacePath = workspaceFolders ? normalize(workspaceFolders[0].uri.fsPath) : null;

    const workspaceItems: MicromambaEnvItem[] = [];
    const rootItems: MicromambaEnvItem[] = [];

    // Normalize root prefix for comparison
    const normalizedRootPrefix = config.rootPrefix ? normalize(config.rootPrefix) : '';

    lines.forEach(envPath => {
        const normalizedPath = normalize(envPath);
        const label = path.basename(normalizedPath);
        
        const item: MicromambaEnvItem = {
            label: label,
            description: normalizedPath,
            envPath: normalizedPath
        };

        // Categorize
        if (currentWorkspacePath && normalizedPath.startsWith(currentWorkspacePath)) {
            // It's inside the workspace
            item.label = `$(project) ${label}`;
            workspaceItems.push(item);
        } else if (normalizedRootPrefix && normalizedPath.startsWith(normalizedRootPrefix)) {
            // It's inside the root prefix
            rootItems.push(item);
        } 
        // Else: It is an external environment not in root prefix (Ignored based on requirements)
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

    // 5. Show menu
    vscode.window.showQuickPick(pickerItems, {
        placeHolder: `Select an environment (Source: ${path.basename(config.envTxtPath)})`
    }).then(selected => {
        if (selected) {
            const envItem = selected as MicromambaEnvItem;
            setEnvironment(context, envItem.envPath, config.exe);
        }
    });
}

function setEnvironment(context: vscode.ExtensionContext, envPath: string, manualExe?: string) {
    // If called from startup, manualExe might be undefined, so we fetch config again (fast due to cache)
    let binary = manualExe || 'micromamba';
    if (!manualExe && cachedMambaConfig) {
        binary = cachedMambaConfig.exe;
    } else if (!manualExe) {
        // Should rarely happen if activated correctly, fallback
        const config = vscode.workspace.getConfiguration('micromamba-envs');
        binary = config.get<string>('micromambaBinary') || 'micromamba';
    }

    const envNameDisplay = path.basename(envPath);

    myStatusBarItem.text = `$(sync~spin) Micromamba: ${envNameDisplay}...`;
    myStatusBarItem.show();

    // Construct Shell Command
    // We use the default shell to leverage user's PATH
    let shellCommand = '';
    
    // Note: We use -p (path) because environments.txt provides absolute paths
    if (os.platform() === 'win32') {
        // PowerShell
        const cmd = `${binary} run -p '${envPath}' cmd /c set`;
        shellCommand = `powershell -Command "${cmd}"`;
    } else {
        // Bash (Linux/Mac)
        const cmd = `${binary} run -p '${envPath}' env`;
        shellCommand = `bash -c "${cmd}"`;
    }

    console.log(`Executing: ${shellCommand}`);

    cp.exec(shellCommand, { maxBuffer: 1024 * 1024 * 10 }, async (err, stdout, stderr) => {
        if (err) {
            console.error(err);
            myStatusBarItem.text = `$(error) Micromamba: Error`;
            vscode.window.showErrorMessage(`Error loading env: ${stderr || err.message}`);
            return;
        }

        const envVars = parseEnvOutput(stdout);
        // 1. Inject into VS Code Terminal
        const envCollection = context.environmentVariableCollection;
        envCollection.clear();
        for (const [key, value] of Object.entries(envVars)) {
            envCollection.replace(key, value);
        }

        // 2. Write .env and configure Python (Plan B)
        if (vscode.workspace.workspaceFolders) {
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const envFilePath = path.join(rootPath, '.env');
            
            writeEnvFile(envFilePath, envVars);
            
            // Python extension configuration
            const prefix = envVars['CONDA_PREFIX'] || envPath;
            const isWin = os.platform() === 'win32';
            const pythonPath = isWin 
                    ? path.join(prefix, 'python.exe') 
                    : path.join(prefix, 'bin', 'python');

            if (fs.existsSync(pythonPath)) {
                const pythonConfig = vscode.workspace.getConfiguration('python');
                await pythonConfig.update('defaultInterpreterPath', pythonPath, vscode.ConfigurationTarget.Workspace);
            } else {
                console.log("Environment does not contain Python. Skipping Python extension configuration.");
            }
        }

        // 3. UI Update
        context.workspaceState.update('currentMicromambaEnvPath', envPath);
        myStatusBarItem.text = `$(check) ${envNameDisplay}`;
        myStatusBarItem.tooltip = `Active Env: ${envPath}`;
        myStatusBarItem.show();
        // const action = await vscode.window.showInformationMessage(
        //     `Environment "${envNameDisplay}" activated. Open a new terminal to use it.`,
        //     'Create Terminal'
        // );

        // if (action === 'Create Terminal') {
        //     const term = vscode.window.createTerminal(`Micromamba: ${envNameDisplay}`);
        //     term.show();
        // }
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
        // Basic escaping
        content += `${key}="${value.replace(/"/g, '\\"')}"\n`;
    }
    fs.writeFile(filepath, content, (err) => {
        if (err) console.error("Error writing .env", err);
    });
}

export function deactivate() {}