import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const sources = (await readdir('src')).filter(f => f.endsWith('.js'));
await mkdir('dist', { recursive: true });
for (const file of sources) {
  const check = spawnSync(process.execPath, ['--check', `src/${file}`], { stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status ?? 1);
  await copyFile(`src/${file}`, `dist/${file}`);
}
console.log(`Validated and copied ${sources.length} JavaScript module(s). Cordis bundle runs source modules via package exports.`);
