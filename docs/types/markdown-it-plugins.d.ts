/**
 * Ambient module declarations for markdown-it plugins that don't ship types.
 *
 * Keep these minimal — just enough for markdown-it's `.use(plugin, options)`
 * to accept them. The plugin internals are opaque to us.
 */

declare module "markdown-it-attrs" {
  import type { PluginWithOptions } from "markdown-it";
  interface Options {
    leftDelimiter?: string;
    rightDelimiter?: string;
    allowedAttributes?: Array<string | RegExp>;
  }
  const plugin: PluginWithOptions<Options>;
  export default plugin;
}

declare module "markdown-it-task-lists" {
  import type { PluginWithOptions } from "markdown-it";
  interface Options {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: PluginWithOptions<Options>;
  export default plugin;
}

declare module "@traptitech/markdown-it-katex" {
  import type { PluginWithOptions } from "markdown-it";
  interface Options {
    throwOnError?: boolean;
    errorColor?: string;
    [key: string]: unknown;
  }
  const plugin: PluginWithOptions<Options>;
  export default plugin;
}
