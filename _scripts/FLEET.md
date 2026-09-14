# Local development fleet

`fleet` keeps the personal checkout, four implementation lanes, and integration in separate Git worktrees. Runtime queue state lives in Git's common directory (`.git/fleet`) and is never deployed.

## Roles

- **Personal** is the existing checkout. It belongs to Nate; agents never write there unless explicitly assigned.
- **Worker 1-4** each have one persistent worktree and one active claim. The chief of staff dispatches native Pi subagents into these exact paths.
- **Integration** owns `fleet/integrated`. `fleet integrate` starts a fresh one-shot Pi integration agent only when work is queued. There is no idle LLM process.

One writer owns each worktree. Claim non-overlapping paths before implementation:

```sh
fleet claim worker-1 "Tune benchmark graph" --paths pages/threadpilot.html assets/css/threadpilot.css
fleet claim worker-2 "Revise FAQ" --paths _includes/threadpilot_pricing_comparison.html
fleet status
```

The chief of staff supplies the claimed worktree as the subagent `cwd`. Native subagents own execution and monitoring; this tool owns only lane visibility, immutable handoff, preview, and serial integration.

## Submit and review

A submission commits only files already staged, or paths explicitly named with `--paths`. It never stages all changes.

```sh
git add pages/threadpilot.html
fleet submit -m "Revise introduction"

fleet submit -m "Try alternate pricing" --paths pages/threadpilot.html --signoff
```

Each submission pins `refs/fleet/submissions/<id>` to its exact SHA and builds a static snapshot preview. Continued lane edits cannot alter that preview or submitted bytes. A newer submission from the same lane supersedes its older pending submission.

Signoff submissions remain `held` until the exact SHA is approved:

```sh
fleet approve <submission-id> <full-submitted-sha>
```

The chief of staff must translate verbal approval into that exact command. Approval of an older SHA cannot approve a newer submission.

Submitting approved work, or approving held work, wakes a fresh one-shot integration agent. There is no polling or permanent AI process. To retry the wake manually:

```sh
fleet integrate
fleet integrate --all
```

The integration agent calls deterministic `fleet receive`. It merges in an isolated candidate worktree, validates, and only then fast-forwards `fleet/integrated`. A conflict becomes `rework`; a failed gate becomes `failed`. Either leaves accepted integration and author files unchanged. Semantic conflict resolution returns to the author. A transient validation failure can be requeued at its unchanged SHA with `fleet retry <submission-id>` after fixing the environment.

Reject without integration:

```sh
fleet reject <submission-id> "Reason and requested rework"
```

## Previews

Every lane has an isolated `_site` and localhost port:

```sh
fleet preview personal --open     # 8800
fleet preview integration --open  # 8801
fleet preview worker-1 --open     # 8802
fleet preview worker-2 --open     # 8803
fleet preview worker-3 --open     # 8804
fleet preview worker-4 --open     # 8805
fleet preview all
```

Submission snapshots use ports beginning at 8900. `fleet status` shows active URLs. Build and server logs are under `.git/fleet/logs`.

## Sync

Sync is always explicit and refuses a dirty worktree:

```sh
fleet sync
```

It only fast-forwards to `fleet/integrated`. A divergent lane must submit or rework its commits first; fleet does not reset, clean, stash, or rewrite user work.
