/**
 * ✅ Correct: Inline template via the `html` tagged literal.
 *
 * Static `{{ ... }}` placeholders resolve from the page scope + payload at
 * render time. Dynamic `${store => ...}` expressions are called with the
 * current request store and their string result substituted in.
 */
import markdoc, { Layout, html } from "@ecosy/markdoc";

export default markdoc({
  repo: "owner/docs",

  plugins: [
    Layout({
      template: { root: true },

      payload: {
        siteName: "Ecosy Docs",
        year: new Date().getFullYear(),
      },

      getTemplate: html`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{{ scope.title }} — {{ siteName }}</title>
            {{ head.metadata }}
            {{ head.links }}
            {{ head.style }}
          </head>
          <body>
            <header>
              <a href="/">{{ siteName }}</a>
              <nav>
                ${(store) => {
                  const pages = (store.getState().pages ?? []) as Array<[string, string]>;
                  return pages
                    .map(([title, url]) => `<a href="${url}">${title}</a>`)
                    .join("");
                }}
              </nav>
            </header>

            <main class="container">{{ body.main }}</main>

            <footer>&copy; {{ year }} — {{ siteName }}</footer>

            {{ body.scripts }}
          </body>
        </html>
      `,
    }),
  ],
});
