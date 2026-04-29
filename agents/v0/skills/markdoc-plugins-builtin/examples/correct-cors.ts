/**
 * ✅ Correct: Cors for an allowlist with credentials.
 *
 * Browsers reject `credentials: true` when `origin: "*"` — use an explicit
 * allowlist or a predicate so the server can echo back the request's Origin.
 */
import markdoc, { Cors } from "@ecosy/markdoc";

export default markdoc({
  repo: "owner/docs",

  plugins: [
    Cors({
      // Static allowlist — only these hosts may send credentialed requests.
      origin: [
        "https://app.example.com",
        "https://admin.example.com",
      ],

      // Methods the resource accepts (preflight surface).
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],

      // Response headers the browser is allowed to read client-side.
      exposeHeaders: ["X-Total-Count", "X-Request-Id"],

      // Allow cookies / Authorization header / TLS certs.
      credentials: true,

      // Cache preflight for 1 hour.
      maxAge: 3600,
    }),
  ],
});

// ---
// Alternative: dynamic predicate — useful for pattern-based allowlists.
//
// Cors({
//   origin: (origin) => /\.trusted\.io$/.test(origin),
//   credentials: true,
// })
