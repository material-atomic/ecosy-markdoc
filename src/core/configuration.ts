import { freeze } from "@ecosy/core/utilities";
import type { MarkdocConfigurations } from "./common";
import { type Freezable } from "@ecosy/core/types";

export interface ConfigurationLike {
  options: Freezable<MarkdocConfigurations>;
}

export interface ConfigurationConstructor {
  new (): ConfigurationLike;
}

export function Configuration(options: MarkdocConfigurations): ConfigurationConstructor {
  return class ConfigurationNode {
    readonly options = freeze(options);
  };
}
