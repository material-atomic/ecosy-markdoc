/**
 * HTTP redirect status codes.
 *
 * - `301` Permanent — SEO signal, browsers cache aggressively, method may change
 * - `302` Found (default) — temporary, method may change
 * - `303` See Other — always GET after redirect (POST → GET)
 * - `307` Temporary — preserve method + body
 * - `308` Permanent — preserve method + body (like 301 but method-safe)
 */
export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

/**
 * Build an HTTP redirect response. Browser follows the `Location` header
 * and navigates to the new URL.
 *
 * @param location Absolute URL (`https://...`) or relative path (`/login`).
 *                 Relative paths resolve against the request origin at the browser.
 * @param status HTTP status code. Default `302` (temporary redirect).
 *
 * @example Login redirect
 * ```ts
 * return redirect("/login");
 * ```
 *
 * @example Permanent with preserved method
 * ```ts
 * return redirect("/new-path", 308);
 * ```
 *
 * @example Absolute URL
 * ```ts
 * return redirect("https://other-domain.com/login");
 * ```
 */
export function redirect(location: string, status: RedirectStatus = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}
