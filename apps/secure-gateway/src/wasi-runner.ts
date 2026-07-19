import { WASI } from 'node:wasi';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface WasiResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Read the full contents of an already-open fd into a string.
 * Reading via fd (instead of re-opening by path) avoids CodeQL js/file-system-race
 * because there's no time-of-check-to-time-of-use gap on the filesystem path.
 */
function readAllFromFd(fd: number): string {
  fs.fsyncSync(fd);
  const stat = fs.fstatSync(fd);
  const size = stat.size;
  if (size === 0) return '';
  const buf = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const bytesRead = fs.readSync(fd, buf, offset, size - offset, offset);
    if (bytesRead <= 0) break;
    offset += bytesRead;
  }
  return buf.slice(0, offset).toString('utf8');
}

export async function runWasmCommand(
  wasmPath: string,
  args: string[] = [],
  env: Record<string, string> = {},
  preopens: Record<string, string> = { '/workspace': process.cwd() }
): Promise<WasiResult> {
  const suffix = crypto.randomBytes(8).toString('hex');
  const stdoutPath = path.join(process.cwd(), '.memory', `wasi_stdout_${suffix}.tmp`);
  const stderrPath = path.join(process.cwd(), '.memory', `wasi_stderr_${suffix}.tmp`);

  fs.mkdirSync(path.dirname(stdoutPath), { recursive: true });

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

    const stdout = readAllFromFd(stdoutFd);
    const stderr = readAllFromFd(stderrFd);

    return { stdout, stderr, exitCode };
  } catch (err: any) {
    return {
      stdout: '',
      stderr: `WASI Runtime Exception: ${err.message}`,
      exitCode: -1
    };
  } finally {
    try { fs.closeSync(stdoutFd); } catch {}
    try { fs.closeSync(stderrFd); } catch {}
    try { fs.unlinkSync(stdoutPath); } catch {}
    try { fs.unlinkSync(stderrPath); } catch {}
  }
}
