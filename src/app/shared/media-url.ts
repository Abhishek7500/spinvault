import { environment } from '../../environments/environment';

/**
 * Resolve a stored asset reference into an absolute URL the browser can load.
 * <p>
 * The backend stores relative keys such as {@code /api/media/{id}}. When the
 * Angular app is deployed on a different origin (Vercel) than the API (Render),
 * a relative path resolves against the *frontend* host and 404s. This helper
 * prefixes the configured backend origin for relative paths while leaving
 * already-absolute URLs (and data/blob URLs) untouched.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }
  const base = environment.mediaBaseUrl?.replace(/\/+$/, '') ?? '';
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}
