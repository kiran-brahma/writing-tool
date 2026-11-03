# Issue tracker: GitHub (canonical) + local markdown mirror

Issues for this repo live as **GitHub issues** in `kiran-brahma/writing-tool` —
the canonical source of truth. A **local markdown mirror** is kept under
`.scratch/` for offline reading and grep. Use the `gh` CLI for all operations.

Specs are the one exception: they live in `docs/specs/` and are published to
GitHub. See [Specs](#specs) below.

## Canonical operations (GitHub)

- **Create**: `gh issue create --title "..." --body "..."` (heredoc for bodies)
- **Read**: `gh issue view <number> --comments`
- **List**: `gh issue list --state open --json number,title,body,labels,comments --jq '...'`
- **Comment**: `gh issue comment <number> --body "..."`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this inside the clone.

## Local markdown mirror

- **Path**: `.scratch/issues/<NNNN>-<slug>.md`, where `<NNNN>` is the zero-padded
  GitHub issue number (e.g. `.scratch/issues/0042-fix-parser.md`). The GitHub
  number is the filename key, so the mapping is unambiguous.
- **Contents**: title, GitHub number/URL, state, labels (as triage role strings),
  body, and a `## Comments` section mirroring the thread.
- **When**: refresh the mirror after every write above, and when a skill fetches
  a ticket for offline work.
- **Bulk refresh**: `gh issue list --state all --json number,title,body,labels,comments`
  and rewrite the mirror files.
- **Conflicts**: GitHub always wins. The mirror is derived, never edited directly —
  if you want to change something, change it on GitHub and re-mirror.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs
as feature requests; `/triage` reads this flag.)_

When `yes`, PRs use the same labels/states as issues via `gh pr view`/`pr list`/
`pr comment`/`pr edit`/`pr close`, keeping only `authorAssociation` of
`CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`. GitHub shares one number space
across issues and PRs: resolve a bare `#42` with `gh pr view 42`, falling back to
`gh issue view 42`.

## Specs

A spec is a **document**, not a ticket, so it inverts the usual rule: **the file is
canonical and the GitHub issue is the publication.**

- **Location**: `docs/specs/<slug>.md`, committed to git (unlike `.scratch/`,
  which is gitignored). This is what `to-spec` writes.
- **Publication**: each spec is also published as a single GitHub issue whose body
  is the complete spec, labelled `ready-for-agent`, so `triage`, `to-tickets`, and
  the GitHub UI can see it. Current mappings:

  | Spec file | Issue |
  | --- | --- |
  | `docs/specs/obelus-v1.md` | [#1](https://github.com/kiran-brahma/writing-tool/issues/1) |
  | `docs/specs/obelus-v1.1.md` | [#25](https://github.com/kiran-brahma/writing-tool/issues/25) |
  | `docs/specs/obelus-v1.2.md` | [#34](https://github.com/kiran-brahma/writing-tool/issues/34) |
  | `docs/specs/obelus-v1.3.md` | [#57](https://github.com/kiran-brahma/writing-tool/issues/57) |

- **Sync direction**: edit the file (git diffs it), then republish:
  `gh issue edit <n> --body-file docs/specs/<slug>.md`. Never edit the issue body
  as the primary copy — it will be overwritten on the next republish.
- **Invariant**: the issue body is byte-identical to the file. No front matter and
  no issue-only annotations in either.
- A spec is distinct from `DESIGN.md`, which stays the reasoning record. Where they
  disagree, `DESIGN.md` is the reasoning and the spec is the requirement.

## When a skill says "publish to the issue tracker"

Decide which artifact you have:

- **A spec** (`to-spec`) → write `docs/specs/<slug>.md`, publish it to a GitHub
  issue with `gh issue create --body-file ...`, apply `ready-for-agent`, and record
  the mapping in the table above.
- **Tickets** (`to-tickets`) or anything else → create GitHub issues, then mirror
  them to `.scratch/issues/`.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments` (live). Fall back to the mirror file when
offline. For a spec issue, prefer reading `docs/specs/<slug>.md` — it is canonical.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a GitHub issue labelled `wayfinder:map`;
**child** issues are tickets.

- **Map**: `gh issue create --label wayfinder:map` with the Notes /
  Decisions-so-far / Fog body.
- **Child ticket**: a GitHub sub-issue of the map (`gh api` on the sub-issues
  endpoint). Where unavailable, add the child to a task list in the map body and
  put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>`
  (`research`/`prototype`/`grilling`/`task`). Assign the driving dev once claimed.
- **Blocking**: GitHub native issue dependencies:
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`
  where `<blocker-db-id>` is `gh api repos/<owner>/<repo>/issues/<n> --jq .id`
  (the database id, not `#number`/`node_id`). Fallback: a `Blocked by: #<n>` line.
  Unblocked when every blocker is closed.
- **Frontier**: open children of the map, minus those with an open blocker
  (`issue_dependencies_summary.blocked_by > 0`) or an assignee; first in map order.
- **Claim**: `gh issue edit <n> --add-assignee @me`, then mirror.
- **Resolve**: comment the answer, close, append a context pointer to the map's
  Decisions-so-far, then mirror.
