export { default as markdoc } from "./markdoc";
export { type MarkdocConfigurations, type RuntimeContext } from "./core/common";
export { type MarkdownParser, builtinParser, sanitizeHtml } from "./core/parser";
export { redirect, type RedirectStatus } from "./core/redirect";
export {
  type PageStoreState,
  type HeadState,
  type BodyState,
  type ScopeState,
} from "./core/request-context";
export type {
  PluginRouteSchema,
  PluginRegistry,
  PreloadSyncStatic,
  StoreLike,
  PluginLike,
  PluginableLike,
  PluginableLikeLike,
  PluginableNode,
  PluginConstructor,
} from "./core/plugin";
export { Plugin } from "./core/plugin";

// DI primitives — re-exported so user-registered classables (the
// `imports` config option) and any consumer that prefers the legacy
// constructor-default-parameter idiom can resolve runtime injectables
// without reaching for internal paths.
export { Inject } from "./core/executor";

// Reserved injectable interfaces — exposed so external plugins can type
// `this.runtime.configuration` etc. without redeclaring local mirrors.
export type { ConfigurationLike } from "./core/configuration";
export type { DocumentationLike } from "./core/documentation";
export type { EngineLike } from "./core/engine";
export type { FetchableLike } from "./core/fetchable";
export type { ManifestLike } from "./core/manifestable";
export type { PagableLike } from "./core/pagable";
