export const config = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  // Full Drive scope: the app has to see files added outside the app, which drive.file can't.
  scope: 'https://www.googleapis.com/auth/drive',
  demo: import.meta.env.VITE_DEMO === '1',
};
