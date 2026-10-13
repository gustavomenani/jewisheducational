const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Restore one screen when production contains changes whose source is not
// available locally. Keep every existing bundle and map only Settings to the
// restored module. A normal build does not need this recovery overlay.
function prepareSettingsRestore({ currentDist, settingsBundle, outputDist }) {
  const html = fs.readFileSync(path.join(currentDist, 'index.html'), 'utf8');
  const maps = [...html.matchAll(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (maps.length > 1) throw new Error('The current shell has competing import maps.');
  let existingMap = {};
  if (maps.length) {
    try { existingMap = JSON.parse(maps[0][1]); }
    catch { throw new Error('The current import map is not valid JSON.'); }
    if (!existingMap || typeof existingMap !== 'object' || Array.isArray(existingMap)
      || (existingMap.imports && (typeof existingMap.imports !== 'object' || Array.isArray(existingMap.imports)))) {
      throw new Error('The current import map is not valid.');
    }
  }
  const entry = html.match(/<script\b[^>]*src=["'](\/assets\/index-[^"']+\.js)["']/i)?.[1];
  if (!entry) throw new Error('The current frontend entry was not found.');
  const main = fs.readFileSync(path.join(currentDist, entry.slice(1)), 'utf8');
  const oldSettings = [...new Set(main.match(/SettingsView-[\w-]+\.js/g) || [])];
  if (oldSettings.length !== 1) throw new Error('The current entry must reference exactly one Settings screen.');
  if (Object.values(existingMap.scopes || {}).some(scope => Object.hasOwn(scope, `/assets/${oldSettings[0]}`))) {
    throw new Error('A scoped Settings import would override the repaired screen.');
  }
  const assetDir = path.join(currentDist, 'assets');
  let settings = fs.readFileSync(settingsBundle, 'utf8');
  if (!settings.includes('home_canva_url') || !settings.includes('Canva design link')) {
    throw new Error('The restored screen must expose the Canva home field.');
  }
  settings = settings.replace(/from\s*(["'])(\.\/([^"']+\.js))\1/g, (match, quote, relative, name) => {
    const stem = name.replace(/-[\w-]+\.js$/, '');
    const target = stem === 'index'
      ? path.basename(entry)
      : fs.readdirSync(assetDir).filter(file => file.startsWith(`${stem}-`) && file.endsWith('.js'));
    if (Array.isArray(target) && target.length !== 1) {
      throw new Error(`The current dependency ${stem} is missing or ambiguous.`);
    }
    return `from${quote}./${Array.isArray(target) ? target[0] : target}${quote}`;
  });
  // Both shared dependencies must retain the export names expected by the
  // restored screen. Reject an incompatible build before creating output.
  for (const match of settings.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']\.\/([^"']+)["']/g)) {
    const dependency = fs.readFileSync(path.join(assetDir, match[2]), 'utf8');
    const exported = new Set([...dependency.matchAll(/export\s*\{([^}]+)\}/g)]
      .flatMap(item => item[1].split(',').map(value => value.trim().split(/\s+as\s+/).pop())));
    for (const imported of match[1].split(',').map(value => value.trim().split(/\s+as\s+/)[0])) {
      if (!exported.has(imported)) throw new Error(`Dependency ${match[2]} does not export ${imported}.`);
    }
  }
  const restoredName = `SettingsView-${crypto.createHash('sha256').update(settings).digest('hex').slice(0, 12)}.js`;
  const imports = { ...existingMap.imports, [`/assets/${oldSettings[0]}`]: `/assets/${restoredName}` };
  const map = `<script type="importmap">${JSON.stringify({ ...existingMap, imports }).replaceAll('<', '\\u003c')}</script>`;
  const restoredHtml = maps.length
    ? html.replace(maps[0][0], () => map)
    : html.replace(/<head\b[^>]*>/i, head => `${head}\n    ${map}`);
  if (restoredHtml === html) throw new Error('The current shell has no head element.');
  const relativeOutput = path.relative(path.resolve(currentDist), path.resolve(outputDist));
  if (!relativeOutput || (!relativeOutput.startsWith('..' + path.sep) && relativeOutput !== '..' && !path.isAbsolute(relativeOutput))) {
    throw new Error('Use a separate output directory outside the current build.');
  }
  fs.cpSync(currentDist, outputDist, { recursive: true });
  fs.writeFileSync(path.join(outputDist, 'assets', restoredName), settings);
  fs.writeFileSync(path.join(outputDist, 'index.html'), restoredHtml);
  return { oldSettings: oldSettings[0], restoredSettings: restoredName, entry, imports };
}

if (require.main === module) {
  const [currentDist, settingsBundle, outputDist] = process.argv.slice(2);
  if (!currentDist || !settingsBundle || !outputDist) {
    console.error('Usage: node scripts/restore-admin-settings.js <current-dist> <compiled-settings> <output-dist>');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(prepareSettingsRestore({ currentDist, settingsBundle, outputDist }))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}

module.exports = { prepareSettingsRestore };
