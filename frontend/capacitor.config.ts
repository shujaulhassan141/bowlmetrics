import type { CapacitorConfig } from "@capacitor/cli";

/**
 * BowlMetrics Android shell.
 *
 * The web app is bundled into the APK (`webDir: "dist"`) and the MediaPipe
 * runtime/model live in `public/mediapipe` and `public/models`, so analysis runs
 * fully offline on the phone.
 *
 * Android runtime permissions are declared in
 * `android/app/src/main/AndroidManifest.xml` after `npx cap add android`:
 *   - CAMERA                        (record a delivery)
 *   - READ_MEDIA_VIDEO / IMAGES     (Android 13+ gallery selection)
 *   - READ_EXTERNAL_STORAGE         (Android 12 and below)
 *   - INTERNET                      (optional remote FastAPI server)
 */
const config: CapacitorConfig = {
  appId: "com.bowlmetrics.app",
  appName: "BowlMetrics",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Camera: {
      // Native video recording and gallery selection are handled by the
      // @capacitor/camera plugin; the manifest entries above grant access.
    },
  },
};

export default config;
