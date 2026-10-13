const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareCanvaNativeRelease, enableNativeBlockInspector } = require('./prepare-canva-native-release');
const layout = '__name:"EditorWorkspace",setup(D){const u=je();function me(){c.openInspector()}return Ne(()=>u.editMode,$=>{U(),$?le():G.value=!1},{immediate:!0})}';

test('native release adds photos and Settings while preserving all public modules', t => {
  const base = fs.mkdtempSync(path.join(path.resolve(__dirname, '..'), 'jer-native-test-'));
  t.after(() => fs.rmSync(base, {recursive:true,force:true}));
  const current = path.join(base, 'current'), images = path.join(base, 'images'), out = path.join(base, 'out');
  fs.mkdirSync(path.join(current, 'assets'), {recursive:true});fs.mkdirSync(images);
  fs.writeFileSync(path.join(current, 'index.html'), '<html><head><script type="module" src="/assets/index-live.js"></script></head></html>');
  fs.writeFileSync(path.join(current, 'assets/index-live.js'), 'import("./SettingsView-live.js"); import("./PublicLayout-live.js"); export { store as B };');
  fs.writeFileSync(path.join(current, 'assets/PublicLayout-live.js'), layout);
  fs.writeFileSync(path.join(current, 'assets/SettingsView-live.js'), 'old settings');
  const settings = path.join(base, 'SettingsView-new.js');
  fs.writeFileSync(settings, 'import { B as store } from "./index-new.js"; const key="home_canva_url",label="Canva design link";');
  for (const image of ['jewish-materials.png','digital-resources.png']) fs.writeFileSync(path.join(images,image),Buffer.from([137,80,78,71]));
  const result = prepareCanvaNativeRelease({currentDist:current,settingsBundle:settings,outputDist:out,imageDirectory:images});
  assert.equal(fs.readFileSync(path.join(out,'assets/PublicLayout-live.js'),'utf8'),layout);
  assert.equal(fs.readFileSync(path.join(out,'assets',result.nativeLayout),'utf8'),enableNativeBlockInspector(layout));
  assert.equal(result.imports['/assets/PublicLayout-live.js'],`/assets/${result.nativeLayout}`);
  assert.equal(fs.readFileSync(path.join(out,'assets/index-live.js'),'utf8'),fs.readFileSync(path.join(current,'assets/index-live.js'),'utf8'));
  assert.equal(result.addedFiles.length,4);
  assert.ok(fs.existsSync(path.join(out,'images/canva/jewish-materials.png')));
});

test('inspector bridge rejects unknown and already patched editor bundles', () => {
  assert.throws(() => enableNativeBlockInspector('different editor'), /not compatible/);
  assert.throws(() => enableNativeBlockInspector(layout + layout), /not compatible/);
  const patched = enableNativeBlockInspector(layout);
  assert.throws(() => enableNativeBlockInspector(patched), /not compatible/);
  assert.equal(patched.replace('Ne(()=>u.selectedBlock?.id,$=>{$&&u.editMode&&u.settingValue("canva_integration_mode","")==="native"&&me()}),',''), layout);
});
