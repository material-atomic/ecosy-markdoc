import { Executable } from "@ecosy/classable/executable";
import { createInject } from "@ecosy/classable/inject";
import { Teleportability } from "@ecosy/classable/teleportability";

export const MarkdocTeleport = Teleportability({
  key: Symbol.for("@ecosy/markdoc:container"),
  injects: {},
});

export const Executor = Executable(MarkdocTeleport);

export const Inject = createInject(() => MarkdocTeleport);
