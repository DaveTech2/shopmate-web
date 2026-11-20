import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getRemoteConfig, fetchAndActivate, getValue, type RemoteConfig } from "firebase/remote-config";
import { getAI, GoogleAIBackend, type AI } from "firebase/ai";

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** True when a real Firebase project is configured. Otherwise the app runs in labelled demo mode. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export let app: FirebaseApp | null = null;
export let appCheck: AppCheck | null = null;
export let auth: Auth | null = null;
export let db: Firestore | null = null;
export let ai: AI | null = null;
let rc: RemoteConfig | null = null;

const RC_DEFAULTS = {
  cloud_model: (env.VITE_CLOUD_MODEL as string) || "gemini-3.5-flash-lite",
  inference_mode: "PREFER_ON_DEVICE",
  fx_rates: "{}",
  default_country: "US",
  enable_bulk_planner: "true",
  max_results: "6",
};

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);

  // App Check is enforced for Firebase AI Logic. Debug provider for localhost only.
  const debug = env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined;
  if (debug && location.hostname === "localhost") {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debug === "true" ? true : debug;
  }
  const enterpriseKey = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as string | undefined;
  const v3Key = env.VITE_RECAPTCHA_V3_SITE_KEY as string | undefined;
  if (enterpriseKey || v3Key) {
    appCheck = initializeAppCheck(app, {
      provider: enterpriseKey ? new ReCaptchaEnterpriseProvider(enterpriseKey) : new ReCaptchaV3Provider(v3Key!),
      isTokenAutoRefreshEnabled: true,
    });
  }

  auth = getAuth(app);
  db = getFirestore(app);
  ai = getAI(app, { backend: new GoogleAIBackend() });
  rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
  rc.defaultConfig = RC_DEFAULTS;
}

let rcReady: Promise<void> | null = null;
export function loadRemoteConfig(): Promise<void> {
  if (!rc) return Promise.resolve();
  if (!rcReady) rcReady = fetchAndActivate(rc).then(() => undefined).catch(() => undefined);
  return rcReady;
}

export function flag(key: keyof typeof RC_DEFAULTS): string {
  if (!rc) return RC_DEFAULTS[key];
  try {
    return getValue(rc, key).asString() || RC_DEFAULTS[key];
  } catch {
    return RC_DEFAULTS[key];
  }
}
