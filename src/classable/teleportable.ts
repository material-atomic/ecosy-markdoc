import type { AnchorLike } from "./anchorable";
import type { AnchoribilityLike } from "./anchoribility";
import { classable } from "./classable";
import {
  Injectable,
  type InjectableBuidlerLike,
  type InjectedInstances,
  type InjectMap,
} from "./injectable";
import type { StaticExtended } from "./placeholder";
import type { Classable, ClassType } from "./types";

export interface TeleportableOptions<Injects extends InjectMap = {}> {
  injects: Injects;
  getways?: Array<AnchoribilityLike<AnchorLike> | AnchorLike>;
}

/**
 * Teleportable: a **cross-container reconciliation engine**.
 *
 * Where {@link Injectable} performs intra-container reconciliation (same
 * class, successive re-constructions reuse compatible prior instances),
 * Teleportable merges dependencies from *external* anchors (Yang) with
 * locally-constructed ones (Yin) at the moment of `new Teleport()`.
 *
 * ### Semantics worth knowing
 *
 * - **Snapshot, not reactive.** The soul pool is gathered *synchronously
 *   at constructor time*. If the underlying anchor mutates afterwards,
 *   this Teleport instance will not observe the change. Build a new
 *   Teleport to re-capture.
 *
 * - **External trust.** Matching teleported instances uses `instanceof` /
 *   `constructor === Target` — the same loose identity logic Injectable
 *   uses for reconciliation. Applied across containers this means a
 *   `PostgresDB` in the anchor will be reused where `DB` is requested
 *   (polymorphism), with no way to distinguish "right container, wrong
 *   config" from "same thing". External anchors are trusted sources.
 *
 * - **Ownership is not tracked.** Yang (teleported) and Yin (native)
 *   instances both end up in `__instances`. A future dispose pass would
 *   not know which entries are foreign-owned. If/when dispose is added
 *   at this layer, an ownership map will be needed.
 *
 * - **Soul extraction filter.** Only values with a function constructor
 *   (i.e. actual class instances) are pulled from anchor portals. Plain
 *   config objects, nested data, and closures are skipped — without this
 *   filter Teleport would happily match raw `{ host: "..." }` config
 *   against an `instanceof` check and produce nonsense bindings.
 *
 * - **Portal scan is a fallback, not a contract.** Soul harvesting uses
 *   `Object.values(Portal)` to find instances. `AnchorLike` does *not*
 *   require exposing instances as enumerable own-properties — an anchor
 *   using private fields, an internal `Map`, or no storage at all is
 *   perfectly valid under its declared contract. The scan is a best-
 *   effort heuristic that works with the current anchor implementations
 *   in this package. TODO: promote to an explicit protocol (e.g.
 *   `Anchor.__instances` or an iterator) before external anchor authors
 *   show up and break silently.
 *
 * - **First-match-wins (implicit priority).** When multiple getways expose
 *   a matching soul for the same inject key, selection is deterministic
 *   *given* a fixed input: it picks the first match in
 *   `getways[0].Anchor` by `Object.values` order, then `getways[1]`, etc.
 *   There is no priority field, no strategy hook, and no conflict
 *   detection. Callers relying on specific resolution (prod vs test
 *   variants of the same class) must order `getways` accordingly. If
 *   this turns into a real pain point, add a priority / strategy
 *   parameter rather than letting callers exploit ordering quirks.
 */
export function Teleportable<Injects extends InjectMap = {}>(options: TeleportableOptions<Injects>) {
  const { injects, getways = [] } = options;

  // Đạo Sinh Nhất: Bỏ trống trần tục, để Accessor là một cái vỏ Thái Cực rỗng không.
  // Double-cast through `unknown` because `Injectable({})`'s declared static
  // surface (`InjectableBuidlerLike`) intentionally hides the `__instances`
  // registry from public view. Teleport needs to write into it, so we widen
  // the static shape locally without leaking it back to authors.
  const Accessor = Injectable({}) as unknown as ClassType<object> & {
    __instances: Map<string, unknown>;
  };

  return class Teleport extends Accessor {
    /**
     * Per-class registry — same pattern as Injectable's child-layer static.
     * Declared here so Teleport owns its own Map instead of inheriting
     * Accessor's via the prototype chain and sharing state across sibling
     * Teleport classes.
     */
    static override __instances: Map<string, unknown> = new Map<string, unknown>();

    constructor() {
      super();

      // `super()` (from Injectable({})) overwrites `new.target.__instances`
      // with a fresh empty Map, so we write into that below.
      const Cls = new.target as typeof Teleport;

      // =========================================================
      // 1. TỤ KHÍ: Gom linh hồn từ các cổng NGAY LÚC NÀY (snapshot)
      // =========================================================
      // Insertion order of `soulPool` = iteration order of `getways`, then
      // `Object.values(Portal)`. The first-match-wins loop below relies on
      // this ordering being stable — callers control priority by arranging
      // `getways`. See "First-match-wins" in the JSDoc above.
      const soulPool = new Set<object>();
      for (const Getway of getways) {
        const Portal =
          (Getway as AnchoribilityLike<AnchorLike>).Anchor ||
          (Getway as AnchorLike);
        // Fallback scan — not a contract. AnchorLike does not promise
        // enumerable instance properties. See "Portal scan is a fallback"
        // in the JSDoc above for the upgrade path.
        for (const token of Object.values(Portal)) {
          // Only keep values that look like class instances. Raw config
          // objects, plain dictionaries, and closures are skipped — they
          // would otherwise pass `typeof === "object"` and then fail the
          // `instanceof` match noisily (or worse, match by accident).
          if (
            token &&
            typeof token === "object" &&
            typeof (token as { constructor?: unknown }).constructor === "function" &&
            (token as { constructor: unknown }).constructor !== Object
          ) {
            soulPool.add(token as object);
          }
        }
      }

      // =========================================================
      // 2. PHÂN CỰC LƯỠNG NGHI (Tách Âm - Dương tại trận)
      // =========================================================
      const yangTeleported = new Map<string, object>(); // DƯƠNG: Đã có sẵn, linh động, ngoại sinh
      const yinNatives: InjectMap = {};                 // ÂM: Chưa có, tĩnh lặng, chờ Nhất khai sinh

      for (const [propsKey, TokenClass] of Object.entries(injects)) {
        let isTeleported = false;
        const TargetDefinition = classable.getTarget(
          TokenClass as Classable<unknown, unknown[], string, unknown>,
        ) as unknown as (abstract new (...args: never[]) => object) | undefined;

        if (TargetDefinition) {
          for (const soul of soulPool) {
            // Loose identity match — see JSDoc "External trust" note above.
            if (soul instanceof TargetDefinition || soul.constructor === TargetDefinition) {
              yangTeleported.set(propsKey, soul);
              isTeleported = true;
              break;
            }
          }
        }

        // Nếu không có ngoại lực (Dương), ném nó về cõi Âm chờ xử lý
        if (!isTeleported) {
          yinNatives[propsKey] = TokenClass;
        }
      }

      // =========================================================
      // 3. THÁI CỰC DUNG HỢP (Hội tụ Vạn Vật)
      // =========================================================

      // DƯƠNG THĂNG: Hấp thụ trực tiếp tinh hoa xuyên không từ vũ trụ
      for (const [key, soul] of yangTeleported.entries()) {
        Object.defineProperty(this, key, { value: soul, enumerable: true, configurable: true });
        Cls.__instances.set(key, soul); // Static registry — not `this.__instances` (undefined)
      }

      // ÂM GIÁNG: Triệu hồi "Nhất" (Injectable) để đúc xác phàm thuần túy
      if (Object.keys(yinNatives).length > 0) {
        const NativeCreator = Injectable(yinNatives);
        const newborn = new NativeCreator() as unknown as Record<string, unknown>;

        // Danh chính ngôn thuận — đọc qua Public Interface, không chạm
        // `__instances` của container khác.
        for (const key of Object.keys(yinNatives)) {
          const instance = newborn[key];
          Object.defineProperty(this, key, { value: instance, enumerable: true, configurable: true });
          Cls.__instances.set(key, instance);
        }
      }
    }
  } as unknown as StaticExtended<InjectableBuidlerLike, InjectedInstances<Injects>>;
}
