// JSON request on stdin or in one file. Keep usage and I/O failures distinct from request errors.
import { readFile } from 'node:fs/promises';
import { stdin } from 'node:process';
import { text } from 'node:stream/consumers';

/** @param {(request: any) => any} submit */
export async function runJsonCli(submit) {
  const args = process.argv.slice(2);
  try {
    if (args.length > 1 || (args[0]?.startsWith('-') && args[0] !== '-') ||
        ((!args.length || args[0] === '-') && stdin.isTTY)) {
      throw Object.assign(new Error('Pass one JSON file or pipe a request on stdin.'), { code: 'usage' });
    }
    const input = args[0] && args[0] !== '-' ? await readFile(args[0], 'utf8') : await text(stdin);
    let request;
    try { request = JSON.parse(input); }
    catch { throw Object.assign(new Error('Expected valid JSON.'), { code: 'invalid_json' }); }
    const result = await submit(request);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    const io = typeof error.syscall === 'string';
    const code = io ? 'io_error' : error.code || 'operation_failed';
    process.stderr.write(JSON.stringify({ error: { code, message: error.message, issues: error.issues || [] } }) + '\n');
    process.exitCode = io || code === 'usage' ? 2 : 1;
  }
}
