import { readFile, writeFile } from 'node:fs/promises';

const rootConfigPath = new URL('../wrangler.json', import.meta.url);
const generatedConfigPath = new URL('../dist/server/wrangler.json', import.meta.url);

const rootConfig = JSON.parse(await readFile(rootConfigPath, 'utf8'));
const generatedConfig = JSON.parse(await readFile(generatedConfigPath, 'utf8'));

if (!generatedConfig.main || !generatedConfig.assets?.directory) {
  throw new Error('Astro did not produce a deployable Cloudflare Worker configuration');
}

if (Array.isArray(rootConfig.routes)) {
  generatedConfig.routes = rootConfig.routes;
}

await writeFile(generatedConfigPath, `${JSON.stringify(generatedConfig)}\n`, 'utf8');
console.log(`Prepared ${generatedConfigPath.pathname} with ${generatedConfig.routes?.length ?? 0} production route(s).`);
