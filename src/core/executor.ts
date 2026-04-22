import { Executable } from "../classable/executable";
import { createInject } from "../classable/inject";
import { Teleportability } from "../classable/teleportability";

export const MarkdocTeleport = Teleportability({
  key: Symbol.for("@ecosy/markdoc:container"),
  injects: {},
});

export const Executor = Executable(MarkdocTeleport);

export const Inject = createInject(() => MarkdocTeleport);
