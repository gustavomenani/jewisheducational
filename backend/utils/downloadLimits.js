import * as db from '../db/index.js';
import { settingsToObject } from './helpers.js';
import { getResetMessage } from './paywall.js';
import { getUserAccess } from './access.js';

const SETTING_KEYS = [
  'download_limit_enabled',
  'download_limit_max',
  'download_limit_period',
  'download_limit_mode',
];

const PERIOD_LABELS = {
  day: 'per day',
  week: 'per week',
  month: 'per month',
  year: 'per year',
  forever: 'in total',
};

export async function getDownloadLimitSettings() {
  const rows = await db.settingsGetByKeys(SETTING_KEYS);
  const s = settingsToObject(rows);
  return {
    enabled: s.download_limit_enabled === 'true',
    max: Math.max(0, parseInt(s.download_limit_max, 10) || 0),
    period: s.download_limit_period || 'month',
    mode: s.download_limit_mode || 'per_resource',
  };
}

async function getResourceDownloadConfig(resourceId) {
  if (!resourceId) return null;
  const row = await db.resourceFindById(resourceId);
  if (!row || row.download_limit_max === null || row.download_limit_max === undefined) {
    return null;
  }
  return {
    max: Number(row.download_limit_max),
    period: row.download_limit_period || null,
  };
}

function buildQuota({ enabled, source, mode, period, max, used, premium = false }) {
  return {
    enabled,
    source,
    mode,
    period,
    periodLabel: PERIOD_LABELS[period] || period,
    resetMessage: getResetMessage(period),
    max,
    used,
    remaining: Math.max(0, max - used),
    allowed: premium || used < max,
    premium,
  };
}

export async function getDownloadQuota(user, resourceId = null) {
  const access = await getUserAccess(user);

  if (access.role === 'admin') {
    return { unlimited: true, role: 'admin', premium: true };
  }

  // Qualquer plano pago (padrão ou escola) baixa sem limite.
  if (access.premium) {
    return { unlimited: true, premium: true, source: 'subscription' };
  }

  const resourceOverride = await getResourceDownloadConfig(resourceId);

  if (resourceOverride?.max === 0) {
    return { unlimited: true, source: 'resource', enabled: false };
  }

  if (resourceOverride && resourceOverride.max > 0) {
    const globalConfig = await getDownloadLimitSettings();
    const period = resourceOverride.period || globalConfig.period;
    const used = await db.downloadCountByUser(user.id, {
      resourceId,
      period,
      mode: 'per_resource',
    });
    return buildQuota({
      enabled: true,
      source: 'resource',
      mode: 'per_resource',
      period,
      max: resourceOverride.max,
      used,
    });
  }

  const config = await getDownloadLimitSettings();
  if (!config.enabled || config.max <= 0) {
    return { unlimited: true, enabled: false, source: 'global' };
  }

  const used = await db.downloadCountByUser(user.id, {
    resourceId: config.mode === 'per_resource' ? resourceId : null,
    period: config.period,
    mode: config.mode,
  });

  return buildQuota({
    enabled: true,
    source: 'global',
    mode: config.mode,
    period: config.period,
    max: config.max,
    used,
  });
}

export async function assertCanDownload(user, resourceId) {
  const quota = await getDownloadQuota(user, resourceId);
  if (quota.unlimited || quota.allowed) {
    return { ok: true, quota };
  }

  const scope = quota.mode === 'global'
    ? 'downloads across the site'
    : 'downloads of this resource';

  return {
    ok: false,
    quota,
    code: 'DOWNLOAD_LIMIT',
    resetMessage: quota.resetMessage || getResetMessage(quota.period),
    message: `Limit reached: ${quota.max} ${scope} ${quota.periodLabel}. You have already used ${quota.used}.`,
  };
}
