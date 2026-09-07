import { execSync } from 'child_process';
import fs from 'fs';

let cachedPythonPath: string | null = null;
let hasCheckedPython = false;

export function getPythonCommand(): string | null {
  if (hasCheckedPython && cachedPythonPath !== undefined) {
    return cachedPythonPath;
  }

  hasCheckedPython = true;

  // 1. Check custom environment variable
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    cachedPythonPath = process.env.PYTHON_PATH;
    return cachedPythonPath;
  }

  // 2. Candidate binaries to try
  const candidates = process.platform === 'win32' 
    ? ['python', 'py', 'python3', 'C:\\Python313\\python.exe', 'C:\\Python312\\python.exe', 'C:\\Python311\\python.exe']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 2000 });
      cachedPythonPath = cmd;
      return cachedPythonPath;
    } catch {
      continue;
    }
  }

  cachedPythonPath = null;
  return null;
}
