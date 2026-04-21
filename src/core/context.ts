import { Executable } from "../classable/executable";
import { Injectable } from "../classable/injectable";
import { Teleportability } from "../classable/teleportability";
import { MarkdocConfigurations } from "./common";
import { Configuration } from "./configuration";
import { Documentation } from "./documentation";
import { Fetchable } from "./fetchable";
import { Manifest } from "./manifestable";
import { Repo } from "./repo";
import { Server } from "./server";

export function Runtimable(options: MarkdocConfigurations) {
  return class Runtime extends Injectable({
    configuration: Configuration(options),
    fetchable: Fetchable,
    repo: Repo,
    documentation: Documentation(options),
    manifest: Manifest,
    server: Server,
  }) {}
}

export const MarkdocTeleport = Teleportability({
  key: Symbol.for("@ecosy/markdoc:container"),
  injects: {},
});

export const Executor = Executable(MarkdocTeleport);
