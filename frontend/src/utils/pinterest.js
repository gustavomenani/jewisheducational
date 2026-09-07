import { mediaUrl } from './media';
import { isMaterialActionEnabled } from './materialActions';

export function isPinterestEnabled(settings = {}) {
  return isMaterialActionEnabled(settings, 'pinterest');
}

export function absoluteMediaUrl(path) {
  const url = mediaUrl(path);
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

export function pinterestPinUrl(slug, title, coverImage, settings = {}) {
  if (!isPinterestEnabled(settings) || !coverImage) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pageUrl = `${origin}/resource/${slug}`;
  const imageUrl = absoluteMediaUrl(coverImage);
  const params = new URLSearchParams({
    url: pageUrl,
    media: imageUrl,
    description: title || '',
  });
  return `https://www.pinterest.com/pin/create/button/?${params.toString()}`;
}
