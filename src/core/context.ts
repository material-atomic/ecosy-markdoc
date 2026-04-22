import { Injectable } from "../classable/injectable";
import { MarkdocConfigurations } from "./common";
import { Configuration } from "./configuration";
import { Documentation } from "./documentation";
import { Fetchable } from "./fetchable";
import { Manifest } from "./manifestable";
import { Pagable } from "./pagable";
import { Pluginable } from "./plugin";
import { Repo } from "./repo";
import { Server } from "./server";

export { Executor, MarkdocTeleport } from "./executor";

export function Runtimable(options: MarkdocConfigurations) {
  return class Runtime extends Injectable({
    configuration: Configuration(options),
    fetchable: Fetchable,
    repo: Repo,
    documentation: Documentation(options),
    manifest: Manifest,
    pagable: Pagable,
    pluginable: Pluginable,
    server: Server,
  }) {}
}
