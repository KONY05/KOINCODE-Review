# Feature Spec: Repository Page Integration

## Overview

The repository page lists all GitHub repositories available via the user's GitHub App installation. Users can browse, search, and connect repositories to enable AI code reviews on their PRs.

## Design Reference

**Source:** Claude Design project `23cd1c6c-f7d9-4597-884f-ac7f5e9dd2d8` (Koincode Review App Design), file `KoinCode Review.dc.html`, `isRepo` section.

## Current State

- Page exists at `app/(dashboard)/repos/page.tsx` — renders a static skeleton layout with placeholder `RepositoryItem` components.
- `RepositoryItem` at `components/Repository/RepositoryItem.tsx` — renders only Skeleton placeholders, no real data.
- TODOs already in the code for filter tabs and search.

---

## Requirements

### 1. Repository Fetching (GitHub API)

Fetch repositories from the user's GitHub App installation via the GitHub API (`GET /user/installations/:installation_id/repositories`).

- **Pagination:** Use cursor-based pagination from the GitHub API. Do **not** fetch all repos upfront.
- **Data per repo from API:**
  - `name` (display name, e.g. `koincode-cli`)
  - `full_name` (owner/name)
  - `description`
  - `language` (primary language)
  - `stargazers_count`
  - `updated_at`
  - `html_url` (link to GitHub)
  - `private` (visibility)

### 2. Infinite Scroll

- Load an initial page of repositories (e.g. 20 per page).
- As the user scrolls near the bottom, fetch the next page automatically.
- Show a loading indicator (skeleton cards) while the next page loads.
- Stop fetching when all repositories have been loaded.

### 3. Tab Filtering: "All" / "Connected"

Two tabs **inline with the page header**, aligned to the far right of the same row:

```
Repositories                                        [All] [Connected]
Manage and view all your GitHub repositories
```

| Tab | Description |
|-----|-------------|
| **All** | All repos from the user's GitHub installation (default) |
| **Connected** | Only repos the user has connected (stored in `repos` DB table) |

- Default active tab: **All**.
- Switching tabs resets the list and search query.
- "Connected" tab queries the database (`repos` table), not the GitHub API.
- Tab styling: pill-style toggles. Active tab uses accent color (`#f5a623`) text/border, inactive tab uses muted text. Compact sizing to sit comfortably next to the heading.

### 4. Debounced Search

- A search input component (`RepoSearchInput`) that lives in its own Client Component to avoid turning the page into a client component.
- Filters repositories by name (case-insensitive substring match).
- **Debounce:** 300ms delay after the user stops typing before triggering a fetch/filter.
- On the "All" tab: filter client-side against already-loaded repos, or re-fetch from GitHub API with a query param if supported.
- On the "Connected" tab: filter against database query.
- Placeholder text: `"Search repositories..."` (matches design).
- **No URL sync** — search state lives in component state only, not in query params.

### 5. Repository Card (from design)

Each repository card displays:

```
+-------------------------------------------------------------+
| repo-name   [lang-badge]   [connected-badge]                |
| Description text...                                    [->] [Connect/Disconnect] |
| * stars   updated X ago                                     |
+-------------------------------------------------------------+
```

- **Repo name:** Bold, 17px.
- **Language badge:** Pill with colored dot matching the language (e.g. Rust = `#dea584`, TypeScript = `#3178c6`, Python = `#3572A5`). Font: JetBrains Mono, 11px.
- **Connected badge:** Green pill (`#3fb950`) with text "connected". Only shown when repo is connected.
- **Description:** Secondary text, 13.5px, max-width ~620px.
- **Stars:** Star icon (filled `#f5a623`) + count. Font: JetBrains Mono, 12.5px.
- **Updated:** Relative time (e.g. "2 hours ago", "yesterday"). Font: JetBrains Mono, 12.5px.
- **External link button:** 38x38px outlined icon button linking to `html_url`.
- **Connect/Disconnect button:**
  - **Connect:** Solid cream/gold background (`#f3dcc4`), dark text (`#11141a`). Label: "Connect".
  - **Disconnect:** Transparent with outlined border, muted text. Label: "Disconnect".
- **Hover:** Card border transitions to accent color (`rgba(245,166,35,0.4)`), background shifts to `#11161e`.

### 6. Connect / Disconnect Action

- **Connect:** Inserts a row into the `repos` table linking the GitHub repo to the user. Triggers the initial lightweight vector index (tree structure, README, config, top-level source) via Inngest.
- **Disconnect:** Removes the row from the `repos` table. Optionally cleans up vector index data.
- Optimistic UI: toggle the button state immediately, revert on error.
- Should use a Server Action or API route.

---

## Component Breakdown

| Component | Type | Location | Responsibility |
|-----------|------|----------|----------------|
| `ReposPage` | Server Component | `app/(dashboard)/repos/page.tsx` | Initial data fetch (first page + connected repo IDs), renders layout |
| `RepoList` | Client Component | `components/Repository/RepoList.tsx` | Manages infinite scroll, tab state, renders cards |
| `RepoSearchInput` | Client Component | `components/Repository/RepoSearchInput.tsx` | Debounced search input, passes query up via callback |
| `RepoTabs` | Client Component | `components/Repository/RepoTabs.tsx` | "All" / "Connected" tab toggle |
| `RepositoryItem` | Client Component | `components/Repository/RepositoryItem.tsx` | Individual repo card with connect/disconnect action |
| `RepositoryItemSkeleton` | Server/Client | `components/Repository/RepositoryItemSkeleton.tsx` | Loading placeholder (current skeleton code) |

## API / Server Actions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/repos` | GET | Fetch paginated repos from GitHub API for the authenticated user. Query params: `page`, `per_page`, `q` (search). Returns repos + connected status. |
| `/api/repos/connect` | POST | Connect a repo. Body: `{ githubId, name, fullName, ... }`. Inserts into `repos` table, enqueues Inngest indexing event. |
| `/api/repos/disconnect` | POST | Disconnect a repo. Body: `{ repoId }`. Deletes from `repos` table. |
| `/api/repos/connected` | GET | Fetch connected repos from DB. Query params: `page`, `per_page`, `q`. |

---

## Design Tokens (from design file)

| Token | Value | Usage |
|-------|-------|-------|
| Card background | `#0f131a` | Repository card bg |
| Card border | `rgba(255,255,255,0.07)` | Default border |
| Card hover border | `rgba(245,166,35,0.4)` | Hover state |
| Card hover bg | `#11161e` | Hover state |
| Card radius | `16px` | Border radius |
| Card padding | `20px 22px` | Internal padding |
| Accent color | `#f5a623` | Active states, star icon |
| Connect button bg | `#f3dcc4` | Connect CTA |
| Connect button text | `#11141a` | Connect CTA text |
| Connected badge | `#3fb950` border + text, `rgba(63,185,80,0.1)` bg | Status pill |
| Text primary | `#e6e8eb` | Repo name |
| Text secondary | `#878e98` | Description |
| Text dim | `#7e858f` | Stars, updated |
| Mono font | `JetBrains Mono` | Badges, stats |

## Language Colors

| Language | Color |
|----------|-------|
| Rust | `#dea584` |
| TypeScript | `#3178c6` |
| JavaScript | `#f1e05a` |
| Python | `#3572A5` |
| Go | `#00ADD8` |
| Java | `#b07219` |
| Ruby | `#701516` |
| C++ | `#f34b7d` |
| Swift | `#F05138` |
| Kotlin | `#A97BFF` |

---

## Edge Cases

- **No repos:** Show empty state — "No repositories found. Make sure your GitHub account has accessible repositories."
- **No connected repos:** Show empty state on Connected tab — "No connected repositories yet. Connect a repo to start receiving AI reviews."
- **Search no results:** Show "No repositories matching '[query]'."
- **GitHub API rate limit:** Show a toast/banner with retry info.
- **Installation not found:** Redirect to GitHub App installation flow.
