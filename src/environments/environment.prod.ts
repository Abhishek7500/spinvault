export const environment = {
  production: true,
  apiUrl: 'https://fullstack-messaging-backend.onrender.com/api',
  wsUrl: 'https://fullstack-messaging-backend.onrender.com/ws',
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Render backend origin — the Vercel frontend must hit this absolute host to
  // stream /api/media/{id} assets (relative paths would 404 on the Vercel domain).
  mediaBaseUrl: 'https://fullstack-messaging-backend.onrender.com'
};
