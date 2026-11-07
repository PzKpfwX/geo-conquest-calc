import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/src/', root), { recursive: true });
for (const file of ['index.html', 'src/app.js', 'src/calculations.js', 'src/storage.js', 'src/styles.css']) {
  await copyFile(new URL(file, root), new URL(`dist/${file}`, root));
}
console.log('Static site built in dist/');
