import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-sanitize";

const dsn = process.env.SENTRY_NEXTJS_DSN ?? process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSendTransaction(event) {
      return scrubSentryEvent(event);
    },
    beforeSend(event) {
      return scrubSentryEvent({
        ...event,
        tags: {
          ...event.tags,
          service: "career-compass-frontend",
          runtime: "next-server",
        },
      });
    },
  });
}
