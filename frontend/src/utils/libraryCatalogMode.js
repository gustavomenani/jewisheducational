/**
 * The Library landing page is a subject picker. A catalog is shown only after
 * visitors choose a subject, arrive through a direct search/filter link, or
 * an administrator explicitly turns the landing-page catalog back on.
 */
export function shouldShowLibraryCatalog({
  categorySlug = '',
  hasSearchFilters = false,
  gradeLanding = false,
  rootCatalogEnabled = false,
} = {}) {
  return Boolean(categorySlug || rootCatalogEnabled || (hasSearchFilters && !gradeLanding));
}
