import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alastor.vibe',
  appName: 'Vibe',
  webDir: 'dist',

  server: {
    url: 'https://vibe-omega-virid.vercel.app',
    cleartext: false,
  },

  android: {
    backgroundColor: '#0b0a14',
  },
};

export default config;