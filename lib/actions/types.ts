export type ActionResult<T = null> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data, error: null };
}

export function fail(
  displayMessage: string,
  cause?: unknown
): ActionResult<never> {
  if (cause) {
    console.error(`[action] ${displayMessage}:`, cause);
  }
  return { success: false, data: null, error: displayMessage };
}
