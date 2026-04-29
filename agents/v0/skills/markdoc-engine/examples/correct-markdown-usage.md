---
title: Getting Started
description: A walkthrough of common Markdoc components.
---

# Getting Started

Welcome. This page uses three components — `card`, `callout`, and `note` —
to demonstrate how tag attributes and bodies flow into templates.

## Card (file-based)

{% card title="Quick install" variant="info" %}
Install via your favourite package manager:

```sh
yarn add @ecosy/markdoc
```
{% /card %}

## Callout (plugin-provided)

{% callout title="Heads up" %}
Callouts are contributed inline by the `ThemeOverlay` plugin — they override
any file-based component of the same name.
{% /callout %}

## Note (plugin-provided)

{% note %}
You can mix markdown and components freely. Tag bodies are rendered as
markdown *before* being interpolated into the template.
{% /note %}

## Attribute dot-paths

The interpolator uses `JSONQuery.evaluate`, so dot-paths resolve:

- `{{ scope.title }}`  → the page title
- `{{ attrs.class }}`  → a tag's `class` attribute
- `{{ body }}`         → the tag body

Missing keys are left literal — that way typos are visible in the rendered
page instead of silently swallowed.
