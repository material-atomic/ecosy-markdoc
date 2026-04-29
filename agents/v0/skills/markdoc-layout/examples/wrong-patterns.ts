/**
 * ❌ Wrong: Common layout mistakes.
 */
import markdoc, { Layout, html } from "@ecosy/markdoc";

// --- Mistake 1: Two plugins claim the root layout ---

markdoc({
  repo: "owner/docs",
  plugins: [
    Layout({ template: { root: true } }),
    Layout({ template: { root: true } }), // ❌ dead code — first registration wins
  ],
});

// --- Mistake 2: Forgetting `{{ body.main }}` ---

markdoc({
  repo: "owner/docs",
  plugins: [
    Layout({
      template: { root: true },
      // ❌ Wrong — no slot for rendered page content. Every page renders an
      //    empty shell. `{{ body.main }}` is the required slot.
      getTemplate: `<!DOCTYPE html><html><body><h1>{{ scope.title }}</h1></body></html>`,
    }),
  ],
});

// --- Mistake 3: Using `${...}` in a plain string template ---

markdoc({
  repo: "owner/docs",
  plugins: [
    Layout({
      template: { root: true },
      // ❌ Wrong — `${...}` is a JS template literal, evaluated *once* at
      //    module load. The resulting string has no dynamic content. Use
      //    the `html` tagged literal for store-reactive expressions.
      getTemplate: `
        <html><body>
          <h1>${Math.random()}</h1>  <!-- same value on every request -->
          {{ body.main }}
        </body></html>
      `,
    }),
  ],
});

// --- Mistake 4: Calling `store.getState()` in a non-reactive slot ---

markdoc({
  repo: "owner/docs",
  plugins: [
    Layout({
      template: { root: true },
      getTemplate: html`
        <html>
          <body>
            <!-- Wrong — "{{ getState().title }}" is NOT a supported
                 placeholder. Interpolator only resolves dot-paths against
                 the scope + payload. Use a dynamic expression of the form
                 \${store => store.getState().title} or surface the value
                 into scope via a plugin. -->
            <h1>{{ getState().title }}</h1>
            {{ body.main }}
          </body>
        </html>
      `,
    }),
  ],
});

// --- Mistake 5: Injecting user input into the template ---

declare const userInput: string;

markdoc({
  repo: "owner/docs",
  plugins: [
    Layout({
      template: { root: true },
      // ❌ Wrong — templates are trusted content. Splicing user input in
      //    lets attackers inject `</style><script>...` into every page.
      //    Route untrusted values through scope + escape them in the
      //    component that renders them.
      getTemplate: `<html><body><div>${userInput}</div>{{ body.main }}</body></html>`,
    }),
  ],
});
