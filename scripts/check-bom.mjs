#!/usr/bin/env node
// Blocks UTF-8 BOMs from entering the repo. A BOM in package.json silently
// breaks Vite's PostCSS config resolution — cosmiconfig parses package.json
// with strict JSON.parse before falling back to postcss.config.js, and
// JSON.parse throws on a leading BOM — which makes every CSS module 500 and
// blanks the app. PowerShell's Out-File/Set-Content add a BOM by default and
// git has no attribute that strips one, so we guard at commit time.
import { execFileSync } from 'node:child_process';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function stagedFiles() {
  const out = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    { encoding: 'utf8' },
  );
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

const offenders = [];
for (const file of stagedFiles()) {
  let blob;
  try {
    // The index version is what will be committed — read that, not the disk file.
    blob = execFileSync('git', ['show', `:${file}`]);
  } catch {
    continue; // not readable from the index (submodule, etc.) — nothing to check
  }
  if (blob.length >= 3 && blob.subarray(0, 3).equals(BOM)) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error('\n✖ UTF-8 BOM detected in staged file(s):');
  for (const f of offenders) console.error(`    ${f}`);
  console.error('\nStrip the BOM before committing, e.g.:');
  console.error('    tail -c +4 <file> > <file>.tmp && mv <file>.tmp <file>\n');
  process.exit(1);
}
