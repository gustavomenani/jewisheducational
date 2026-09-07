/*
 * Headless smoke audit for the Google Sites-style visual editor.
 * The project intentionally does not ship Playwright as an app dependency.
 * Run with a workspace Playwright runtime (the Codex runtime provides one).
 */
const path = require('node:path');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (primaryError) {
    const candidates = [
      process.env.CODEX_NODE_MODULES,
      path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules'),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        return require(path.join(candidate, 'playwright'));
      } catch {
        // Try the next workspace-provided runtime.
      }
    }
    primaryError.message += ' Install Playwright or set CODEX_NODE_MODULES to a workspace runtime.';
    throw primaryError;
  }
}

const { chromium } = loadPlaywright();

const baseUrl = process.env.EDITOR_AUDIT_URL || 'http://localhost:5173';
const browserPath = process.env.CHROMIUM_PATH
  || 'C:\\Users\\User\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1232\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const screenshotPath = process.env.EDITOR_AUDIT_SCREENSHOT
  || 'C:\\Users\\User\\\.codex\\visualizations\\2026\\07\\31\\019fb9f6-a65b-7392-aa91-6229b6b5dadb\\editor-clarity-after.png';

function exactButton(page, name) {
  return page.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&'), 'i') }).first();
}

async function dismissConfirm(page) {
  page.once('dialog', (dialog) => dialog.accept());
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: browserPath });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console:${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror:${error.stack || error.message}`));

    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 20000 });
    if (await page.locator('input[type=email]').count()) {
      await page.locator('input[type=email]').fill(process.env.EDITOR_AUDIT_EMAIL || 'admin@example.com');
      await page.locator('input[type=password]').fill(process.env.EDITOR_AUDIT_PASSWORD || 'admin123');
      await exactButton(page, 'Log in').click();
      await page.waitForTimeout(700);
    }

    // Keep the smoke audit repeatable when it is run against the local
    // fallback database. The audit intentionally hides/removes these fields
    // later, so restore their visible baseline before each run.
    await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings: {
          hero_lead: 'Hebrew, Torah, holidays and more for early childhood Jewish education and schools.',
          hero_lead_show: 'true',
          home_benefit_1_title: 'Instant download',
          home_benefit_1_title_show: 'true',
          home_hero_image: '/images/hero/mascot-bear.png',
          home_hero_image_show: 'true',
          home_hero_cta_primary_show: 'true',
          home_hero_cta_secondary_show: 'true',
        } }),
      });
    });

    await page.evaluate(() => {
      localStorage.removeItem('builder_draft_home');
      localStorage.removeItem('builder_draft_library');
      localStorage.removeItem('builder_draft_resource');
      localStorage.removeItem('builder_draft_download');
    });

    await page.goto(`${baseUrl}/?edit=1`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('.editor-topbar, .editor-launcher', { state: 'visible' });
    await page.waitForTimeout(500);
    if (await page.locator('.editor-launcher').count()) {
      throw new Error('The authenticated session did not activate the editor.');
    }

    const shellVisible = await page.locator('.editor-topbar').isVisible();
    const sidebarVisible = await page.locator('.editor-sidebar').isVisible();
    const oldFloatingSurfaceCount = await page.locator('.builder-ui, .panel').count();
    const quickStartVisible = await page.locator('.editor-help-popover').isVisible().catch(() => false);

    const baselineBlocks = await page.locator('.br-block').count();
    const insertTab = exactButton(page, 'Insert');
    await insertTab.click();

    async function addBasic(label) {
      if (await page.locator('.editor-sidebar-context').count()) {
        await exactButton(page, 'Back to tools').click();
      }
      await page.locator('.editor-palette-card').filter({ hasText: label }).first().click();
      await page.waitForTimeout(120);
    }

    await addBasic('Text');
    await addBasic('Image');
    await addBasic('Button');
    const blocksAfterInsert = await page.locator('.br-block').count();
    const inspectorVisible = await page.locator('.editor-inspector').isVisible();

    const insertedText = page.getByText('Write your text here.', { exact: true }).last();
    const insertedTextVisible = await insertedText.isVisible().catch(() => false);
    if (insertedTextVisible) await insertedText.click();
    const textFieldVisible = await page.locator('#editor-block-text').isVisible().catch(() => false);
    if (textFieldVisible) await page.locator('#editor-block-text').fill('Plain text edited');
    await page.waitForTimeout(250);
    const textEdited = textFieldVisible
      && await page.locator('#editor-block-text').inputValue().catch(() => '') === 'Plain text edited';
    const clearTextButton = exactButton(page, 'Clear text');
    const clearTextVisible = await clearTextButton.isVisible().catch(() => false);
    if (clearTextVisible) await clearTextButton.click();
    await page.waitForTimeout(180);
    const textCleared = clearTextVisible && await page.locator('#editor-block-text').inputValue().catch(() => '') === '';

    const imageBlock = page.locator('.br-block').filter({ has: page.locator('.image-block') }).last();
    await imageBlock.click();
    const removeImageVisible = await exactButton(page, 'Remove image').isVisible().catch(() => false);

    if (await page.locator('.editor-inspector-close').count()) await page.locator('.editor-inspector-close').click();
    const addPointCount = await page.locator('.br-add-point').count();
    if (addPointCount) await page.locator('.br-add-point').first().click();
    const addPointOpensInsert = addPointCount > 0 && await page.locator('.editor-sidebar-tabs button.active').filter({ hasText: 'Insert' }).count() > 0;
    if (await page.locator('.editor-sidebar-context').count()) await exactButton(page, 'Back to tools').click();
    await page.locator('.br-block').filter({ has: page.locator('.builder-btn') }).last().click();
    await page.waitForTimeout(80);

    const linkField = page.locator('#editor-block-link');
    if (await linkField.count()) await linkField.fill('/library');
    const buttonBlock = page.locator('.br-block').filter({ has: page.locator('.builder-btn') }).last();
    const placementPanel = page.locator('.editor-simple-placement').first();
    const simplePlacementVisible = await placementPanel.isVisible().catch(() => false);
    const centerPlacementButton = placementPanel.locator('button[title="Align center"]');
    const centerPlacementVisible = await centerPlacementButton.isVisible().catch(() => false);
    if (centerPlacementVisible) await centerPlacementButton.click();
    const normalWidthButton = placementPanel.locator('.editor-width-button', { hasText: 'Normal' }).first();
    if (await normalWidthButton.isVisible().catch(() => false)) await normalWidthButton.click();
    const normalSpaceButton = placementPanel.locator('.editor-space-row .editor-choice-button', { hasText: 'Normal space' }).first();
    if (await normalSpaceButton.isVisible().catch(() => false)) await normalSpaceButton.click();
    await page.waitForTimeout(80);
    const simpleAlignmentWorked = centerPlacementVisible && await buttonBlock.locator('.builder-btn').evaluate((element) => (
      getComputedStyle(element.parentElement).textAlign === 'center'
    ));
    const simplePlacementStyle = await buttonBlock.evaluate((element) => ({
      gridColumn: element.style.gridColumn,
      marginTop: element.style.marginTop,
      marginBottom: element.style.marginBottom,
    }));
    const simpleWidthWorked = simplePlacementStyle.gridColumn === '4 / span 6';
    const simpleSpacingWorked = simplePlacementStyle.marginTop === '32px' && simplePlacementStyle.marginBottom === '32px';
    const selectedButtonByInspector = await page.locator('.editor-selection-note').filter({ hasText: 'Button' }).count();

    const beforeDuplicate = await page.locator('.br-block').count();
    await exactButton(page, 'Duplicate').click();
    await page.waitForTimeout(120);
    const afterDuplicate = await page.locator('.br-block').count();
    const duplicateWorked = afterDuplicate === beforeDuplicate + 1;

    const moveUp = exactButton(page, 'Move up');
    const moveEnabledBefore = await moveUp.isEnabled().catch(() => false);
    if (moveEnabledBefore) await moveUp.click();
    const moveWorked = moveEnabledBefore;

    const hideBlock = exactButton(page, 'Hide block');
    const hideBlockVisible = await hideBlock.isVisible().catch(() => false);
    if (hideBlockVisible) await hideBlock.click();
    await page.waitForTimeout(100);
    const hiddenBlockVisible = await page.locator('.br-hidden-placeholder').last().isVisible().catch(() => false);
    if (hiddenBlockVisible) await page.locator('.br-hidden-placeholder').last().getByRole('button', { name: 'Restore block', exact: true }).click();
    const blockRestored = hiddenBlockVisible && await page.locator('.br-hidden-placeholder').count() === 0;

    if (await page.locator('.editor-inspector-close').count()) await page.locator('.editor-inspector-close').click();
    const firstSection = page.locator('.br-section').first();
    await firstSection.click({ position: { x: 8, y: 8 } });
    const sectionInspectorVisible = await page.locator('.editor-selection-note').filter({ hasText: 'Section settings' }).isVisible().catch(() => false);
    const sectionPlacementPanel = page.locator('.editor-simple-placement').first();
    const simpleSectionLayoutVisible = await sectionPlacementPanel.isVisible().catch(() => false);
    const twoColumnsButton = sectionPlacementPanel.locator('.editor-section-layout-button', { hasText: 'Two columns' });
    if (await twoColumnsButton.isVisible().catch(() => false)) await twoColumnsButton.click();
    const comfortableSpaceButton = sectionPlacementPanel.locator('.editor-section-space-row .editor-choice-button', { hasText: 'Comfortable space' });
    if (await comfortableSpaceButton.isVisible().catch(() => false)) await comfortableSpaceButton.click();
    await page.waitForTimeout(80);
    const simpleSectionLayoutWorked = simpleSectionLayoutVisible && await firstSection.locator('.br-col').count() === 2;
    const simpleSectionSpaceWorked = simpleSectionLayoutVisible && await firstSection.evaluate((element) => (
      element.style.paddingTop === '80px' && element.style.paddingBottom === '80px'
    ));

    if (await page.locator('.editor-inspector-close').count()) await page.locator('.editor-inspector-close').click();
    const heroButton = page.locator('.k5-hero-actions .editable-setting').first();
    const heroButtonsBeforeHide = await page.locator('.k5-hero-actions .k5-hero-btn').count();
    await heroButton.click();
    const hideButton = exactButton(page, 'Hide this button');
    const hideButtonVisible = await hideButton.isVisible().catch(() => false);
    if (hideButtonVisible) await hideButton.click();
    await page.waitForTimeout(150);
    const heroButtonsAfterHide = await page.locator('.k5-hero-actions .k5-hero-btn').count();
    if (await page.locator('.editor-inspector-close').count()) await page.locator('.editor-inspector-close').click();

    const heroLead = page.locator('.k5-hero-lead').first();
    const heroLeadBeforeRemove = await heroLead.innerText().catch(() => '');
    await heroLead.click();
    const removeTextButton = exactButton(page, 'Remove text');
    const removeTextVisible = await removeTextButton.isVisible().catch(() => false);
    if (removeTextVisible) await removeTextButton.click();
    await page.waitForTimeout(120);
    const heroLeadAfterRemove = await heroLead.innerText().catch(() => '');
    const heroLeadRemoved = removeTextVisible && heroLeadAfterRemove.trim() === '';
    if (await page.locator('.editor-inspector-close').count()) await page.locator('.editor-inspector-close').click();

    const benefitTitle = page.locator('.k5-benefit-card .editable-setting').first();
    const benefitTitleBeforeRemove = await benefitTitle.innerText().catch(() => '');
    await benefitTitle.click();
    const benefitFieldVisible = await page.locator('#editor-setting-home_benefit_1_title').isVisible().catch(() => false);
    if (benefitFieldVisible) await page.locator('#editor-setting-home_benefit_1_title').fill('Fast access');
    await page.waitForTimeout(100);
    const benefitEdited = await page.getByText('Fast access', { exact: true }).count() > 0;
    const benefitRemoveButton = exactButton(page, 'Remove text');
    const benefitRemoveVisible = await benefitRemoveButton.isVisible().catch(() => false);
    if (benefitRemoveVisible) await benefitRemoveButton.click();
    await page.waitForTimeout(120);
    const benefitTitleRemoved = benefitRemoveVisible && (await benefitTitle.innerText()).trim() === '';
    if (await page.locator('.editor-inspector-close').count()) await page.locator('.editor-inspector-close').click();

    const heroImage = page.locator('.k5-hero-visual .editable-image').first();
    await heroImage.click();
    const imageInspectorVisible = await page.locator('.editor-upload-button').filter({ hasText: 'Upload image' }).isVisible().catch(() => false);
    const heroImagesBeforeRemove = await page.locator('.k5-hero-visual img').count();
    const removeSettingImage = exactButton(page, 'Remove image');
    const removeSettingImageVisible = await removeSettingImage.isVisible().catch(() => false);
    if (removeSettingImageVisible) await removeSettingImage.click();
    await page.waitForTimeout(120);
    const heroImagesAfterRemove = await page.locator('.k5-hero-visual img').count();
    const heroImageRemoved = removeSettingImageVisible && heroImagesAfterRemove === Math.max(0, heroImagesBeforeRemove - 1);
    if (await page.locator('.editor-inspector-close').count()) await page.locator('.editor-inspector-close').click();

    await exactButton(page, 'Pages').click();
    await page.locator('.editor-page-item').filter({ hasText: 'Library' }).click();
    const pageSwitchConfirm = page.locator('.editor-workspace-confirm');
    if (await pageSwitchConfirm.isVisible().catch(() => false)) {
      await pageSwitchConfirm.getByRole('button', { name: 'Switch page', exact: true }).click();
    }
    await page.waitForTimeout(500);
    const libraryPageSelected = page.url().includes('/library') && await page.locator('.editor-page-pill').filter({ hasText: 'Library' }).isVisible().catch(() => false);
    await page.locator('.editor-page-item').filter({ hasText: 'Home' }).click();
    if (await pageSwitchConfirm.isVisible().catch(() => false)) {
      await pageSwitchConfirm.getByRole('button', { name: 'Switch page', exact: true }).click();
    }
    await page.waitForTimeout(500);

    // Content tab: the simple Google Sites/Wix-style reversible workflow.
    await exactButton(page, 'Content').click();
    const contentTabsVisible = await page.locator('.editor-content-tabs').isVisible().catch(() => false);
    const contentRowsBefore = await page.locator('.editor-content-row').count();
    await exactButton(page, 'Add topic').click();
    const topicForm = page.locator('.editor-content-form').first();
    const topicFormVisible = await topicForm.isVisible().catch(() => false);
    if (topicFormVisible) {
      await topicForm.locator('input').first().fill('Audit Topic');
      await exactButton(page, 'Save topic').click();
    }
    const auditTopicVisible = await page.getByText('Audit Topic', { exact: true }).count() > 0;
    const auditTopicRow = page.locator('.editor-content-row').filter({ hasText: 'Audit Topic' }).first();
    if (auditTopicVisible) {
      await auditTopicRow.getByRole('button', { name: 'Hide', exact: true }).click();
      await page.locator('.editor-confirm-dialog').getByRole('button', { name: 'Hide', exact: true }).click();
    }
    const showRemoved = exactButton(page, 'Removed');
    if (await showRemoved.count()) await showRemoved.click();
    const auditTopicRemoved = auditTopicVisible && await page.getByText('Audit Topic', { exact: true }).count() > 0;
    const removedRow = page.locator('.editor-content-row').filter({ hasText: 'Audit Topic' }).first();
    if (await removedRow.count()) await removedRow.getByRole('button', { name: 'Restore', exact: true }).click();
    await exactButton(page, 'Visible').click();
    const auditTopicRestored = auditTopicVisible && await page.getByText('Audit Topic', { exact: true }).count() > 0;
    await exactButton(page, 'Categories').click();
    const categoriesTabVisible = await page.locator('.editor-content-tabs button.active').filter({ hasText: 'Categories' }).count() > 0;
    await exactButton(page, 'Materials').click();
    const materialsTabVisible = await page.locator('.editor-content-tabs button.active').filter({ hasText: 'Materials' }).count() > 0;

    const addMaterialButton = exactButton(page, 'New material');
    await addMaterialButton.click();
    const materialForm = page.locator('.editor-content-form').last();
    // New items are provisional: give the material a real title and save it
    // before managing its files.
    await materialForm.locator('input').first().fill('Audit material');
    await materialForm.getByRole('button', { name: 'Save item', exact: true }).click();
    await page.waitForTimeout(100);
    const materialFileInput = materialForm.locator('input[type=file][multiple]');
    await materialFileInput.setInputFiles([
      { name: 'audit-one.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-audit-one') },
      { name: 'audit-two.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from('pptx-audit-two') },
    ]);
    await page.waitForTimeout(100);
    const uploadedFileRows = materialForm.locator('.editor-file-row');
    const multipleUploadsWorked = await uploadedFileRows.count() === 2;
    const firstFileNameBeforeMove = multipleUploadsWorked ? await uploadedFileRows.nth(0).locator('.editor-file-label').inputValue() : '';
    if (multipleUploadsWorked) await uploadedFileRows.nth(0).getByTitle('Move file down').click();
    const firstFileNameAfterMove = multipleUploadsWorked ? await uploadedFileRows.nth(0).locator('.editor-file-label').inputValue() : '';
    const fileReorderWorked = multipleUploadsWorked && firstFileNameBeforeMove !== firstFileNameAfterMove;
    const fileToHide = materialForm.locator('.editor-file-row').first();
    if (await fileToHide.count()) {
      await fileToHide.getByTitle('Hide file').click();
      await page.locator('.editor-confirm-dialog').getByRole('button', { name: 'Hide', exact: true }).click();
    }
    // Hidden files stay in the open material form so Restore is always easy
    // to find; verify the removed styling/action rather than expecting the
    // row to disappear.
    const fileHidden = multipleUploadsWorked
      && await materialForm.locator('.editor-file-row.removed').count() === 1
      && await materialForm.getByTitle('Restore file').count() === 1;
    await exactButton(page, 'Removed').click();
    const removedFileRow = materialForm.locator('.editor-file-row').first();
    const removedFileVisible = await removedFileRow.isVisible().catch(() => false);
    if (removedFileVisible) await removedFileRow.getByTitle('Restore file').click();
    await exactButton(page, 'Visible').click();
    const fileRestored = removedFileVisible && await materialForm.locator('.editor-file-row').count() === 2;

    // Publish real Content changes, reload the editor, and confirm the topic
    // and material survived the server round trip. This catches ID mapping,
    // staged upload and quick-topic regressions that a local Discard misses.
    await dismissConfirm(page);
    await exactButton(page, 'Publish').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('.editor-save-status');
      return status && !status.classList.contains('saving') && !/Publishing/i.test(status.textContent || '');
    }, { timeout: 30000 });
    await page.waitForTimeout(250);
    const contentPublishedStatus = await page.locator('.editor-save-status').innerText().catch(() => '');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await exactButton(page, 'Content').click().catch(() => {});
    const contentPublished = await page.getByText('Audit Topic', { exact: true }).count() > 0
      && await page.getByText('Audit material', { exact: true }).count() > 0;
    await exactButton(page, 'Materials').click().catch(() => {});
    const reloadedMaterialRow = page.locator('.editor-content-row').filter({ hasText: 'Audit material' }).first();
    if (await reloadedMaterialRow.count()) await reloadedMaterialRow.getByRole('button').first().click().catch(() => {});
    const contentFilesPublished = await page.locator('.editor-file-row').count() >= 2;

    const deviceResults = {};
    for (const mode of ['Desktop', 'Tablet', 'Mobile']) {
      await page.locator('.editor-device-switcher button').filter({ hasText: mode }).click();
      await page.waitForTimeout(80);
      deviceResults[mode.toLowerCase()] = await page.evaluate(() => ({
        mode: document.body.dataset.editorPreview,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        canvasWidth: document.querySelector('.editor-preview-canvas')?.getBoundingClientRect().width || 0,
      }));
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    if (!await page.locator('.editor-sidebar-tabs button').count()) {
      await exactButton(page, 'Toggle editor panel').click().catch(() => {});
      await page.waitForTimeout(100);
    }
    const mobileTabs = page.locator('.editor-sidebar-tabs button');
    let mobileTabsClickable = false;
    let mobileActiveTab = '';
    try {
      await mobileTabs.first().click();
      mobileActiveTab = (await page.locator('.editor-sidebar-tabs button.active').innerText()).trim();
      mobileTabsClickable = mobileActiveTab === 'Insert';
    } catch {
      mobileTabsClickable = false;
    }
    const mobilePrimaryActionsVisible = await Promise.all(['Discard', 'Publish', 'Close editor'].map(async (label) => (
      await exactButton(page, label).isVisible().catch(() => false)
    )));
    const mobileEditorOk = mobileTabsClickable && mobilePrimaryActionsVisible.every(Boolean);
    const mobileSurface = await page.evaluate(() => ({
      sidebar: document.querySelector('.editor-sidebar')?.getBoundingClientRect().toJSON() || null,
      sidebarDisplay: document.querySelector('.editor-sidebar') ? getComputedStyle(document.querySelector('.editor-sidebar')).display : '',
      sidebarZ: document.querySelector('.editor-sidebar') ? getComputedStyle(document.querySelector('.editor-sidebar')).zIndex : '',
      rootZ: document.querySelector('.editor-workspace-root') ? getComputedStyle(document.querySelector('.editor-workspace-root')).zIndex : '',
      tabs: document.querySelectorAll('.editor-sidebar-tabs button').length,
      point: document.elementFromPoint(50, 80)?.className || '',
    }));
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Create one fresh local-only edit after the Content Publish so Discard
    // is exercised against the current published snapshot (the earlier
    // layout/settings were intentionally included in that Publish).
    const discardProbe = page.locator('.k5-hero-title').first();
    const publishedHeroTitleBeforeDiscard = await discardProbe.innerText().catch(() => '');
    await discardProbe.click().catch(() => {});
    const discardProbeField = page.locator('#editor-setting-hero_title');
    const discardProbeStarted = await discardProbeField.isVisible().catch(() => false);
    if (discardProbeStarted) await discardProbeField.fill('Draft-only title');
    await page.waitForTimeout(120);

    await dismissConfirm(page);
    const discardButton = exactButton(page, 'Discard');
    if (await discardButton.isEnabled().catch(() => false)) {
      await discardButton.click();
      const workspaceDiscardConfirm = page.locator('.editor-workspace-confirm');
      if (await workspaceDiscardConfirm.isVisible().catch(() => false)) {
        await workspaceDiscardConfirm.getByRole('button', { name: 'Discard', exact: true }).click();
      }
      await page.waitForTimeout(350);
    }
    const discardedBlocks = await page.locator('.br-block').count();
    const discardedHeroButtons = await page.locator('.k5-hero-actions .k5-hero-btn').count();
    const discardedHeroImages = await page.locator('.k5-hero-visual img').count();
    const discardedHeroLead = await page.locator('.k5-hero-lead').innerText().catch(() => '');
    const discardedBenefitTitle = await page.locator('.k5-benefit-card .editable-setting').first().innerText().catch(() => '');
    const discardedHeroTitle = await page.locator('.k5-hero-title').first().innerText().catch(() => '');
    const discardedStatus = await page.locator('.editor-save-status').innerText();
    const contentStillPublished = await page.getByText('Audit Topic', { exact: true }).count() > 0;

    await exactButton(page, 'Insert').click();
    await page.locator('.editor-palette-card').filter({ hasText: 'Text' }).first().click();
    await page.waitForTimeout(100);
    await dismissConfirm(page);
    await exactButton(page, 'Publish').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('.editor-save-status');
      return status && !/Publishing/i.test(status.textContent || '');
    }, { timeout: 30000 });
    await page.waitForTimeout(120);
    const publishedStatus = await page.locator('.editor-save-status').innerText();
    const dirtyAfterPublish = await page.locator('.editor-save-status').evaluate((element) => element.classList.contains('dirty'));

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const result = {
      shellVisible,
      sidebarVisible,
      oldFloatingSurfaceCount,
      quickStartVisible,
      baselineBlocks,
      blocksAfterInsert,
      insertedThreeBlocks: blocksAfterInsert === baselineBlocks + 3,
      insertedTextVisible,
      textFieldVisible,
      textEdited,
      clearTextVisible,
      textCleared,
      removeImageVisible,
      addPointCount,
      addPointOpensInsert,
      inspectorVisible,
      selectedButtonByInspector: selectedButtonByInspector > 0,
      simplePlacementVisible,
      simpleAlignmentWorked,
      simpleWidthWorked,
      simpleSpacingWorked,
      duplicateWorked,
      moveWorked,
      hideBlockVisible,
      hiddenBlockVisible,
      blockRestored,
      sectionInspectorVisible,
      simpleSectionLayoutWorked,
      simpleSectionSpaceWorked,
      hideButtonVisible,
      heroButtonsBeforeHide,
      heroButtonsAfterHide,
      heroButtonHidden: hideButtonVisible && heroButtonsAfterHide === Math.max(0, heroButtonsBeforeHide - 1),
      removeTextVisible,
      heroLeadRemoved,
      benefitFieldVisible,
      benefitEdited,
      benefitRemoveVisible,
      benefitTitleRemoved,
      imageInspectorVisible,
      removeSettingImageVisible,
      heroImageRemoved,
      heroImagesBeforeRemove,
      heroImagesAfterRemove,
      libraryPageSelected,
      contentTabsVisible,
      contentRowsBefore,
      topicFormVisible,
      auditTopicVisible,
      auditTopicRemoved,
      auditTopicRestored,
      categoriesTabVisible,
      materialsTabVisible,
      multipleUploadsWorked,
      fileReorderWorked,
      fileHidden,
      fileRestored,
      contentPublishedStatus,
      contentPublished,
      contentFilesPublished,
      contentStillPublished,
      deviceResults,
      mobileEditorOk,
      mobileActiveTab,
      mobilePrimaryActionsVisible,
      mobileSurface,
      discardedBlocks,
      discardedHeroButtons,
      discardedHeroLead,
      discardedBenefitTitle,
      discardRestored: discardProbeStarted
        ? discardedHeroTitle === publishedHeroTitleBeforeDiscard
        : discardedBlocks === baselineBlocks && discardedHeroButtons === heroButtonsBeforeHide && discardedHeroImages === heroImagesBeforeRemove && discardedHeroLead === heroLeadBeforeRemove && discardedBenefitTitle === benefitTitleBeforeRemove,
      publishedStatus,
      dirtyAfterPublish,
      errors,
    };
    console.log(JSON.stringify(result, null, 2));

    const deviceOk = Object.values(deviceResults).every((item) => item.mode && !item.overflow);
    if (!shellVisible || !sidebarVisible || oldFloatingSurfaceCount !== 0 || !result.insertedThreeBlocks || !result.insertedTextVisible || !result.textFieldVisible || !result.textEdited || !result.clearTextVisible || !result.textCleared || !result.removeImageVisible || !result.addPointOpensInsert || !inspectorVisible || !selectedButtonByInspector || !simplePlacementVisible || !simpleAlignmentWorked || !simpleWidthWorked || !simpleSpacingWorked || !duplicateWorked || !moveWorked || !hideBlockVisible || !hiddenBlockVisible || !blockRestored || !sectionInspectorVisible || !simpleSectionLayoutWorked || !simpleSectionSpaceWorked || !result.heroButtonHidden || !result.removeTextVisible || !result.heroLeadRemoved || !result.benefitFieldVisible || !result.benefitEdited || !result.benefitRemoveVisible || !result.benefitTitleRemoved || !result.imageInspectorVisible || !result.heroImageRemoved || !result.removeSettingImageVisible || !result.discardRestored || !libraryPageSelected || !contentTabsVisible || !topicFormVisible || !auditTopicVisible || !auditTopicRemoved || !auditTopicRestored || !categoriesTabVisible || !materialsTabVisible || !multipleUploadsWorked || !fileReorderWorked || !fileHidden || !fileRestored || !result.contentPublished || !result.contentFilesPublished || !result.contentStillPublished || !deviceOk || !mobileEditorOk || dirtyAfterPublish || errors.length) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
