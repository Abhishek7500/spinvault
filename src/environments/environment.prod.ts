export const environment = {
  production: true,
  apiUrl: '', 
  wsUrl: '',
  supabaseUrl: 'https://urvgjhogffgctoyrwgis.supabase.co',
  supabaseAnonKey: 'sb_publishable_H99vFIckZF0Fo6w--jpjgA_ksNWd5Fj',
  // Render backend origin — the Vercel frontend must hit this absolute host to
  // stream /api/media/{id} assets (relative paths would 404 on the Vercel domain).
  mediaBaseUrl: 'https://fullstack-messaging-backend.onrender.com'
};
