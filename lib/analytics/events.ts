export const EVENTS = {
  // Auth & Onboarding
  USER_SIGNED_IN: "user_signed_in",
  ONBOARDING_COMPLETED: "onboarding_completed",
  ONBOARDING_SKIPPED: "onboarding_skipped",

  // Repository Management
  REPO_CONNECTED: "repo_connected",
  REPO_DISCONNECTED: "repo_disconnected",
  REPO_INDEXING_COMPLETED: "repo_indexing_completed",
  REPO_INDEXING_FAILED: "repo_indexing_failed",

  // API Key Management
  API_KEY_ADDED: "api_key_added",
  API_KEY_DELETED: "api_key_deleted",
  API_KEY_ACTIVATED: "api_key_activated",
  API_KEY_DEACTIVATED: "api_key_deactivated",
  API_KEY_MODEL_CHANGED: "api_key_model_changed",

  // Code Reviews
  REVIEW_REQUESTED: "review_requested",
  REVIEW_COMPLETED: "review_completed",
  REVIEW_FAILED: "review_failed",
  REVIEW_CANCELLED: "review_cancelled",
  REVIEW_ADOPTION_DETECTED: "review_adoption_detected",
  REVIEW_ADOPTION_SUMMARY: "review_adoption_summary",

  // Repository Memory
  MEMORY_RULE_ADDED: "memory_rule_added",
  MEMORY_RULE_DELETED: "memory_rule_deleted",
  MEMORY_RULE_TOGGLED: "memory_rule_toggled",

  // Navigation
  PAGE_VIEWED: "page_viewed",
} as const;
