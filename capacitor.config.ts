import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.luckybear.fluidstudio',
  appName: 'Lucky Bear Fluid Studio',
  webDir: 'dist-android',
  backgroundColor: '#141816',
  android: {
    allowMixedContent: false,
  },
};

export default config;
