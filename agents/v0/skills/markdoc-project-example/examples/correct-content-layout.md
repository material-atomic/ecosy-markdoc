# ✅ Correct: Content repo layout

The **content repository** on GitHub holds only content — no TypeScript, no
build steps. The runtime fetches everything lazily from jsDelivr.

```
ecosy-docs/                        ← GitHub repo (public or private)
├── content/                       ← <dir> passed to markdoc({ dir })
│   ├── _manifest.json             ← Root manifest — required
│   ├── _template.html             ← Optional — Layout({ path: ... })
│   │
│   ├── _components/               ← Component templates (engine auto-loads)
│   │   ├── card.html
│   │   ├── callout.html
│   │   └── note.html
│   │
│   ├── index.md                   ← Home page ("/" in manifest)
│   ├── about.md
│   │
│   ├── guides/
│   │   ├── _manifest.json         ← Sub-manifest for the /guides/* scope
│   │   ├── intro.md
│   │   ├── plugins.md
│   │   └── deployment.md
│   │
│   └── api/
│       ├── _manifest.json
│       ├── plugins.md
│       └── imports.md
│
├── .github/
│   └── workflows/
│       └── purge-cdn.yml          ← Optional — notify jsDelivr on push
│
└── README.md                      ← For human readers on github.com
```

## `_manifest.json` contract

```json
{
  "pages": {
    "/<url>": { "file": "<relative-md>", "meta": { "title": "…" } }
  },
  "submanifests": {
    "/<prefix>": "<dir>/_manifest.json"
  }
}
```

- Keys are URL paths (leading `/`, no `.md`, no trailing `/`).
- Values point at the actual `.md` file (relative to the current manifest's directory).
- `meta` is optional — use it to pre-seed scope for listings, sitemaps, feeds.

## `_components/*.html`

- Filename (without extension) becomes the component name.
- Markdown uses them via `{% card title="…" %}body{% /card %}`.
- Placeholder syntax: `{{ attr }}`, `{{ body }}`, `{{ scope.* }}`.

## What does NOT belong here

- `package.json`, `tsconfig.json`, `node_modules/` — those live in the
  deployment repository that hosts `src/app.ts`, `src/worker.ts`,
  `src/server.ts`.
- Build artefacts — jsDelivr serves raw files. No compile step.
- Secrets — the CDN is public for public repos. Never check in tokens,
  API keys, or environment files.
