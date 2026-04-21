---
title: Organizing Content
description: How to structure URLs and manifests in Ecosy Markdoc
order: 2
---

# Organizing Content

Ecosy Markdoc uses `_manifest.md` files to define your documentation structure. Instead of scanning the filesystem or requiring a config file, the framework reads manifest files that explicitly declare which pages exist and how they are organized.

## The root manifest

Every Markdoc site starts with a `_manifest.md` at the root of your content directory:

```
content/
  _manifest.md
  getting-started.md
  api-reference.md
```

The root manifest declares top-level pages and sections:

```markdown
---
title: My Documentation
description: Documentation for my project
children:
  - getting-started
  - api-reference
  - guides/_manifest
---
```

The `children` list is the heart of the manifest. Each entry is either a **page slug** or a **path to a nested manifest**.

## Children types

The framework classifies each child entry into one of two types:

**Page slugs** — entries that match the pattern `[a-zA-Z0-9-/]` and do not end with `_manifest` or `_manifest.md`. These register as valid URLs in the sitemap. The framework does not fetch page content at manifest time; it only records that the path exists. Content is fetched lazily when the URL is actually requested.

```yaml
children:
  - getting-started          # → /getting-started
  - api-reference            # → /api-reference
  - changelog                # → /changelog
```

**Nested manifests** — entries that end with `_manifest` or `_manifest.md`. These trigger recursive resolution: the framework fetches and parses the child manifest, discovers its pages and further nested manifests, and continues until no more manifests remain.

```yaml
children:
  - guides/_manifest         # → resolves guides/_manifest.md
  - api/_manifest            # → resolves api/_manifest.md
```

## Nested structure

Manifests can nest to any depth. Each manifest owns its directory prefix:

```
content/
  _manifest.md                  ← root
  getting-started.md
  guides/
    _manifest.md                ← section
    writing-markdown.md
    organizing-content.md
    advanced/
      _manifest.md              ← subsection
      custom-providers.md
      cache-strategies.md
```

Root `_manifest.md`:

```yaml
children:
  - getting-started
  - guides/_manifest
```

`guides/_manifest.md`:

```yaml
children:
  - writing-markdown
  - organizing-content
  - advanced/_manifest
```

`guides/advanced/_manifest.md`:

```yaml
children:
  - custom-providers
  - cache-strategies
```

This produces the following sitemap:

```
/getting-started
/guides/writing-markdown
/guides/organizing-content
/guides/advanced/custom-providers
/guides/advanced/cache-strategies
```

## Path resolution

Child paths are resolved relative to the manifest's directory:

- In root `_manifest.md`: `getting-started` resolves to `getting-started.md`
- In `guides/_manifest.md`: `writing-markdown` resolves to `guides/writing-markdown.md`
- Absolute paths (starting with `/`) are resolved from the content root: `/changelog` always resolves to `changelog.md` regardless of which manifest declares it

The `.md` extension is optional in the children list. The framework normalizes all paths to end with `.md` internally.

## URL mapping

Each page path maps to a public URL by stripping the `.md` extension and adding a leading slash:

```
getting-started.md          → /getting-started
guides/writing-markdown.md  → /guides/writing-markdown
```

When a request comes in, the server strips the leading slash and appends `.md` to match against the sitemap. Requests to `/guides/writing-markdown` and `/guides/writing-markdown.md` both resolve to the same page.

## Manifest metadata

Manifests can carry their own metadata in frontmatter, beyond just `children`:

```yaml
---
title: API Reference
description: Complete API documentation
icon: book
order: 3
children:
  - authentication
  - endpoints
  - errors
---
```

This metadata is available in the manifest tree (via the `ManifestResult` type) and can be used by your frontend to build navigation, section headers, or sidebar trees.

## Circular protection

If manifest A references manifest B and manifest B references manifest A, the framework detects the cycle and stops recursion. The second encounter returns the already-parsed manifest without re-fetching or re-resolving its children. This prevents infinite loops in misconfigured content trees.

## What manifests do NOT do

Manifests only build the sitemap — the list of valid URLs. They do not:

- Fetch or read page content (that happens lazily in the server when a URL is requested)
- Enforce page ordering (use `order` in page frontmatter for that)
- Validate that referenced pages actually exist on the CDN (a missing page returns a 500 at request time, not at manifest time)
- Support wildcard or glob patterns (every page must be explicitly listed)

This separation keeps manifest resolution fast and predictable: it is a synchronous tree traversal over a small number of lightweight files.
