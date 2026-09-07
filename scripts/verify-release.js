const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backendRoot = path.join(root, 'backend');
const frontendRoot = path.join(root, 'frontend');
const frontendIndexPath = path.join(frontendRoot, 'index.html');
const robotsSourcePath = path.join(frontendRoot, 'public', 'robots.txt');
const firebaseConfigPath = path.join(root, 'firebase.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function collectTests(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectTests(full));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) result.push(full);
  }
  return result;
}

function collectJavaScript(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectJavaScript(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(full);
  }
  return result;
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });
}

function runNpm(args, cwd) {
  // Windows can reject direct execFileSync calls to npm.cmd with EINVAL.
  // Invoke it through the system command interpreter while keeping the
  // working directory and inherited environment explicit.
  if (process.platform === 'win32') {
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `${npm} ${args.join(' ')}`], cwd);
    return;
  }
  run(npm, args, cwd);
}

function assertFrontendEntry() {
  if (!fs.existsSync(frontendIndexPath)) {
    throw new Error(`Tracked frontend entry is missing: ${frontendIndexPath}`);
  }
  const html = fs.readFileSync(frontendIndexPath, 'utf8');
  const requiredMarkers = [
    /<title>[^<]+<\/title>/i,
    /<meta\s+name=["']description["']/i,
    /<meta\s+name=["']robots["']/i,
    /<link\s+rel=["']canonical["']/i,
    /<meta\s+property=["']og:title["']/i,
    /<meta\s+name=["']twitter:title["']/i,
  ];
  if (requiredMarkers.some((marker) => !marker.test(html))) {
    throw new Error('frontend/index.html must contain the public SEO shell metadata.');
  }
}

function assertRobotsSource() {
  if (!fs.existsSync(robotsSourcePath)) {
    throw new Error(`Static robots source is missing: ${robotsSourcePath}`);
  }
  const robots = fs.readFileSync(robotsSourcePath, 'utf8');
  for (const marker of ['User-agent: *', 'Disallow: /admin', 'Disallow: /resource/*/download/', 'Sitemap:']) {
    if (!robots.includes(marker)) throw new Error(`robots.txt is missing required rule: ${marker}`);
  }
  if (/<(?:!doctype\s+html|html\b)/i.test(robots)) {
    throw new Error('robots.txt must remain plain text, not an HTML SPA shell.');
  }
}

function assertFirebaseConfig() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  } catch (error) {
    throw new Error(`firebase.json is not readable JSON: ${error.message}`);
  }
  if (config.hosting?.public !== 'frontend/dist') {
    throw new Error('Firebase Hosting must publish frontend/dist.');
  }
  const rewrites = config.hosting?.rewrites || [];
  const sources = rewrites.map((rewrite) => rewrite.source);
  for (const source of ['/robots.txt', '/sitemap.xml']) {
    const rewrite = rewrites.find((item) => item.source === source && item.function === 'api');
    if (!rewrite) throw new Error(`Firebase must rewrite ${source} to the api function.`);
  }
  for (const source of ['/resource/*/download/**', '/resource/*/present/**']) {
    const rewriteIndex = rewrites.findIndex((item) => item.source === source && item.destination === '/index.html');
    const functionIndex = rewrites.findIndex((item) => item.source === '/resource/**' && item.function === 'api');
    if (rewriteIndex === -1 || functionIndex === -1 || rewriteIndex > functionIndex) {
      throw new Error(`${source} must reach the SPA shell before the generic resource function rewrite.`);
    }
  }
  for (const source of ['/admin', '/admin/**', '/resource/*/download/**', '/resource/*/present/**']) {
    const headerConfig = (config.hosting?.headers || []).find((item) => item.source === source);
    const robotsHeader = headerConfig?.headers?.find((header) => header.key.toLowerCase() === 'x-robots-tag');
    if (!robotsHeader || !/^noindex\s*,/i.test(String(robotsHeader.value))) {
      throw new Error(`${source} must emit an X-Robots-Tag noindex header.`);
    }
  }
  if (sources[sources.length - 1] !== '**') {
    throw new Error('Firebase SPA catch-all rewrite must remain last.');
  }
}

function assertPortableReleaseScripts() {
  const releaseScriptDirs = [path.join(root, 'deploy'), path.join(root, 'scripts')];
  const fixedPathPattern = /(?:\/var\/www|\/mnt\/g|\/home\/|git rev-parse --show-toplevel)/;
  for (const directory of releaseScriptDirs) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(?:sh|bat)$/.test(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (fixedPathPattern.test(fs.readFileSync(file, 'utf8'))) {
        throw new Error(`Release script contains a fixed historical path: ${file}`);
      }
    }
  }
}

function generateSeoShell() {
  const source = path.join(frontendRoot, 'dist', 'index.html');
  const generatedDir = path.join(backendRoot, 'generated');
  const target = path.join(generatedDir, 'index.html');
  if (!fs.existsSync(source)) throw new Error(`Frontend build output is missing: ${source}`);
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.copyFileSync(source, target);
}

function assertGeneratedSeoShell() {
  const source = path.join(frontendRoot, 'dist', 'index.html');
  const target = path.join(backendRoot, 'generated', 'index.html');
  if (!fs.existsSync(source) || !fs.existsSync(target)) {
    throw new Error('Generated SEO shell is missing after the frontend build.');
  }
  const sourceHtml = fs.readFileSync(source, 'utf8');
  const generatedHtml = fs.readFileSync(target, 'utf8');
  if (sourceHtml !== generatedHtml) {
    throw new Error('backend/generated/index.html must be copied from the same frontend build.');
  }

  const distRoot = path.join(frontendRoot, 'dist');
  const missing = [];
  for (const match of generatedHtml.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1].split(/[?#]/, 1)[0];
    if (!reference.startsWith('/assets/')) continue;
    const asset = path.join(distRoot, reference.slice(1));
    if (!fs.existsSync(asset)) missing.push(asset);
  }
  if (missing.length) {
    throw new Error(`Generated SEO shell references missing assets:\n${missing.join('\n')}`);
  }
}

function assertBuiltAssets() {
  const distRoot = path.join(frontendRoot, 'dist');
  const indexPath = path.join(distRoot, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error(`Frontend build output is missing: ${indexPath}`);

  const references = new Set();
  const addReferences = (content, bundlePath) => {
    const pattern = /(?:src|href|import\s*\(|\bfrom\s*)\s*["']([^"']+)["']/g;
    for (const match of content.matchAll(pattern)) {
      const reference = match[1].split(/[?#]/, 1)[0];
      if (!reference || reference.startsWith('http:') || reference.startsWith('https:') || reference.startsWith('data:')) continue;
      // Bundlers keep diagnostic examples such as import('./MyPage.vue') in
      // the runtime. Only validate references that can be emitted assets.
      if (!/\.(?:js|mjs|css|json|png|jpe?g|gif|svg|webp|woff2?|ttf|wasm)$/i.test(reference)) continue;
      if (reference.startsWith('/')) references.add(path.join(distRoot, reference.slice(1)));
      else if (reference.startsWith('.')) references.add(path.resolve(path.dirname(bundlePath), reference));
    }
  };

  addReferences(fs.readFileSync(indexPath, 'utf8'), indexPath);
  for (const file of collectFiles(distRoot)) {
    if (!file.endsWith('.js')) continue;
    addReferences(fs.readFileSync(file, 'utf8'), file);
  }

  const missing = [...references].filter((file) => !fs.existsSync(file));
  if (missing.length) {
    throw new Error(`Frontend build references missing assets:\n${missing.join('\n')}`);
  }
}

function collectFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectFiles(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

function main() {
  assertFrontendEntry();
  assertRobotsSource();
  assertFirebaseConfig();
  assertPortableReleaseScripts();
  if (!String(process.env.VITE_FIREBASE_API_KEY || '').trim()) {
    throw new Error('VITE_FIREBASE_API_KEY must be injected by the release environment.');
  }

  runNpm(['run', 'build'], frontendRoot);
  assertBuiltAssets();
  generateSeoShell();
  assertGeneratedSeoShell();
  run(process.execPath, ['--test', ...collectTests(backendRoot)], root);
  run(process.execPath, ['--test', ...collectTests(path.join(frontendRoot, 'src'))], frontendRoot);
  run(process.execPath, ['--test', ...collectTests(path.join(root, 'scripts'))], root);
  for (const file of collectJavaScript(backendRoot)) run(process.execPath, ['--check', file], root);
  console.log('Release verification passed.');
}

if (require.main === module) main();

module.exports = {
  assertFrontendEntry,
  assertRobotsSource,
  assertFirebaseConfig,
  assertPortableReleaseScripts,
  assertBuiltAssets,
  assertGeneratedSeoShell,
  collectJavaScript,
  collectTests,
};
