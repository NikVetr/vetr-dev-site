// The publishing boundary, checked rather than remembered.
//
// Publication of this site is `git push`: GitHub Pages serves `main` as it is, so
// anything tracked at the repository root is on the public web. The native projects
// (`android/`, `ios/`), the mobile bundle (`dist/`) and the build intermediates are
// kept out by `.gitignore`, and this makes sure they have stayed out -- an ignore
// rule is one `git add -f` from being a served directory.
import { execFileSync } from 'node:child_process';

const KEEP_OUT = ['android', 'ios', 'dist', 'tmp', 'node_modules', 'test-results'];
const tracked = execFileSync('git', ['ls-files', '--', ...KEEP_OUT], { encoding: 'utf8' })
  .split('\n').filter(Boolean);
if (tracked.length) {
  console.error(`publishing boundary: ${tracked.length} file(s) tracked under ${KEEP_OUT.join(', ')}:\n  ${tracked.slice(0, 10).join('\n  ')}`);
  process.exit(1);
}
console.log(`publishing boundary holds: nothing tracked under ${KEEP_OUT.join(', ')}`);
