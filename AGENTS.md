# Agent Instructions

This file gives AI coding agents (GitHub Copilot CLI, Kiro, etc.) the context
they need to work effectively in this repository.

> **This is a public, open-source repository.** Never include internal
> company details, credentials, infrastructure hostnames/IPs, employee names,
> customer data, or other non-public information in code, comments, commit
> messages, PR descriptions, or issues. When in doubt, keep things generic.

## What this repo is

This is a fork of [Zulip](https://github.com/zulip/zulip), the open-source
team chat application. We build on top of upstream Zulip and layer in
additional functionality to support how our organization uses it. Keep that
additional functionality generic in any public-facing description — don't
document internal business logic, processes, or systems in detail here.

## Branch layout

- **`main`** — a mirror of upstream Zulip. It should track upstream as
  closely as possible. The only intentional divergence from upstream on this
  branch is the removal of the GitHub Actions workflows. Do not add any other
  custom changes here — if you're asked to add or modify functionality, it
  does **not** belong on `main`.
- **`drc_9.2.x`** — the active development branch. This is Zulip 9.2 (based
  on the upstream `9.2.x` line) plus our custom functionality. Nearly all
  feature work, fixes, and custom additions should target this branch (or a
  feature branch based off of it), not `main`.

When picking a base branch for new work, default to `drc_9.2.x` unless
explicitly told otherwise.

## Tooling

We use both **GitHub Copilot CLI** and **Kiro** as AI coding agents against
this repo.

### `.agent/` directory (gitignored)

The `/.agent/` directory at the repo root holds project-specific agent
configuration that should never be published:

- `.agent/skills/` — custom skills used by our agents for this project.
- `.agent/steering/` — steering/context documents that describe how we want
  agents to operate on this codebase.

This directory is listed in `.gitignore` because its contents may include
internal or sensitive details that are fine for local/internal use but must
not appear in the public repository history. Never remove it from
`.gitignore`, and never force-add files from it.

If `.agent/skills/` or `.agent/steering/` exist locally, check them for
additional, more specific instructions before starting work.
