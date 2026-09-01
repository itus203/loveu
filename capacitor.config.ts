import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.diunexus.app',
  appName: 'DIU Nexus',
  webDir: 'client',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*']
  }
};

export default config;
