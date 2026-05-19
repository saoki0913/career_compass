import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-sanitize";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSendTransaction(event) {
      return scrubSentryEvent(event);
    },
    beforeSend(event) {
      return scrubSentryEvent({
        ...event,
        tags: {
          ...event.tags,
          service: "career-compass-frontend",
          runtime: "next-client",
        },
      });
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
