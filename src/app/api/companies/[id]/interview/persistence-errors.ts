/**
 * Re-export shim: implementation moved to @/lib/interview/persistence-errors.
 * Kept for backward-compatible imports from route-level consumers
 * (route.ts, stream-utils.ts, etc.).
 */
export {
  INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE,
  InterviewPersistenceUnavailableError,
  normalizeInterviewPersistenceError,
  isInterviewPersistenceUnavailableError,
  createInterviewPersistenceUnavailableResponse,
} from "@/lib/interview/persistence-errors";
