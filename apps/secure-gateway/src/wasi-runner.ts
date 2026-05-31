import { WASI } from 'node:wasi';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WasiResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runWasmCommand(
  wasmPath: string,
  args: string[] = [],
  env: Record<string, string> = {},
  preopens: Record<string, string> = { '/workspace': process.cwd() }
): Promise<WasiResult> {
  const stdoutPath = path.join(process.cwd(), '.memory', `wasi_stdout_${Math.random().toString(36).substring(2)}.tmp`);
  const stderrPath = path.join(process.cwd(), '.memory', `wasi_stderr_${Math.random().toString(36).substring(2)}.tmp`);
  
  if (!fs.existsSync(path.dirname(stdoutPath))) {
    fs.mkdirSync(path.dirname(stdoutPath), { recursive: true });
  }

  const stdoutFd = fs.openSync(stdoutPath, 'w+');
  const stderrFd = fs.openSync(stderrPath, 'w+');

  try {
    const wasi = new WASI({
      version: 'preview1',
      args: [path.basename(wasmPath), ...args],
      env,
      preopens,
      stdout: stdoutFd,
      stderr: stderrFd
    });

    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    const instance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.wasiImport
    });

    const exitCode = wasi.start(instance) || 0;

    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);

    const stdout = fs.readFileSync(stdoutPath, 'utf8');
    const stderr = fs.readFileSync(stderrPath, 'utf8');

    return { stdout, stderr, exitCode };
  } catch (err: any) {
    try { fs.closeSync(stdoutFd); } catch {}
    try { fs.closeSync(stderrFd); } catch {}
    return {
      stdout: '',
      stderr: `WASI Runtime Exception: ${err.message}`,
      exitCode: -1
    };
  } finally {
    try { fs.unlinkSync(stdoutPath); } catch {}
    try { fs.unlinkSync(stderrPath); } catch {}
  }
}
