import { Freezable, freeze } from "@ecosy/core";
import { MarkdocConfigurations } from "./common";

export interface ConfigurationLike {
  options: Freezable<MarkdocConfigurations>;
}

export function Configuration(options: MarkdocConfigurations) {
  return class ConfigurationNode {
    readonly options = freeze(options);
  }
}
