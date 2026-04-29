<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ scope.title }} — Ecosy Markdoc</title>
<meta name="description" content="{{ scope.description }}">
{{ head.metadata }}
{{ head.links }}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📄</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<!-- highlight.js theme for syntax-highlighted code blocks (light theme). -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css">
<!-- KaTeX CSS — required to display server-rendered math. -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css" crossorigin="anonymous">
{{ head.scripts }}
<style>
  :root {
    --color-bg: #ffffff;
    --color-bg-subtle: #f8fafc;
    --color-bg-muted: #f1f5f9;
    --color-border: #e2e8f0;
    --color-border-muted: #f1f5f9;
    --color-text: #1e293b;
    --color-text-secondary: #64748b;
    --color-text-muted: #94a3b8;
    --color-primary: #2563eb;
    --color-primary-hover: #1d4ed8;
    --color-primary-bg: #eff6ff;
    --color-code-bg: #0f172a;
    --color-code-text: #e2e8f0;
    --color-inline-code-bg: #f1f5f9;
    --color-inline-code: #0f172a;
    --color-accent-green: #10b981;
    --color-accent-amber: #f59e0b;
    --color-accent-red: #ef4444;
    --sidebar-width: 260px;
    --nav-height: 56px;
    --content-max-width: 740px;
    --layout-max-width: 1200px;
    --layout-gap: 2.5rem;
    --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: "JetBrains Mono", "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }

  body {
    font-family: var(--font-sans);
    font-size: 15px;
    line-height: 1.7;
    color: var(--color-text);
    background: var(--color-bg);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* ── Nav ─────────────────────────────────── */

  .doc-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--nav-height);
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    z-index: 100;
  }

  .doc-nav-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--color-text);
    text-decoration: none;
    letter-spacing: -0.01em;
  }

  .doc-nav-brand:hover { color: var(--color-primary); text-decoration: none; }

  .doc-nav-brand svg { flex-shrink: 0; }

  .doc-nav-links {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }

  .doc-nav-links a {
    font-size: 0.825rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color 0.15s;
  }

  .doc-nav-links a:hover { color: var(--color-text); }

  .doc-nav-hamburger {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--color-text);
    margin-left: auto;
  }

  /* ── Layout ──────────────────────────────── */

  /* Centered flex container — sidebar and content share a max-width block
     that sits in the middle of the viewport on large screens. Only the
     nav stays fixed to the top of the window. */
  .doc-layout {
    display: flex;
    gap: var(--layout-gap);
    max-width: var(--layout-max-width);
    margin: 0 auto;
    padding: var(--nav-height) 1.5rem 0;
    min-height: 100vh;
  }

  /* ── Sidebar ─────────────────────────────── */

  .doc-sidebar {
    width: var(--sidebar-width);
    flex-shrink: 0;
    background: var(--color-bg);
    border-right: 1px solid var(--color-border);
    padding: 2rem 0;
    align-self: flex-start;
    position: sticky;
    top: var(--nav-height);
    max-height: calc(100vh - var(--nav-height));
    overflow-y: auto;
  }

  .doc-sidebar::-webkit-scrollbar { width: 4px; }
  .doc-sidebar::-webkit-scrollbar-track { background: transparent; }
  .doc-sidebar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }

  .doc-sidebar-section { margin-bottom: 1.5rem; }

  .doc-sidebar-label {
    padding: 0 1.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    margin-bottom: 0.4rem;
  }

  .doc-sidebar-nav { list-style: none; }

  .doc-sidebar-nav a {
    display: block;
    padding: 0.35rem 1.25rem;
    font-size: 0.825rem;
    font-weight: 450;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color 0.15s, background 0.15s;
    border-left: 2px solid transparent;
  }

  .doc-sidebar-nav a:hover {
    color: var(--color-text);
    background: var(--color-bg-subtle);
  }

  .doc-sidebar-nav a.active {
    color: var(--color-primary);
    background: var(--color-primary-bg);
    border-left-color: var(--color-primary);
    font-weight: 550;
  }

  /* ── Main content ────────────────────────── */

  .doc-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0; /* prevent flex children from overflowing */
    min-height: calc(100vh - var(--nav-height));
  }

  .doc-content {
    flex: 1;
    max-width: var(--content-max-width);
    padding: 2rem 0 4rem;
    width: 100%;
  }

  /* ── Page header ─────────────────────────── */

  .doc-page-header {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .doc-page-header h1 {
    font-size: 1.85rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.2;
    color: var(--color-text);
    margin: 0 0 0.5rem;
  }

  .doc-page-header p {
    font-size: 1rem;
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  /* ── Prose (rendered markdown) ───────────── */

  .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-text);
    letter-spacing: -0.01em;
  }

  /* Hide first h1 in prose — page-header already renders it */
  .prose > h1:first-child { display: none; }

  .prose h1 {
    font-size: 1.85rem;
    margin-top: 0;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 1.25rem;
  }

  .prose h2 {
    font-size: 1.35rem;
    margin-top: 2.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--color-border-muted);
    margin-bottom: 1rem;
  }

  .prose h3 { font-size: 1.1rem; margin-top: 2rem; margin-bottom: 0.6rem; }
  .prose h4 { font-size: 0.95rem; margin-top: 1.5rem; margin-bottom: 0.5rem; }

  .prose p { margin: 0.9em 0; }
  .prose strong { font-weight: 600; color: var(--color-text); }

  .prose a {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
    border-bottom: 1px solid transparent;
    transition: border-color 0.15s;
  }
  .prose a:hover { border-bottom-color: var(--color-primary); }

  .prose code {
    font-family: var(--font-mono);
    font-size: 0.825em;
    background: var(--color-inline-code-bg);
    color: var(--color-inline-code);
    padding: 0.15em 0.35em;
    border-radius: 4px;
    font-weight: 450;
  }

  .prose pre {
    margin: 1.25em 0;
    padding: 1rem 1.25rem;
    background: var(--color-code-bg);
    color: var(--color-code-text);
    border-radius: 8px;
    overflow-x: auto;
    line-height: 1.6;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .prose pre code {
    background: none;
    padding: 0;
    color: inherit;
    font-size: 0.8rem;
    font-weight: 400;
    border-radius: 0;
  }

  .prose pre.language-markdown {
    background: var(--color-bg-subtle);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }
  .prose pre.language-markdown code { color: inherit; }

  .prose blockquote {
    margin: 1.25em 0;
    padding: 0.75rem 1rem;
    border-left: 3px solid var(--color-primary);
    background: var(--color-primary-bg);
    border-radius: 0 6px 6px 0;
  }
  .prose blockquote p { margin: 0.25em 0; color: #1e40af; }

  .prose hr {
    margin: 2.5rem 0;
    border: none;
    border-top: 1px solid var(--color-border);
  }

  .prose ul, .prose ol { margin: 0.9em 0; padding-left: 1.5em; }
  .prose li { margin: 0.35em 0; }
  .prose li > ul, .prose li > ol { margin: 0.2em 0; }

  .prose table {
    width: 100%;
    margin: 1.25em 0;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .prose th, .prose td {
    padding: 0.6em 0.85em;
    border: 1px solid var(--color-border);
    text-align: left;
  }
  .prose th {
    background: var(--color-bg-subtle);
    font-weight: 600;
    font-size: 0.825em;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-secondary);
  }
  .prose tr:nth-child(even) td { background: var(--color-bg-subtle); }

  .prose img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    border: 1px solid var(--color-border);
  }

  /* ── GFM alerts ──────────────────────────── */

  .prose .alert {
    margin: 1.25em 0;
    padding: 0.85rem 1rem 0.85rem 1.1rem;
    border-left: 3px solid var(--color-text-secondary);
    background: var(--color-bg-subtle);
    border-radius: 0 6px 6px 0;
  }
  .prose .alert > p:first-child { margin-top: 0; }
  .prose .alert > p:last-child { margin-bottom: 0; }
  .prose .alert-note     { border-left-color: var(--color-primary);      background: var(--color-primary-bg); }
  .prose .alert-tip      { border-left-color: var(--color-accent-green); background: #ecfdf5; }
  .prose .alert-important{ border-left-color: #7c3aed;                    background: #f5f3ff; }
  .prose .alert-warning  { border-left-color: var(--color-accent-amber); background: #fffbeb; }
  .prose .alert-caution  { border-left-color: var(--color-accent-red);   background: #fef2f2; }

  /* ── Task lists ──────────────────────────── */

  .prose .task-list-item { list-style: none; margin-left: -1.25em; }
  .prose .task-list-item input[type="checkbox"] { margin-right: 0.4em; }

  /* ── Mermaid ─────────────────────────────── */

  .prose pre.mermaid {
    background: transparent;
    color: inherit;
    border: 1px solid var(--color-border);
    padding: 1rem;
    text-align: center;
    overflow-x: auto;
  }

  /* ── KaTeX display math ──────────────────── */

  .prose .katex-display {
    margin: 1.25em 0;
    overflow-x: auto;
    overflow-y: hidden;
  }

  /* ── Heading anchors ─────────────────────── */

  .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
    scroll-margin-top: calc(var(--nav-height) + 1rem);
  }
  .prose .doc-anchor {
    text-decoration: none;
    color: var(--color-text-muted);
    opacity: 0;
    margin-right: 0.25em;
    transition: opacity 0.15s;
  }
  .prose h1:hover .doc-anchor,
  .prose h2:hover .doc-anchor,
  .prose h3:hover .doc-anchor,
  .prose h4:hover .doc-anchor,
  .prose h5:hover .doc-anchor,
  .prose h6:hover .doc-anchor { opacity: 1; }

  /* ── Footnotes ───────────────────────────── */

  .prose .footnotes {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.875em;
    color: var(--color-text-secondary);
  }

  /* ── Footer ──────────────────────────────── */

  .doc-footer {
    max-width: var(--content-max-width);
    margin: auto 0 0;
    padding: 1.5rem 0 2rem;
    border-top: 1px solid var(--color-border);
    width: 100%;
  }

  .doc-footer-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.775rem;
    color: var(--color-text-muted);
  }

  .doc-footer-inner a {
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color 0.15s;
  }
  .doc-footer-inner a:hover { color: var(--color-primary); }

  .doc-footer-links { display: flex; gap: 1rem; }

  /* ── Responsive ──────────────────────────── */

  @media (max-width: 860px) {
    /* On mobile the sidebar slides in from the left as an overlay, so we
       drop it out of the centered flex layout and pin it fixed. */
    .doc-layout {
      padding: var(--nav-height) 1.25rem 0;
      gap: 0;
    }

    .doc-sidebar {
      position: fixed;
      top: var(--nav-height);
      left: 0;
      bottom: 0;
      max-height: none;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      background: var(--color-bg);
      box-shadow: none;
      z-index: 50;
    }

    .doc-sidebar.open {
      transform: translateX(0);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
    }

    .doc-content { padding: 1.5rem 0 3rem; }

    .doc-footer { padding: 1.5rem 0 2rem; }

    .doc-nav-hamburger { display: block; }
    .doc-nav-links { display: none; }

    .doc-sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.2);
      z-index: 40;
    }
    .doc-sidebar-overlay.open { display: block; }
  }

  @media (max-width: 480px) {
    .doc-page-header h1 { font-size: 1.5rem; }
    .prose h1 { font-size: 1.5rem; }
    .prose h2 { font-size: 1.2rem; }
  }
</style>
{{ head.style }}
</head>
<body>
<markdoc component="nav" />
<div class="doc-sidebar-overlay" id="sidebar-overlay"></div>
<div class="doc-layout">
  <markdoc component="sidebar" />
  <main class="doc-main">
    <article class="doc-content">
      <markdoc component="page-header" title="{{ scope.title }}" description="{{ scope.description }}" />
      <div class="prose">{{ body.main }}</div>
    </article>
    <markdoc component="footer" />
  </main>
</div>
<script>
(function() {
  // Sidebar active link
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var links = document.querySelectorAll('.doc-sidebar-nav a');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href').replace(/\/+$/, '') || '/';
    if (href === path) links[i].classList.add('active');
  }

  // Mobile sidebar toggle
  var hamburger = document.getElementById('nav-hamburger');
  var sidebar = document.querySelector('.doc-sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  if (hamburger && sidebar && overlay) {
    function toggle() {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    }
    hamburger.addEventListener('click', toggle);
    overlay.addEventListener('click', toggle);
  }
})();
</script>
<!-- Mermaid — renders `<pre class="mermaid">…</pre>` blocks emitted by MarkdownViewer. -->
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.5.0/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
  mermaid.run({ querySelector: "pre.mermaid" });
</script>
{{ body.scripts }}
</body>
</html>