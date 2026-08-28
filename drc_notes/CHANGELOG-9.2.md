# DRC Zulip 9.2.x — Changelog of Customizations

This document tracks all modifications made to the `drc_9.2.x` branch relative to the upstream Zulip 9.2 release (tag `9.2.0`, commit `b78d70e592`). The branch was forked from the upstream 9.2 line and carries DRC-specific changes for our internal deployment.

**Base**: Zulip 9.2.0 (upstream tag `9.2.0`)
**Branch**: `drc_9.2.x`
**Total commits**: 38
**Files changed**: 54 (+773 / -1060 lines)
**Date range**: 2024-12-30 through 2026-08-28

---

## Table of Contents

1. [Access Control & Security](#1-access-control--security)
2. [Mobile & Desktop App Blocking](#2-mobile--desktop-app-blocking)
3. [UI Restrictions for Members & Guests](#3-ui-restrictions-for-members--guests)
4. [Buddy List & Presence Changes](#4-buddy-list--presence-changes)
5. [Stream/Channel Display Changes](#5-streamchannel-display-changes)
6. [Emoji & Reaction Restrictions](#6-emoji--reaction-restrictions)
7. [User Display Name Formatting](#7-user-display-name-formatting)
8. [Login & Authentication Flow](#8-login--authentication-flow)
9. [Email Sending Restrictions](#9-email-sending-restrictions)
10. [DRC Admin Scripts & Reports](#10-drc-admin-scripts--reports)
11. [Infrastructure: Sharding Fixes](#11-infrastructure-sharding-fixes)
12. [Infrastructure: S3 Upload Configuration](#12-infrastructure-s3-upload-configuration)
13. [Infrastructure: Node/Corepack Installation](#13-infrastructure-nodecorepack-installation)
14. [CI/CD: Jenkins Pipelines](#14-cicd-jenkins-pipelines)
15. [CI/CD: Docker & GitHub Actions Removal](#15-cicd-docker--github-actions-removal)
16. [Settings & Configuration](#16-settings--configuration)
17. [Miscellaneous UI Fixes](#17-miscellaneous-ui-fixes)

---

## 1. Access Control & Security

### Block user agents at login page (PR #85, #95)

**Files**: `zerver/views/auth.py`, `zproject/dev_settings.py`

Added `block_user_agent()` function that checks the request User-Agent against `settings.BLOCKED_USER_AGENTS`. Applied at:
- `login_page()` — returns 403 with a custom error template
- `api_get_server_settings()` — returns bare 403

The "ISLAND" browser (corporate secure browser) is explicitly exempted from blocking.

```python
BLOCKED_USER_AGENTS = ["ZulipElectron", "Android", "iPhone", "iPad"]
```

### BlockClientsMiddleware (PR #97)

**Files**: `zerver/middleware.py`, `zproject/computed_settings.py`, `zproject/default_settings.py`

Application-level middleware that runs after `LogRequests` and returns 403 JSON for any client in `BLOCKED_CLIENT_NAMES`. Checks both the parsed `client_name` and raw User-Agent header to prevent bypass.

```python
BLOCKED_CLIENT_NAMES: set[str] = {"ZulipMobile"}
```

### Disable mobile/desktop OAuth flows

**File**: `zerver/views/auth.py`

The `login_or_register_remote_user()` function now returns HTTP 500 "Mobile App is disabled" / "Desktop App is disabled" instead of completing the mobile/desktop OTP login flows.

---

## 2. Mobile & Desktop App Blocking

### Redirect login page to external portal (PR #74, #85)

**Files**: `zproject/urls.py`, `zerver/views/drc_redirect.py`, `zproject/dev_settings.py`

The `/login/` URL now redirects to `settings.EDIRECT_REDIRECT` (an external portal URL). The original login page is accessible at `/login_local/` for internal/admin use.

```python
# urls.py
path("login/", edirect, name="edirect"),
path("login_local/", login_page, {"template_name": "zerver/login.html"}, name="login_page"),
```

### Custom login error template

**File**: `templates/zerver/drc_login_error.html`

Rendered when a blocked user agent attempts to access the login page.

---

## 3. UI Restrictions for Members & Guests

### Added `is_member` role flag

**Files**: `zerver/lib/events.py`, `web/src/state_data.ts`

A computed boolean `is_member` is now part of the initial state data, true when the user is not admin, owner, moderator, or guest. Used throughout the frontend to apply member-specific restrictions.

### Hide privacy settings for members

**Files**: `web/src/settings.js`, `web/src/settings_config.ts`, `web/templates/settings/account_settings.hbs`

- Members see a reduced "information section" (only `starred_message_counts` and `fluid_layout_width`)
- The privacy settings section is hidden for members via `{{#unless is_member}}`

### Disable member unsubscribe from channels (PR #81)

**Files**: `web/src/stream_data.ts`, `web/templates/stream_settings/browse_streams_list_item.hbs`

- `can_toggle_subscription()` returns `false` for members (not just guests)
- The subscribe/unsubscribe button CSS class `sub_unsub_button` is removed from the browse streams UI, preventing click interaction

### Hide "Other Users" section for members

**Files**: `web/templates/right_sidebar.hbs`, `web/src/sidebar_ui.ts`

The "Other Users" buddy list section is hidden for both guests AND members via nested `{{#unless}}` blocks.

### Stream folders only for admins/owners/moderators

**File**: `web/src/stream_list.ts`

The folder view (`stream_sidebar.use_folders`) is now enabled only for admins, owners, and moderators — not all non-guest users.

---

## 4. Buddy List & Presence Changes

### Show all users in buddy list (PR #82)

**File**: `web/src/buddy_data.ts`

- Disabled the filter that only shows "recently active" users in the buddy list
- Changed `base_user_id_list` from `presence.get_user_ids()` to `people.get_active_user_ids()` so all active users appear regardless of presence status

### Guest header context fix

**File**: `web/src/message_view_header.ts`

Guests get a simplified message view header context (without some fields that would cause errors for their limited permissions).

---

## 5. Stream/Channel Display Changes

### Fix channel display for guests (PR #75, #76)

**Files**: `web/src/stream_list.ts`, `web/templates/bookend.hbs`

- Removed the `{{#unless is_guest}}` wrapper around the subscribe/unsubscribe button in message bookends, allowing guests to see subscription controls
- Moved `stream_sidebar.update_unread_counts()` call to the correct location

### Stream popover: expose is_member

**File**: `web/src/stream_popover.js`, `web/templates/popovers/left_sidebar_stream_actions_popover.hbs`

The `is_member` flag is passed to the left sidebar stream actions popover template for conditional rendering.

---

## 6. Emoji & Reaction Restrictions

### Disable reactions on PAS Announcements (PR #87, #93)

**File**: `web/templates/message_controls.hbs`

Reaction buttons (emoji, star, chevron menu) are wrapped in `{{#unless (eq msg/display_recipient "PAS Announcements")}}` to prevent all users from reacting to messages in that stream.

---

## 7. User Display Name Formatting

### Last name, first name format for non-admin users

**File**: `zerver/lib/users.py`

For users with role > 200 (guests/members), the display name is reformatted as "LastName, FirstName" using custom profile fields `first_name` and `last_name`. Wrapped in try/except to handle missing profile data gracefully.

---

## 8. Login & Authentication Flow

### Login redirect to corporate portal

See [Section 2](#2-mobile--desktop-app-blocking) — `/login/` redirects externally.

### Custom templates

**Files**:
- `templates/zerver/drc_login_error.html` — 403 error page for blocked agents
- `templates/zerver/drc_reports.html` — DRC reports admin page
- `templates/zerver/login_drc.html` — Custom DRC login template
- `templates/zerver/portico-no-header.html` — Portico base without navigation header

---

## 9. Email Sending Restrictions

### Allowlist for outbound emails

**File**: `zerver/lib/send_email.py`

The `send_email()` function early-returns (skips sending) for any template not in the allowlist:
- `zerver/emails/drc_reports`
- `zerver/emails/invitation`

This prevents Zulip from sending notification emails, digest emails, etc.

---

## 10. DRC Admin Scripts & Reports

### Admin maintenance and reports views

**Files**: `zerver/views/drc_scripts.py`, `zproject/urls.py`

A comprehensive admin panel providing:
- **Get Conversation** — export DMs between two users in a date range
- **Get User Messages** — export all messages for a user
- **Get User Roles** — CSV of all user roles
- **Get User Subscriptions** — list a user's stream subscriptions
- **Get Muted Topics** — list all muted topics
- **Get Mobile Devices** — users who sent messages via ZulipMobile
- **Enable/Disable Login Emails** — audit and bulk-disable login email notifications
- **Get User Activity** — comprehensive activity report (logins, analytics, messages, activity)
- **Get Mobile Access Requests** — DB query for users accessing via mobile clients (ZulipMobile, ZulipFlutter, ZulipElectron, Dart) within a date range

Reports are emailed as CSV attachments via `send_report()`.

### Nginx log parsing removed (PR #98)

Dead nginx log parsing code was removed in favor of the database query approach.

---

## 11. Infrastructure: Sharding Fixes

### Tornado sharding default fix (PR #83, #88)

**Files**: `scripts/lib/sharding.py`, `zerver/tornado/sharding.py`

- `write_updated_configs()` now dynamically sets the nginx default tornado upstream from the first entry in `tornado_sharding` config instead of hardcoding `http://tornado9800`
- `get_realm_tornado_ports()` prepends `giant-realm.` to the hostname when looking up shard assignments

---

## 12. Infrastructure: S3 Upload Configuration

### Force S3v4 signature and us-east-2 region

**File**: `zerver/lib/upload/s3.py`

The S3 bucket client is configured with:
- `region_name = "us-east-2"` (hardcoded)
- `signature_version = "s3v4"` (replacing the conditional auth/unsigned logic)

---

## 13. Infrastructure: Node/Corepack Installation

### Corepack installation fix

**File**: `scripts/lib/install-node`

- Installs `corepack@latest` via npm globally before enabling
- Sets `COREPACK_INTEGRITY_KEYS=0` to bypass integrity check issues

---

## 14. CI/CD: Jenkins Pipelines

### Modernized Jenkins pipelines

**Files**: `jenkins/build-package`, `jenkins/build-release`, `jenkins/ci/Jenkinsfile`

- Migrated from `@Library('DRC_Global_Pipeline_Libraries@master')` to `@Library('DRC_Global_Pipeline_Libraries') _`
- Replaced hardcoded `kubernetes` agent YAML with `drc_k8_agent(templates: [...])` helper
- Removed `container('zulip-ci-jammy')` wrappers (new agent handles this)
- Simplified stage structure (Configure → Build → Deploy)
- Changed Artifactory upload target from `downloads` to `devops-generic-dev`
- Added new `jenkins/ci/Jenkinsfile` for CI-only runs (lint, test, no deploy)
- `build-release` updated to deploy artifacts with timestamped filenames

---

## 15. CI/CD: Docker & GitHub Actions Removal

### Removed GitHub Actions workflows

**Deleted files**:
- `.github/FUNDING.yml`
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`
- `.github/workflows/codeql-analysis.yml`
- `.github/workflows/production-suite.yml`
- `.github/workflows/update-oneclick-apps.yml`
- `.github/workflows/zulip-ci.yml`

### Removed legacy Jenkins Docker/K8s definitions

**Deleted files**:
- `jenkins/docker/test/Dockerfile`
- `jenkins/docker/test/docker.sh`
- `jenkins/docker/test/entrypoint.sh`
- `jenkins/k8s/zulip_ci_jammy.yaml`

### Updated CI Dockerfile

**File**: `tools/ci/Dockerfile`

- Added DRC labels (`com.datarecognitioncorp.name`, `com.datarecognitioncorp.version`)
- Changed UID/GID from 1001 to 1000 for the `github` user (matches Jenkins agent expectations)

---

## 16. Settings & Configuration

### New settings added

| Setting | File | Purpose |
|---------|------|---------|
| `BLOCKED_CLIENT_NAMES` | `zproject/default_settings.py` | Set of client names blocked by middleware |
| `BLOCKED_USER_AGENTS` | `zproject/dev_settings.py` | List of user-agent strings blocked at login |
| `EDIRECT_REDIRECT` | `zproject/dev_settings.py` | URL to redirect `/login/` to |

---

## 17. Miscellaneous UI Fixes

### Typeahead dropdown width fix

**File**: `web/styles/typeahead.css`

- Changed `.simplebar-content` min-width from `max-content` to `800px`
- Changed `max-width` on larger viewports from `20.86em` to `inherit`

### Minor whitespace/formatting

**File**: `web/src/buddy_list.ts` — trivial blank line changes

---

## Commit Log (chronological)

| Date | Commit | Description |
|------|--------|-------------|
| 2024-12-30 | `0b1c8c4a69` | Initial patch (post-upgrade baseline) |
| 2025-01-02 | `d07e461a03` | PAS-379: Post-upgrade changes (templates, URLs, redirect) |
| 2025-01-02 | `ce7e9ee07a` | Delete .github directory |
| 2025-01-13 | `6ac8c332e9` | Show all users in buddy list |
| 2025-01-13 | `47e46d51d6` | Hide "other" users section |
| 2025-01-13 | `c0e65f9943` | Fix width (typeahead) |
| 2025-01-13 | `e2ee09e86e` | PAS-380: Fix channel display |
| 2025-01-13 | `77ceb994e3` | Hide other (additional) |
| 2025-01-13 | `b2a874ac6c` | PAS-382: Show offline users for guests/members |
| 2025-01-13 | `772bc1f1a6` | PAS-384: Remove privacy settings for members |
| 2025-01-13 | `ea363004ba` | Remove privacy settings |
| 2025-01-13 | `959cd8fcf9` | Revert PAS-382 (show offline users) |
| 2025-01-13 | `71a74a9b41` | Revert implementation |
| 2025-01-14 | `005d343bd0` | PAS-385: Disable member unsubscribe |
| 2025-01-14 | `83cbc2fb50` | Disable member unsubscribe implementation |
| 2025-01-14 | `b5e234d172` | Fix sharding |
| 2025-01-14 | `f532f0d73a` | Sharding fix (continued) |
| 2025-01-14 | `ca6894a1de` | Merge sharding fix |
| 2025-01-16 | `43a4a37656` | Buddy list: show all users |
| 2025-01-28 | `a8026b4b5d` | Move sidebar update (fix admin slowdowns) |
| 2025-02-06 | `700c5cdee0` | PAS-393: Block access (login redirect) |
| 2025-02-19 | `6c320a257e` | Fix Zulip CI |
| 2025-02-19 | `809e54dbca` | Update repos (Jenkins) |
| 2025-02-19 | `902e339e0a` | Add dev settings |
| 2025-03-07 | `7d059387d9` | Disable emojis for PAS announcements |
| 2025-04-09 | `b62e261f7b` | Fix sharding default |
| 2025-04-14 | `b4d416838c` | Update (Jenkins) |
| 2025-08-21 | `48ea9abdbf` | Update the pipeline (Jenkins) |
| 2025-08-27 | `3c8e91b8fe` | Update (Jenkins) |
| 2025-08-27 | `9ecbd4f852` | Jenkins updates (clean) |
| 2025-09-18 | `3f430b26de` | PAS-400: Block reactions on PAS Announcements |
| 2025-09-18 | `fcf72a72da` | Update build-release |
| 2026-02-09 | `9b00488562` | PAS-447: Block mobile access (nginx parsing) |
| 2026-05-05 | `2aa2996d47` | Fix mobile users tool |
| 2026-08-28 | `aefe2c7d20` | Add BlockClientsMiddleware |
| 2026-08-28 | `eefdbb45c7` | Merge PR #97 |
| 2026-08-28 | `f871e7a405` | Remove dead nginx log parsing |
| 2026-08-28 | `f0a7bb4537` | Merge PR #98 |

---

## Files Modified (summary)

```
 .github/                          (deleted — all workflows and templates)
 jenkins/build-package             (rewritten — modernized pipeline)
 jenkins/build-release             (rewritten — modernized pipeline)
 jenkins/ci/Jenkinsfile            (new — CI-only pipeline)
 jenkins/docker/test/              (deleted — legacy Docker setup)
 jenkins/k8s/                      (deleted — legacy K8s YAML)
 scripts/lib/install-node          (corepack fix)
 scripts/lib/sharding.py           (dynamic default upstream)
 templates/zerver/                 (4 new DRC templates)
 tools/ci/Dockerfile               (DRC labels, UID change)
 web/src/buddy_data.ts             (show all users)
 web/src/buddy_list.ts             (minor)
 web/src/message_view_header.ts    (guest context fix)
 web/src/settings.js               (member restrictions)
 web/src/settings_config.ts        (guest display settings)
 web/src/sidebar_ui.ts             (is_member flag)
 web/src/state_data.ts             (is_member schema)
 web/src/stream_data.ts            (disable member unsub)
 web/src/stream_list.ts            (folders for admins only)
 web/src/stream_popover.js         (is_member in popover)
 web/styles/typeahead.css          (width fix)
 web/templates/bookend.hbs         (remove guest unsub hide)
 web/templates/message_controls.hbs (disable PAS reactions)
 web/templates/popovers/...        (is_member)
 web/templates/right_sidebar.hbs   (hide other users)
 web/templates/settings/...        (hide privacy for members)
 web/templates/stream_settings/... (disable unsub button)
 zerver/lib/events.py              (is_member state)
 zerver/lib/send_email.py          (email allowlist)
 zerver/lib/upload/s3.py           (S3v4 + us-east-2)
 zerver/lib/users.py               (last,first name format)
 zerver/middleware.py               (BlockClientsMiddleware)
 zerver/tornado/sharding.py        (giant-realm prefix)
 zerver/views/auth.py              (block user agents, disable mobile/desktop)
 zerver/views/drc_redirect.py      (new — login redirect)
 zerver/views/drc_scripts.py       (new — admin reports)
 zproject/computed_settings.py     (middleware registration)
 zproject/default_settings.py      (BLOCKED_CLIENT_NAMES)
 zproject/dev_settings.py          (BLOCKED_USER_AGENTS, EDIRECT_REDIRECT)
 zproject/urls.py                  (login redirect + local login)
```
