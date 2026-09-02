import { spawn } from 'node:child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Electron is the user-facing application, not a hidden background helper.
const child = spawn(electron, ['.'], { stdio: 'inherit', windowsHide: false, env });
child.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code) => { process.exitCode = code ?? 1; });
