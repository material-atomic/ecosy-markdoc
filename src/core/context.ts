import { Injectable } from "@ecosy/classable/injectable";
import type { MarkdocConfigurations } from "./common";
import { Configuration } from "./configuration";
import { Documentation } from "./documentation";
import { Engine } from "./engine";
import { Fetchable } from "./fetchable";
import { Manifest } from "./manifestable";
import { Pagable } from "./pagable";
import { Pluginable } from "./plugin";
import { Repo } from "./repo";
import { Server } from "./server";

export { Executor, MarkdocTeleport } from "./executor";

export function Runtimable(options: MarkdocConfigurations) {
  // Strip imports before passing to Configuration — avoid freezing
  // class references and keeping heavy objects in memory.
  const { imports, ...configOptions } = options;

  return class Runtime extends Injectable({
    // Built-in engine — overridable via imports
    engine: Engine,
    // User imports — can override engine, but not core keys below
    ...(imports ?? {}),
    // Core runtime — cannot be overridden
    configuration: Configuration(configOptions),
    fetchable: Fetchable,
    repo: Repo,
    documentation: Documentation(configOptions),
    manifest: Manifest,
    pagable: Pagable,
    pluginable: Pluginable,
    server: Server,
  }) {};
}
