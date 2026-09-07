export const CATALOG_BATCH_SIZE = 24;

export function mergeUniqueResources(current = [], incoming = []) {
  const seen = new Set();
  return [...current, ...incoming].filter((item) => {
    const key = String(item?.id ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasMoreResources(resources = [], total = 0) {
  return resources.length < Math.max(0, Number(total) || 0);
}
