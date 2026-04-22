---
title: Images
description: How images are resolved from your GitHub repository
order: 6
---

# Images

Ecosy Markdoc serves content from a GitHub repository via CDN. Images stored alongside your markdown files are automatically resolved — no separate hosting or asset pipeline needed.

## How it works

When the server renders a page, it scans the parsed HTML for `<img>` tags with relative `src` paths and rewrites them to absolute CDN URLs pointing to the same repository.

A page at `docs/content/guides/writing-markdown.md` with this markdown:

```markdown
![Diagram](./images/diagram.png)
```

Renders as:

```html
<img src="https://cdn.jsdelivr.net/gh/owner/repo@main/docs/content/guides/images/diagram.png" alt="Diagram">
```

The server computes the CDN base directory from the page's own content URL, then resolves relative paths against it using standard URL resolution — `./`, `../`, and bare filenames all work correctly.

## Directory structure

Keep images next to or near the markdown files that reference them:

```
docs/content/
  guides/
    writing-markdown.md
    images/
      diagram.png
      screenshot.png
  assets/
    logo.png
```

Then reference them with relative paths:

```markdown
<!-- From guides/writing-markdown.md -->
![Diagram](./images/diagram.png)
![Logo](../assets/logo.png)
```

Both paths are resolved relative to the page's directory on the CDN.

## Supported path formats

The resolver handles these path formats:

```markdown
![A](./images/photo.png)       <!-- relative to current directory -->
![B](images/photo.png)         <!-- same as above, ./ is optional -->
![C](../shared/banner.jpg)     <!-- parent directory traversal -->
![D](../../assets/icon.svg)    <!-- multiple levels up -->
```

These are left unchanged (already absolute):

```markdown
![E](https://example.com/photo.png)   <!-- absolute URL -->
![F](//cdn.example.com/img.png)       <!-- protocol-relative -->
![G](data:image/png;base64,...)       <!-- data URI -->
```

## Images in metadata

Open Graph and Twitter Card images declared in frontmatter `metadata` are also resolved:

```yaml
---
title: Writing Markdown
metadata:
  og:image: ./images/og-cover.png
  twitter:image: ./images/twitter-card.png
---
```

The server rewrites these relative paths to absolute CDN URLs in the generated `<meta>` tags:

```html
<meta property="og:image" content="https://cdn.jsdelivr.net/gh/owner/repo@main/docs/content/guides/images/og-cover.png">
```

This ensures social media crawlers can access the image without any extra configuration.

## Image syntax

The built-in markdown parser supports the standard image syntax with optional title:

```markdown
![Alt text](./photo.png)
![Alt text](./photo.png "Image title")
```

The `alt` attribute is always preserved. The `title` attribute is added when the quoted string is provided after the URL.

## Cache behavior

Images served through the CDN (jsDelivr by default) are cached at the CDN edge. When you update an image in your repository, the CDN cache respects the `revalidate` setting in your markdoc config — the same freshness control that applies to markdown content applies to image URLs.

If you need immediate updates, push to a new branch or use a versioned path.
