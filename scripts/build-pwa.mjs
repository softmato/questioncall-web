/**
 * Builds the installable app (PWA) into public/app, where next.config.ts serves
 * it at /app: the QuestionCall phone app (softmato/questioncall-app) exported
 * for the browser. Run by the Vercel build (vercel.json) before `next build`.
 *
 * A checkout beside this one (../questioncall-app) is used when present;
 * otherwise the app repo is cloned into .pwa-src. `EXPO_PWA` switches on the
 * app's web-only config (`/app` base path, class-based dark mode) and is set
 * nowhere else, so no native build ever sees it. This project's own variables
 * fill any `EXPO_PUBLIC_*` the build host lacks: the Google web client is the
 * one the phone asks for its id token with, and Pusher is the same app.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const sibling = resolve(web, "../questioncall-app");
const app = existsSync(sibling) ? sibling : resolve(web, ".pwa-src");

const env = { ...process.env, EXPO_PWA: "1" };
env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||= process.env.GOOGLE_CLIENT_ID ?? "";
env.EXPO_PUBLIC_PUSHER_KEY ||= process.env.NEXT_PUBLIC_PUSHER_KEY ?? "";
env.EXPO_PUBLIC_PUSHER_CLUSTER ||= process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "";

function run(command, args, cwd) {
  const { status } = spawnSync(command, args, { cwd, env, shell: true, stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
}

// The app repo is private: GITHUB_TOKEN (a read-only token for it, set on the
// build host) lets the clone in. Without it the clone only works while public.
if (!existsSync(app)) {
  const auth = process.env.GITHUB_TOKEN ? `x-access-token:${process.env.GITHUB_TOKEN}@` : "";
  run("git", ["clone", "--depth", "1", `https://${auth}github.com/softmato/questioncall-app.git`, `"${app}"`], web);
}
// --include=dev: Vercel builds with NODE_ENV=production, which would skip the
// app's devDependencies — and its postinstall (patch-package) is one of them.
if (!existsSync(resolve(app, "node_modules"))) {
  run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], app);
}
run(
  resolve(app, "node_modules/.bin/expo"),
  ["export", "--platform", "web", "--clear", "--output-dir", `"${resolve(web, "public/app")}"`],
  app,
);
