import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvaHomeLayout, createCanvaNativeSettings, hideReplacedLibraryCanva } from './canvaNativeDesign.js';

test('the Canva home is native text, images and working library links, without embeds', () => {
  const layout = createCanvaHomeLayout();
  const blocks = layout.sections.flatMap(section => section.columns.flatMap(column => column.blocks));
  assert.ok(blocks.some(block => block.type === 'heading' && block.props.level === 1 && block.props.text.includes('Ready-to-Use')));
  assert.equal(blocks.filter(block => block.type === 'button').length, 2);
  assert.ok(blocks.filter(block => block.type === 'button').every(block => block.props.link === '/library'));
  assert.ok(blocks.some(block => block.type === 'image' && block.props.src === '/images/canva/jewish-materials.png'));
  assert.ok(!blocks.some(block => ['canva', 'html', 'iframe'].includes(block.type)));
});

test('native setup preserves existing home sections and is repeatable', () => {
  const custom = { id: 'client-notice', props: {}, columns: [{ id: 'client-column', span: 12, blocks: [] }] };
  const first = createCanvaHomeLayout({ sections: [custom] });
  const second = createCanvaHomeLayout(first);
  assert.deepEqual(second, first);
  assert.equal(second.sections.filter(section => section.id === custom.id).length, 1);
});

test('only the duplicated library design is hidden; other pages and Canva materials remain', () => {
  const reference = 'https://www.canva.com/design/reference/view';
  const block = (id, url) => ({ id, type: 'canva', props: { url } });
  const document = { version: 2, pages: {
    library: { slots: { 'before-library': { sections: [{ columns: [{ blocks: [block('duplicate', reference), block('other', 'https://www.canva.com/design/lesson/view')] }] }] } } },
    resource: { slots: { 'before-resource': { sections: [{ columns: [{ blocks: [block('lesson', reference)] }] }] } } },
  } };
  const changed = JSON.parse(hideReplacedLibraryCanva(JSON.stringify(document), reference));
  const blocks = changed.pages.library.slots['before-library'].sections[0].columns[0].blocks;
  assert.equal(blocks[0].props.hidden, true);
  assert.equal(blocks[1].props.hidden, undefined);
  assert.deepEqual(changed.pages.resource, document.pages.resource);
  assert.equal(document.pages.library.slots['before-library'].sections[0].columns[0].blocks[0].props.hidden, undefined);
});

test('the setting patch leaves Canva reference, Analytics, accounts, payments and download policy intact', () => {
  const previous = { home_canva_url: 'https://www.canva.com/design/reference/view', google_analytics_id: 'G-EXAMPLE', download_limit_max: '10', paypal_enabled: 'true', theme_custom_css: '.client-notice { color: red; }' };
  const patch = createCanvaNativeSettings(previous, '.k5-site { color: #003366; }');
  assert.equal(patch.canva_integration_mode, 'native');
  assert.equal(patch.library_root_catalog_show, 'true');
  assert.equal(patch.home_canva_url, '');
  assert.equal(patch.canva_design_reference_url, previous.home_canva_url);
  for (const key of ['google_analytics_id', 'download_limit_max', 'paypal_enabled']) assert.ok(!(key in patch));
  assert.ok(patch.theme_custom_css.startsWith(previous.theme_custom_css));
  const repeated = createCanvaNativeSettings({ ...previous, ...patch }, '.k5-site { color: #003366; }');
  assert.equal(repeated.theme_custom_css, patch.theme_custom_css);
  assert.deepEqual(previous, { home_canva_url: 'https://www.canva.com/design/reference/view', google_analytics_id: 'G-EXAMPLE', download_limit_max: '10', paypal_enabled: 'true', theme_custom_css: '.client-notice { color: red; }' });
});
