/**
 * ✅ Correct: RSSFeed with per-request dynamic items.
 *
 * The `items` factory resolves items at request time — pull from a manifest,
 * DB, or external API. The plugin handles channel envelope, date formatting,
 * XML escaping, CDATA wrapping, and the required `<atom:link rel="self">`.
 */
import markdoc, { RSSFeed } from "@ecosy/markdoc";

interface DocPost {
  slug: string;
  title: string;
  excerpt: string;
  html: string;
  createdAt: string;
  author: string;
  tags: string[];
}

export default markdoc({
  repo: "owner/docs",

  plugins: [
    RSSFeed({
      // `format: "atom"` switches to Atom 1.0. Default is `"rss"` (2.0).
      format: "rss",
      path: "/feed.xml",

      // Channel metadata (required).
      title: "Ecosy Docs",
      description: "Latest documentation updates",
      link: "https://docs.ecosy.io",
      language: "en",
      copyright: `© ${new Date().getFullYear()} Ecosy`,

      // Cap the number of items rendered. Default 20.
      maxItems: 25,

      // Dynamic items — the plugin forwards the request so you can build
      // absolute URLs from `req.mdUrl.origin`.
      items: async (req) => {
        const res = await fetch(`${req.mdUrl.origin}/api/posts?limit=25`);
        const posts = (await res.json()) as DocPost[];

        return posts.map((p) => ({
          title: p.title,
          link: `${req.mdUrl.origin}/posts/${p.slug}`,
          description: p.excerpt,
          content: p.html,
          pubDate: p.createdAt,
          author: p.author,
          categories: p.tags,
        }));
      },
    }),
  ],
});
