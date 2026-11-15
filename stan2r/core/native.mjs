import { createRequire } from 'node:module';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateRequest, conversionCall, checkedAST, Stan2RError, rString } from './request.js';

const require = createRequire(import.meta.url);
const { stanc } = require('../vendor/stanc.js');
const exec = promisify(execFile);

/** @param {Parameters<typeof validateRequest>[0]} request */
export async function submit(request) {
  const input = validateRequest(request);
  const { ast, warnings } = checkedAST(stanc('model', input.source, ['debug-typed-ast']));
  const dir = await mkdtemp(join(tmpdir(), 'stan2r-'));
  try {
    const manifest = JSON.parse(await readFile(new URL('../vendor/manifest.json', import.meta.url), 'utf8'));
    const sources = Object.keys(manifest.files).map(name => fileURLToPath(new URL(`../vendor/R/${name}`, import.meta.url)));
    sources.push(fileURLToPath(new URL('./bridge.R', import.meta.url)));
    const script = sources.map(path => `source(${rString(path)})`).join('\n') + `
result <- ${conversionCall(input)}
writeChar(result$code, 'result.R', eos=NULL, useBytes=TRUE)
writeLines(result$warnings, 'warnings.txt')
writeLines(result$error, 'error.txt')
writeLines(result$error_code, 'error-code.txt')
`;
    await Promise.all([
      writeFile(join(dir, 'model.stan'), input.source),
      writeFile(join(dir, 'model.ast'), ast),
      writeFile(join(dir, 'convert.R'), script),
    ]);
    try { await exec('Rscript', ['--vanilla', 'convert.R'], { cwd: dir, timeout: 60000, maxBuffer: 1024 * 1024 }); }
    catch (raw) {
      const e = /** @type {Error & {stderr?: string}} */ (raw);
      throw new Stan2RError('RUNTIME_ERROR', `Rscript failed: ${e.stderr || e.message}`);
    }
    const [code, extra, error, errorCode] = await Promise.all(['result.R', 'warnings.txt', 'error.txt', 'error-code.txt'].map(name => readFile(join(dir, name), 'utf8')));
    if (error.trim()) throw new Stan2RError(errorCode.trim(), error.trim(), 'source');
    return { code, mode: input.mode, warnings: [...warnings, ...(extra.trim() ? [extra.trim()] : [])], compiler: 'stanc 2.38.0', translator: 'Stan2R e4f4b15' };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
