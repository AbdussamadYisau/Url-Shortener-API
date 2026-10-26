import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const tailwind = fileURLToPath(new URL('../node_modules/@tailwindcss/cli/dist/index.mjs', import.meta.url));
const watching = process.argv.includes('--watch');
await mkdir('public', {recursive:true});
const css = spawn(process.execPath, [tailwind, '-i', 'frontend/style.css', '-o', 'public/style.css', '--minify', ...(watching ? ['--watch=always'] : [])], {stdio:'inherit'});
css.on('error', error => { console.error(error); process.exit(1); });
if (!watching) await new Promise((resolve,reject) => css.on('exit', code => code === 0 ? resolve() : reject(new Error('Tailwind build failed'))));
import { copyFile, mkdir } from 'node:fs/promises';
await Promise.all([copyFile('frontend/index.html','public/index.html')]);
const options = {entryPoints:['frontend/main.jsx'],bundle:true,outfile:'public/app.js',format:'esm',jsx:'automatic',minify:true,target:['es2022'],define:{'process.env.NODE_ENV':'"production"'}};
if (process.argv.includes('--watch')) {
  const {context} = await import('esbuild');
  const ctx = await context(options); await ctx.watch(); console.log('Watching React frontend…');
} else await build(options);
