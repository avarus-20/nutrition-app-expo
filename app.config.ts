import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';

const variant: Variant = (() => {
  const raw = process.env.APP_VARIANT;
  return raw === 'development' || raw === 'preview' ? raw : 'production';
})();

const VARIANTS: Record<Variant, { name: string; bundleId: string }> = {
  development: { name: 'Nutrition (Dev)', bundleId: 'com.avarus.nutrition.dev' },
  preview: { name: 'Nutrition (Preview)', bundleId: 'com.avarus.nutrition.preview' },
  production: { name: 'Nutrition Tracker', bundleId: 'com.avarus.nutrition' },
};

// Cross-origin isolation is required by expo-sqlite on web (SharedArrayBuffer).
const WEB_SECURITY_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: VARIANTS[variant].name,
  slug: 'nutrition-app-expo',
  version: '2.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  scheme: 'nutritiontracker',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: VARIANTS[variant].bundleId,
    infoPlist: {
      NSCameraUsageDescription: 'Allow camera access to attach photos of your meals.',
      NSPhotoLibraryUsageDescription: 'Allow photo library access to attach photos of your meals.',
      NSMicrophoneUsageDescription: 'Allow microphone access to record voice notes for your meals.',
    },
  },
  android: {
    package: VARIANTS[variant].bundleId,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#2E7D32',
    },
    permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
    name: VARIANTS[variant].name,
    shortName: 'Nutrition',
    description: 'Offline-first nutrition and calorie tracker.',
    themeColor: '#2E7D32',
    backgroundColor: '#FFFFFF',
    lang: 'en',
  },
  plugins: [
    ['expo-router', { headers: WEB_SECURITY_HEADERS }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF',
        dark: { image: './assets/splash.png', backgroundColor: '#101412' },
      },
    ],
    'expo-sqlite',
    'expo-localization',
    [
      'expo-audio',
      { microphonePermission: 'Allow microphone access to record voice notes for your meals.' },
    ],
    'expo-sharing',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow photo library access to attach photos of your meals.',
        cameraPermission: 'Allow camera access to attach photos of your meals.',
      },
    ],
    'expo-document-picker',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: variant,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
