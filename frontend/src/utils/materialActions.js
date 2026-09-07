export const MATERIAL_ACTIONS = [
  {
    id: 'preview',
    key: 'material_action_preview',
    label: 'Preview (orange magnifier)',
    hint: 'Opens the cover or PDF preview. On the resource page, the cover image is also clickable.',
  },
  {
    id: 'worksheet',
    key: 'material_action_worksheet',
    label: 'Worksheet (W)',
    hint: 'Downloads the resource’s main PDF.',
  },
  {
    id: 'answers',
    key: 'material_action_answers',
    label: 'Answer Key (A)',
    hint: 'Downloads the answer file, if available.',
  },
  {
    id: 'classroom',
    key: 'material_action_classroom',
    legacyKey: 'classroom_enabled',
    label: 'Google Classroom',
    hint: 'Shares the resource on Google Classroom.',
  },
  {
    id: 'pinterest',
    key: 'material_action_pinterest',
    legacyKey: 'pinterest_enabled',
    label: 'Pinterest',
    hint: 'Saves the cover to Pinterest (shown only when the resource has a cover).',
  },
  {
    id: 'bookmark',
    key: 'material_action_bookmark',
    label: 'Favorite (bookmark)',
    hint: 'Save to a list or remove from favorites.',
  },
];

const LEGACY_BY_ID = Object.fromEntries(
  MATERIAL_ACTIONS.filter((a) => a.legacyKey).map((a) => [a.id, a.legacyKey])
);

export function isMaterialActionEnabled(settings = {}, actionId) {
  const def = MATERIAL_ACTIONS.find((a) => a.id === actionId);
  if (!def) return true;
  if (settings[def.key] !== undefined && settings[def.key] !== '') {
    return settings[def.key] !== 'false';
  }
  const legacy = def.legacyKey || LEGACY_BY_ID[actionId];
  if (legacy && settings[legacy] !== undefined) {
    return settings[legacy] !== 'false';
  }
  return true;
}

export function materialActionDefaults() {
  const defaults = {};
  for (const action of MATERIAL_ACTIONS) {
    defaults[action.key] = 'true';
  }
  return defaults;
}

export function materialActionFormFromSettings(settings = {}) {
  const form = {};
  for (const action of MATERIAL_ACTIONS) {
    form[action.key] = isMaterialActionEnabled(settings, action.id) ? 'true' : 'false';
  }
  return form;
}

export function materialActionPayload(form = {}) {
  const payload = {};
  for (const action of MATERIAL_ACTIONS) {
    payload[action.key] = form[action.key] !== 'false' ? 'true' : 'false';
    if (action.legacyKey) {
      payload[action.legacyKey] = payload[action.key];
    }
  }
  return payload;
}
