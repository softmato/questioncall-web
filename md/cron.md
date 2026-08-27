# Cron Setup Guide

This project uses the `CRON_SECRET` environment variable to authorize cron requests.
No real cron secret should be hardcoded in route files, docs, or committed config.

Cron endpoints accept the secret in a **header only**:

- Header: `x-cron-secret: YOUR_CRON_SECRET`
- Header: `Authorization: Bearer YOUR_CRON_SECRET`

> **The `?key=YOUR_CRON_SECRET` query param is no longer accepted.** A secret in
> a URL is written to Vercel access logs, proxy/CDN logs, browser history, and
> the `Referer` header of any outbound navigation. If you have existing
> cron-job.org jobs using `?key=`, move them to the header form — they will
> return `401` until you do — and rotate `CRON_SECRET` afterwards, since the old
> value has been travelling in URLs.

## Required Environment Variable

Set this in the environment for the app you are calling:

```env
CRON_SECRET=replace-with-a-long-random-secret
```

Keep the real secret out of committed docs and source control.

## Cron Endpoints

### 1. Expire Channels

`POST /api/cron/expire-channels`

What it does:

- Expires channels whose timer is over and no answer was submitted.
- Deducts the configured teacher penalty.
- Resets the question back to the feed when allowed.
- Auto-closes answered but unrated channels after the grace window.
- Applies the automatic `3/5` fallback rating on those auto-closed channels.

Recommended schedule:

- Every 5 minutes

Example request:

```text
POST https://your-domain.com/api/cron/expire-channels
x-cron-secret: YOUR_CRON_SECRET
```

### 2. Monthly Rewards

`POST /api/cron/monthly-rewards`

What it does:

- Awards the configured monthly bonus to eligible high-rated teachers.

Recommended schedule:

- Once per month on day 1 at 00:00

Example request:

```text
POST https://your-domain.com/api/cron/monthly-rewards
x-cron-secret: YOUR_CRON_SECRET
```

### 3. Flush Reaction Notifications

`POST /api/cron/flush-reaction-notifications`

What it does:

- Sends the deferred "someone reacted to your question" push for every reactor
  who has stopped reacting for the quiet window (2 minutes — see
  `REACTION_NOTIFY_QUIET_MS` in `lib/reaction-notifications.ts`).
- Drops pending entries whose reaction has since been withdrawn, so a reaction
  the user taps and immediately untaps never notifies anyone.

Why it exists: reactions are a toggle, so sending on the tap meant one push per
tap. Pushes are queued instead and collapsed into one per reactor per question.

Recommended schedule:

- Every minute (nothing breaks at a longer interval — notifications just arrive
  later)

Example request:

```text
POST https://your-domain.com/api/cron/flush-reaction-notifications
x-cron-secret: YOUR_CRON_SECRET
```

Note: `POST /api/questions/[id]/react` also flushes due notifications after
responding, so on a site with any reaction traffic this cron is a safety net
rather than the primary path — it covers reactions that land just before things
go quiet.

## cron-job.org Settings

Use these settings for each job:

- Method: `POST`
- URL: the plain cron endpoint URL, with **no** query parameters
- Headers: add `x-cron-secret` with the value of `CRON_SECRET`
  (cron-job.org: job → *Advanced* → *Headers*)
- No username/password needed
- No request body needed

## Why You Might See `Unauthorized`

If cron-job.org returns `Unauthorized`, check these first:

1. The deployed app has `CRON_SECRET` set in its environment.
2. The secret in cron-job.org exactly matches the deployed `CRON_SECRET`.
3. You are calling the correct deployed domain.
4. You are using `POST`, not `GET`.
5. You updated old saved jobs that still use an outdated hardcoded secret.
6. The job sends the secret as the `x-cron-secret` **header**. Jobs still using
   the retired `?key=` query param return `401`.

## Fallback Behavior

Cron is still the primary mechanism for cleanup.

As a safety net, participant-facing channel APIs now also re-check overdue channels when a user opens the channel, sends a message, starts a call, or submits an answer. That means:

- unanswered expired channels are forced into the expire/reset path
- answered but unrated channels are auto-closed and auto-rated once the grace period has passed

This fallback is there to prevent channels from staying incorrectly active if a cron run is delayed or missed.


#### Next Steps After Deployment
Once these changes are pushed and live on production, you should submit your site to search engines to kickstart the indexing process:

1. Google Search Console (GSC)

Go to Google Search Console.
Add your property using the Domain method (you'll need to add a DNS TXT record to verify ownership of questioncall.com).
Once verified, go to Sitemaps in the left menu.
Submit your new sitemap URL: https://questioncall.com/sitemap.xml.
(Optional) Enter https://questioncall.com/ into the URL Inspection tool at the top and click "Request Indexing" to speed things up.
2. Bing Webmaster Tools

Go to Bing Webmaster Tools.
You can easily import your verified site directly from Google Search Console (saves you from verifying DNS again).
Go to Sitemaps and submit https://questioncall.com/sitemap.xml if it didn't import automatically.