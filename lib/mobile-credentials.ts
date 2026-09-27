/**
 * Mobile App Credentials Configuration
 *
 * This file documents all credentials needed for the mobile app to function.
 * All values should be set in environment variables.
 *
 * DO NOT commit sensitive credentials to the repository!
 * Use environment variables or secure secrets management.
 */

export const getMobileAppCredentials = () => {
  return {
    // Pusher Real-time Communication
    pusher: {
      appKey: process.env.NEXT_PUBLIC_PUSHER_KEY,
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      description: "Get from https://dashboard.pusher.com/apps",
    },

    // LiveKit Video/Audio
    livekit: {
      serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL,
      description: "LiveKit server URL for video calls",
    },

    // API Configuration
    api: {
      baseUrl:
        process.env.NEXT_PUBLIC_API_URL || "https://questioncall.com/api",
      description: "Base URL for API calls from mobile app",
    },

    // Authentication
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
      iosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
      description: "Google OAuth 2.0 client IDs for web, Android, and iOS",
    },
  };
};

/**
 * Validate that all required credentials are configured
 */
export function validateMobileCredentials(): {
  isValid: boolean;
  missing: string[];
} {
  const creds = getMobileAppCredentials();
  const missing: string[] = [];

  if (!creds.pusher.appKey) missing.push("NEXT_PUBLIC_PUSHER_KEY");
  if (!creds.pusher.cluster) missing.push("NEXT_PUBLIC_PUSHER_CLUSTER");
  if (!creds.livekit.serverUrl) missing.push("NEXT_PUBLIC_LIVEKIT_URL");
  if (!creds.google.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!creds.google.androidClientId)
    missing.push("GOOGLE_ANDROID_CLIENT_ID");

  return {
    isValid: missing.length === 0,
    missing,
  };
}
