/**
 * ❌ Wrong: Common built-in plugin mistakes.
 */
import markdoc, {
  Authen,
  Cors,
  Layout,
  Markdash,
  RSSFeed,
  Sitemap,
} from "@ecosy/markdoc";

declare const verify: (jwt: string) => Promise<boolean>;

// --- Mistake 1: Authen without `publicPaths` for the login endpoint ---

markdoc({
  repo: "owner/docs",
  plugins: [
    Authen({
      verify,
      onUnauthorized: "/login",
      // ❌ Wrong — /login itself is blocked, producing a redirect loop.
      //    Always include the unauthorized destination in publicPaths.
      // publicPaths: ["/login"],
    }),
  ],
});

// --- Mistake 2: Cors with credentials + wildcard origin ---

try {
  Cors({
    origin: "*",
    credentials: true, // ❌ Throws at factory time — browsers reject this combo.
  });
} catch (err) {
  void err;
}

// --- Mistake 3: Two Layout plugins claim the root template ---

markdoc({
  repo: "owner/docs",
  plugins: [
    Layout({ template: { root: true } }),
    Layout({ template: { root: true } }), // ❌ Second one is dead code.
  ],
});

// --- Mistake 4: Markdash in production without auth ---

markdoc({
  repo: "owner/docs",
  plugins: [
    // ❌ Wrong — Markdash's POST endpoints will be reachable by anyone on
    //    the internet. Always gate behind Authen (or network-level ACLs).
    Markdash({ prefix: "_ops/dash" }),
  ],
});

// --- Mistake 5: RSSFeed without required channel metadata ---

RSSFeed({
  // @ts-expect-error — `title`, `description`, `link` are required.
  items: [],
});

// --- Mistake 6: Sitemap invoked as a factory ---

markdoc({
  repo: "owner/docs",
  plugins: [
    // ❌ Wrong — Sitemap is a class, not a factory. Drop it in directly.
    // @ts-expect-error
    Sitemap(),
  ],
});

// --- Mistake 7: `Authen.verify` that returns truthy on bad input ---

Authen({
  // ❌ Wrong — returning truthy when the JWT is missing or invalid opens
  //    the door for every anonymous request.
  verify: async () => true,
  onUnauthorized: "/login",
});
