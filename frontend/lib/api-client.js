import * as Sentry from "@sentry/nextjs";
import { showToast } from "@/lib/toast";

/**
 * apiFetch — thin fetch wrapper that:
 *   1. Reports non-2xx responses to Sentry with request context
 *   2. Shows a Hebrew error toast for 5xx responses
 *   3. Reports unexpected network errors to Sentry
 *
 * Use for new non-axios fetch calls. Existing axios usage is covered
 * by the Sentry interceptor in lib/api.js.
 */
export async function apiFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = new Error(`API Error: ${response.status} ${url}`);

      Sentry.captureException(error, {
        extra: {
          url,
          status: response.status,
          method: options.method || "GET",
        },
      });

      if (response.status >= 500) {
        showToast("שגיאת שרת — נסי שוב בעוד רגע", "error");
      }

      throw error;
    }

    return response;
  } catch (err) {
    if (!err.message?.startsWith("API Error:")) {
      Sentry.captureException(err, { extra: { url } });
    }
    throw err;
  }
}
