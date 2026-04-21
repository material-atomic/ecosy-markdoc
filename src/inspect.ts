import { MarkdocTeleport } from "./core/context";

function describeInject(value: unknown): string {
  if (typeof value === "function") {
    return `[class ${(value as { name?: string }).name || "anonymous"}]`;
  }
  if (value && typeof value === "object" && "target" in value) {
    const target = (value as { target: { name?: string } }).target;
    return `[factory → ${target.name || "anonymous"}]`;
  }
  return typeof value;
}

export default function inspect() {
  const injects = MarkdocTeleport.injects;

  console.log("=== MarkdocTeleport ===");

  for (const [key, value] of Object.entries(injects)) {
    console.log(`${key}: ${describeInject(value)}`);

    // Drill into Injectable-generated classes
    const cls = typeof value === "function" ? value : null;
    const innerInjects = (cls as { __injects?: Record<string, unknown> } | null)?.__injects;

    if (innerInjects) {
      for (const [innerKey, innerValue] of Object.entries(innerInjects)) {
        console.log(`  ${innerKey}: ${describeInject(innerValue)}`);
      }
    }
  }
}
