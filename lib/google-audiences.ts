export function getGoogleAudiences(): string[] {
  return Array.from(
    new Set(
      [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_ID_PROD,
        // The mobile app signs in with the native Google SDK, which sends this
        // WEB client as `serverClientId` — so it is the `aud` of every id_token
        // the app produces, on every build. Distinct from GOOGLE_CLIENT_ID,
        // which is the browser app's own NextAuth client in another project.
        //
        // It being a web client is also why Play App Signing needs nothing
        // here: a new signing certificate means a new *Android* client must be
        // registered with Google, but the audience never changes.
        process.env.GOOGLE_MOBILE_CLIENT_ID,
        // Legacy: the expo-auth-session flow put the Android client id in the
        // `aud`. Kept so builds predating the native SDK still authenticate.
        process.env.GOOGLE_ANDROID_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID_PROD,
        process.env.GOOGLE_IOS_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID_PROD,
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}
