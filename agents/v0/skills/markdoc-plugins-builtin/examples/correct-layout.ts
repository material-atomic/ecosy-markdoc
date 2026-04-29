/**
 * ✅ Correct: Layout using the `html` tagged literal.
 *
 * `html` lets you mix static `{{ key }}` interpolation (payload / metadata)
 * with dynamic `${store => ...}` expressions (store-reactive values). The
 * returned function is called by the server with the request store at render
 * time.
 */
import markdoc, { Layout, html } from "@ecosy/markdoc";

export default markdoc({
  repo: "owner/docs",

  plugins: [
    Layout({
      template: { root: true },

      // Tagged literal — static `{{ ... }}` + dynamic `${...}`.
      getTemplate: html`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{{ scope.title }}</title>
            {{ head.metadata }}
            {{ head.links }}
            {{ head.style }}
          </head>
          <body>
            <header>
              <a href="/">${(store) => (store.getState().scope as { siteName: string }).siteName ?? "Docs"}</a>
              <nav>
                ${(store) => {
                  const pages = (store.getState().pages ?? []) as Array<[string, string]>;
                  return pages
                    .map(([title, url]) => `<a href="${url}">${title}</a>`)
                    .join("");
                }}
              </nav>
            </header>

            <main class="container">
              {{ body.main }}
            </main>

            <footer>
              &copy; ${() => new Date().getFullYear()} —
              ${(store) => (store.getState().scope as { siteName: string }).siteName ?? ""}
            </footer>

            {{ body.scripts }}
          </body>
        </html>
      `,

      // Static payload interpolated into `{{ key }}` placeholders.
      payload: {
        siteName: "Ecosy Docs",
      },
    }),
  ],
});
