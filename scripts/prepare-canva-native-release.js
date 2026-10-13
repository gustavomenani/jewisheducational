const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prepareSettingsRestore } = require('./restore-admin-settings');

// The published editor predates the native home and leaves its legacy block
// inspector closed. Keep its exact code, adding only the same selection bridge
// as EditorWorkspace.vue. Reject other builds instead of guessing minified names.
function enableNativeBlockInspector(bundle) {
  const anchor = 'Ne(()=>u.editMode,$=>{U(),$?le():G.value=!1},{immediate:!0})';
  if (!bundle.includes('__name:"EditorWorkspace",setup(D){const u=je()')
    || !bundle.includes('function me(){c.openInspector()}')
    || bundle.includes('Ne(()=>u.selectedBlock?.id,$=>{$&&u.editMode&&u.settingValue("canva_integration_mode"')
    || bundle.split(anchor).length !== 2) {
    throw new Error('The published editor is not compatible with the native block inspector bridge.');
  }
  return bundle.replace(anchor, () => 'Ne(()=>u.selectedBlock?.id,$=>{$&&u.editMode&&u.settingValue("canva_integration_mode","")==="native"&&me()}),' + anchor);
}

function prepareCanvaNativeRelease({ currentDist, settingsBundle, outputDist, imageDirectory }) {
  const result = prepareSettingsRestore({ currentDist, settingsBundle, outputDist });
  const entry = fs.readFileSync(path.join(currentDist, result.entry.slice(1)), 'utf8');
  const layouts = [...new Set(entry.match(/PublicLayout-[\w-]+\.js/g) || [])];
  if (layouts.length !== 1) throw new Error('The current entry must reference exactly one public layout.');
  const nativeLayout = enableNativeBlockInspector(fs.readFileSync(path.join(currentDist, 'assets', layouts[0]), 'utf8'));
  const nativeLayoutName = `PublicLayout-${crypto.createHash('sha256').update(nativeLayout).digest('hex').slice(0, 12)}.js`;
  fs.writeFileSync(path.join(outputDist, 'assets', nativeLayoutName), nativeLayout);
  const imports = { ...result.imports, [`/assets/${layouts[0]}`]: `/assets/${nativeLayoutName}` };
  const htmlPath = path.join(outputDist, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  fs.writeFileSync(htmlPath, html.replace(JSON.stringify({imports:result.imports}), JSON.stringify({imports})));
  const images = ['jewish-materials.png', 'digital-resources.png'];
  fs.mkdirSync(path.join(outputDist, 'images/canva'), { recursive: true });
  images.forEach(image => fs.copyFileSync(path.join(imageDirectory, image), path.join(outputDist, 'images/canva', image)));
  return { ...result, imports, nativeLayout: nativeLayoutName, addedFiles: [`assets/${result.restoredSettings}`, `assets/${nativeLayoutName}`, ...images.map(image => `images/canva/${image}`)] };
}

module.exports = { prepareCanvaNativeRelease, enableNativeBlockInspector };
