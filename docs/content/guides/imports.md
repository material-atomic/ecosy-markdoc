---
title: Custom Imports
description: Extend the runtime with custom services via dependency injection
order: 4
---

# Custom Imports

The `imports` option lets you inject custom classables into the runtime DI container. This is how you extend the framework with your own services — accessible from any classable via `Inject<T>("name")`.

## Basic usage

Pass an object to `imports` where keys are injection names and values are class constructors or factory descriptors:

```typescript
import markdoc from "@ecosy/markdoc";
import { MyAnalytics } from "./services/analytics";
import { MySearch } from "./services/search";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  imports: {
    analytics: MyAnalytics,
    search: MySearch,
  },
});
```

## Class constructor

The simplest form — a zero-argument class:

```typescript
class MyAnalytics {
  private events: string[] = [];

  track(event: string) {
    this.events.push(event);
  }

  flush() {
    const batch = this.events.splice(0);
    // send to analytics service
    return batch;
  }
}

// In config
imports: {
  analytics: MyAnalytics,
}
```

## Factory descriptor

When your service needs dependencies from the runtime, use a factory with `target` and `get`:

```typescript
import { Inject } from "@ecosy/markdoc";

class SearchIndex {
  constructor(
    private readonly fetchable: FetchableLike,
  ) {}

  async search(query: string) {
    // use this.fetchable to call a search API
  }
}

// In config
imports: {
  search: {
    target: SearchIndex,
    get: (accessor) => [accessor.get("fetchable")],
  },
}
```

The `get` function receives an accessor that can resolve any other injection by name — including core runtime services and other imports.

## Accessing imports

Once registered, your import is available anywhere in the DI system via `Inject`:

```typescript
import { Inject } from "@ecosy/markdoc";

class MyPlugin extends Plugin {
  constructor(
    ctx: RequestContext,
    store: StoreLike,
    private readonly analytics = Inject<MyAnalytics>("analytics"),
  ) {
    super(ctx, store);
  }

  fetch(req: MarkdocRequest, res: MarkdocResponse) {
    this.analytics.track(`page:${req.pathname}`);
    return res.json({ tracked: true });
  }
}
```

## Overriding the Engine

The built-in Engine handles `<markdoc component="..." />` tag resolution. Since `engine` is not a core protected key, you can override it via imports:

```typescript
class CustomEngine {
  async preload() {
    // custom component loading logic
  }

  async resolve(html: string, store: StoreLike) {
    // custom resolution logic
    return html;
  }
}

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  imports: {
    engine: CustomEngine,
  },
});
```

The custom engine must implement the `EngineLike` interface: `preload()` and `resolve(html, store)`.

## Protected keys

The following injection keys are reserved by the core runtime and cannot be overridden via imports:

`configuration`, `fetchable`, `repo`, `documentation`, `manifest`, `pagable`, `pluginable`, `server`

If you include any of these keys in `imports`, they are silently ignored — the core runtime service always takes precedence.

## Memory note

The `imports` object is stripped from the config before it reaches the Configuration classable. This prevents class constructors and factory functions from being frozen and held in memory unnecessarily. Your imports are resolved by the DI container during runtime construction and do not persist in the configuration store.
