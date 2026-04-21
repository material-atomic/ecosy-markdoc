import type { MarkdocConfigurations } from "./core/common";
import { MarkdocTeleport, Runtimable } from "./core/context";

interface EdgeServer {
  fetch(request: Request): Promise<Response>;
}

interface RuntimeLike {
  server: EdgeServer;
}

export default function markdoc(options: MarkdocConfigurations): EdgeServer {
  MarkdocTeleport.inject({
    runtime: Runtimable(options),
  });

  return MarkdocTeleport.get<RuntimeLike>("runtime").server;
}
