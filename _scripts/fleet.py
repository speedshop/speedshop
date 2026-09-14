#!/usr/bin/env python3
"""Local worktree fleet, immutable submission queue, and integration gate."""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import sys
import time
import uuid

LANES = ("personal", "integration", "worker-1", "worker-2", "worker-3", "worker-4")


def run(*args: str, cwd: Path | None = None, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=cwd, check=check, text=True, capture_output=capture)


def git(*args: str, cwd: Path | None = None, check: bool = True, capture: bool = True) -> str:
    result = run("git", *args, cwd=cwd, check=check, capture=capture)
    return result.stdout.strip() if result.stdout else ""


def repository_root() -> Path:
    return Path(git("rev-parse", "--show-toplevel")).resolve()


def common_git_dir() -> Path:
    return Path(git("rev-parse", "--path-format=absolute", "--git-common-dir")).resolve()


def state_root() -> Path:
    override = os.environ.get("FLEET_STATE_ROOT")
    return Path(override).resolve() if override else common_git_dir() / "fleet"


def config_path() -> Path:
    return state_root() / "config.json"


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


@contextlib.contextmanager
def locked(name: str):
    path = state_root() / "locks" / f"{name}.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        yield


def config() -> dict:
    value = load_json(config_path(), None)
    if value is None:
        raise SystemExit("Fleet is not bootstrapped. Run: fleet bootstrap")
    return value


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def heading(text: str) -> None:
    if sys.stdout.isatty() and shutil.which("gum"):
        subprocess.run(["gum", "style", "--bold", "--foreground", "14", text], check=False)
    else:
        print(text)


def lane_for_path(path: Path, cfg: dict) -> str:
    resolved = path.resolve()
    for lane, lane_path in cfg["worktrees"].items():
        if resolved == Path(lane_path).resolve():
            return lane
    raise SystemExit(f"Current directory is not a fleet lane: {resolved}")


def ensure_clean(path: Path) -> None:
    dirty = git("status", "--porcelain", "--untracked-files=all", cwd=path)
    if dirty:
        raise SystemExit(f"Workspace is dirty; commit, stash, or remove changes first:\n{dirty}")


def branch_exists(branch: str) -> bool:
    return run("git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}", check=False).returncode == 0


def link_dependencies(source: Path, destination: Path) -> None:
    for relative in (Path("node_modules"), Path("vendor/bundle")):
        source_path = source / relative
        destination_path = destination / relative
        if source_path.exists() and not destination_path.exists():
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            destination_path.symlink_to(source_path, target_is_directory=True)


def bootstrap(args) -> None:
    root = repository_root()
    if config_path().exists():
        raise SystemExit(f"Fleet is already bootstrapped at {state_root()}; existing state was preserved")
    tracked_changes = git("status", "--porcelain", "--untracked-files=no", cwd=root)
    if tracked_changes:
        raise SystemExit(f"Tracked or staged changes must be checkpointed before bootstrap:\n{tracked_changes}")
    state_root().mkdir(parents=True, exist_ok=True)
    base = git("rev-parse", args.base, cwd=root)
    worktree_root = Path(args.worktree_root).expanduser().resolve() if args.worktree_root else root.parent / ".worktrees" / "speedshop-fleet"
    worktree_root.mkdir(parents=True, exist_ok=True)
    integration_branch = "fleet/integrated"
    if not branch_exists(integration_branch):
        git("branch", integration_branch, base, cwd=root)
    worktrees = {"personal": str(root), "integration": str(worktree_root / "integration")}
    for index in range(1, 5):
        worktrees[f"worker-{index}"] = str(worktree_root / f"worker-{index}")
    branches = {"personal": git("branch", "--show-current", cwd=root), "integration": integration_branch}
    branches.update({f"worker-{index}": f"fleet/worker-{index}" for index in range(1, 5)})
    for lane in LANES[1:]:
        path = Path(worktrees[lane])
        branch = branches[lane]
        if path.exists() and not (path / ".git").exists():
            raise SystemExit(f"Refusing to replace existing non-worktree path: {path}")
        if not branch_exists(branch):
            git("branch", branch, base, cwd=root)
        if not path.exists():
            git("worktree", "add", str(path), branch, cwd=root, capture=False)
        link_dependencies(root, path)
    cfg = {
        "version": 1,
        "created_at": now(),
        "integration_branch": integration_branch,
        "validation_command": os.environ.get("FLEET_VALIDATE_COMMAND", "mise run test:quick"),
        "build_command": os.environ.get("FLEET_BUILD_COMMAND", "mise run build"),
        "worktrees": worktrees,
        "branches": branches,
        "live_ports": {lane: int(os.environ.get("FLEET_PORT_BASE", "8800")) + index for index, lane in enumerate(LANES)},
        "submission_port_start": int(os.environ.get("FLEET_SUBMISSION_PORT_BASE", "8900")),
        "auto_integrate": os.environ.get("FLEET_AUTO_INTEGRATE", "1") != "0",
    }
    save_json(config_path(), cfg)
    save_json(state_root() / "claims.json", {})
    save_json(state_root() / "submissions.json", [])
    exclude = common_git_dir() / "info" / "exclude"
    exclude.parent.mkdir(parents=True, exist_ok=True)
    exclusion = ".pi/todos/"
    current = exclude.read_text() if exclude.exists() else ""
    if exclusion not in current.splitlines():
        exclude.write_text(current + ("" if current.endswith("\n") or not current else "\n") + exclusion + "\n")
    print(f"Fleet bootstrapped at {state_root()}")
    show_status(None)


def claims() -> dict:
    return load_json(state_root() / "claims.json", {})


def claim(args) -> None:
    cfg = config()
    lane = args.lane or lane_for_path(repository_root(), cfg)
    if lane not in LANES or lane == "integration":
        raise SystemExit("Claims belong to personal or worker-1 through worker-4")
    with locked("claims"):
        values = claims()
        existing = values.get(lane)
        if existing and existing.get("status") == "active":
            raise SystemExit(f"{lane} already owns: {existing['task']}")
        claimed_paths = args.paths or []
        for other_lane, other in values.items():
            if other_lane == lane or other.get("status") != "active":
                continue
            overlap = sorted(set(claimed_paths) & set(other.get("paths", [])))
            if overlap:
                raise SystemExit(f"Path already claimed by {other_lane}: {', '.join(overlap)}")
        values[lane] = {"task": args.task, "paths": claimed_paths, "requires_signoff": args.signoff, "status": "active", "claimed_at": now()}
        save_json(state_root() / "claims.json", values)
    print(f"Claimed {lane}: {args.task}" + (" (signoff required)" if args.signoff else ""))


def release(args) -> None:
    cfg = config()
    lane = args.lane or lane_for_path(repository_root(), cfg)
    with locked("claims"):
        values = claims()
        if lane in values:
            values[lane]["status"] = "released"
            values[lane]["released_at"] = now()
            save_json(state_root() / "claims.json", values)
    print(f"Released {lane}")


def submissions() -> list[dict]:
    return load_json(state_root() / "submissions.json", [])


def update_submission(submission_id: str, update) -> dict:
    with locked("queue"):
        values = submissions()
        for item in values:
            if item["id"] == submission_id:
                update(item)
                save_json(state_root() / "submissions.json", values)
                return item
    raise SystemExit(f"Unknown submission: {submission_id}")


def shell(command: str, cwd: Path, log: Path | None = None) -> int:
    if log:
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("a") as output:
            output.write(f"$ {command}\n")
            return subprocess.run(command, cwd=cwd, shell=True, executable="/bin/bash", stdout=output, stderr=subprocess.STDOUT).returncode
    return subprocess.run(command, cwd=cwd, shell=True, executable="/bin/bash").returncode


def pid_alive(pid: int) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def port_available(port: int) -> bool:
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


def start_server(site: Path, port: int, key: str) -> str:
    servers_path = state_root() / "servers.json"
    with locked("servers"):
        servers = load_json(servers_path, {})
        existing = servers.get(key)
        if existing and pid_alive(existing["pid"]):
            return existing["url"]
        if not port_available(port):
            raise SystemExit(f"Port {port} is already in use; stop that service or set a different fleet port")
        log = state_root() / "logs" / f"preview-{key}.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("a") as output:
            process = subprocess.Popen(
                [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(site)],
                stdout=output,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        deadline = time.monotonic() + 3
        while port_available(port) and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.05)
        if process.poll() is not None or port_available(port):
            raise SystemExit(f"Preview server failed to start; see {log}")
        url = f"http://127.0.0.1:{port}/threadpilot.html"
        servers[key] = {"pid": process.pid, "port": port, "site": str(site), "url": url, "started_at": now()}
        save_json(servers_path, servers)
    return url


def build_live_preview(lane: str, open_browser: bool = False) -> str:
    cfg = config()
    path = Path(cfg["worktrees"][lane])
    command = cfg["build_command"]
    if shell(command, path, state_root() / "logs" / f"build-{lane}.log"):
        raise SystemExit(f"Build failed for {lane}; see {state_root() / 'logs' / f'build-{lane}.log'}")
    url = start_server(path / "_site", int(cfg["live_ports"][lane]), lane)
    print(f"{lane}: {url}")
    if open_browser:
        subprocess.run(["open", url], check=False)
    return url


def preview(args) -> None:
    config()
    lanes = list(LANES) if args.lane == "all" else [args.lane or lane_for_path(repository_root(), config())]
    for lane in lanes:
        build_live_preview(lane, args.open)


def immutable_preview(submission: dict) -> str:
    cfg = config()
    snapshot = state_root() / "previews" / submission["id"]
    checkout = state_root() / "preview-checkouts" / submission["id"]
    if not (snapshot / "threadpilot.html").exists():
        checkout.parent.mkdir(parents=True, exist_ok=True)
        if checkout.exists():
            raise SystemExit(f"Preserved preview checkout already exists and needs inspection: {checkout}")
        git("worktree", "add", "--detach", str(checkout), submission["head"], cwd=repository_root(), capture=False)
        link_dependencies(Path(cfg["worktrees"]["personal"]), checkout)
        command = cfg["build_command"]
        log = state_root() / "logs" / f"build-submission-{submission['id']}.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("a") as output:
            result = subprocess.run(command, cwd=checkout, shell=True, executable="/bin/bash", stdout=output, stderr=subprocess.STDOUT)
        if result.returncode == 0:
            shutil.copytree(checkout / "_site", snapshot, dirs_exist_ok=True)
        git("worktree", "remove", str(checkout), cwd=repository_root(), check=False)
        if result.returncode:
            raise SystemExit(f"Submission preview build failed; see {log}")
    return start_server(snapshot, submission["preview_port"], f"submission-{submission['id']}")


def submit(args) -> None:
    cfg = config()
    root = repository_root()
    lane = lane_for_path(root, cfg)
    if lane == "integration":
        raise SystemExit("The integration lane cannot submit work")
    if args.paths and git("diff", "--cached", "--name-only", cwd=root):
        raise SystemExit("Index already contains staged files; use staged mode or unstage them before --paths")
    if args.paths:
        git("add", "--", *args.paths, cwd=root)
    staged = git("diff", "--cached", "--name-only", cwd=root).splitlines()
    if staged:
        git("commit", "--no-gpg-sign", "-m", args.message, cwd=root, capture=False)
    head = git("rev-parse", "HEAD", cwd=root)
    integration_head = git("rev-parse", cfg["integration_branch"], cwd=root)
    if run("git", "merge-base", "--is-ancestor", head, integration_head, cwd=root, check=False).returncode == 0:
        raise SystemExit("HEAD is already integrated; stage or select new work before submitting")
    claim_value = claims().get(lane, {})
    requires_signoff = args.signoff or bool(claim_value.get("requires_signoff"))
    submission_id = f"{int(time.time())}-{uuid.uuid4().hex[:6]}"
    ref = f"refs/fleet/submissions/{submission_id}"
    git("update-ref", ref, head, cwd=root)
    with locked("queue"):
        values = submissions()
        for item in values:
            if item["lane"] == lane and item["status"] in ("preview-building", "held", "queued", "preparing", "validating"):
                item["status"] = "superseded"
                item["superseded_at"] = now()
                item["superseded_by"] = submission_id
        preview_port = int(cfg["submission_port_start"]) + len(values)
        item = {
            "id": submission_id,
            "lane": lane,
            "title": args.message,
            "base": integration_head,
            "head": head,
            "ref": ref,
            "paths": staged,
            "requires_signoff": requires_signoff,
            "status": "preview-building",
            "submitted_at": now(),
            "preview_port": preview_port,
        }
        values.append(item)
        save_json(state_root() / "submissions.json", values)
    try:
        url = immutable_preview(item)
    except SystemExit as error:
        def fail_preview(value):
            if value["status"] == "preview-building":
                value.update({"status": "preview-failed", "error": str(error)})
        update_submission(submission_id, fail_preview)
        raise

    ready_status = "held" if requires_signoff else "queued"
    def finish_preview(value):
        if value["status"] == "preview-building":
            value.update({"status": ready_status, "preview_url": url, "previewed_at": now()})
    completed = update_submission(submission_id, finish_preview)
    print(f"Submitted {submission_id} at immutable SHA {head}")
    print(f"Preview: {url}")
    if completed["status"] != ready_status:
        print(f"Submission became {completed['status']} while its preview built; it will not be integrated")
    elif requires_signoff:
        heading(f"SIGN THIS OFF PLEASE: fleet approve {submission_id} {head}")
    else:
        print("Ready for integration")
        wake_integrator()


def approve(args) -> None:
    def apply(item):
        if item["status"] != "held":
            raise SystemExit(f"Submission is {item['status']}, not held")
        if args.sha != item["head"]:
            raise SystemExit(f"Approval SHA mismatch. Previewed/submitted SHA is {item['head']}")
        item.update({"status": "queued", "approved_sha": args.sha, "approved_at": now()})
    item = update_submission(args.submission, apply)
    print(f"Approved exact SHA {item['head']}; queued {item['id']} for integration")
    wake_integrator()


def retry(args) -> None:
    def apply(item):
        if item["status"] != "failed":
            raise SystemExit(f"Only failed validation can be retried; submission is {item['status']}")
        item.update({"status": "queued", "retried_at": now()})
        item.pop("reason", None)
    item = update_submission(args.submission, apply)
    print(f"Requeued {item['id']} at unchanged SHA {item['head']}")
    wake_integrator()


def reject(args) -> None:
    def apply(item):
        if item["status"] in ("accepted", "rejected", "superseded"):
            raise SystemExit(f"Cannot reject submission in {item['status']} state")
        item.update({"status": "rejected", "reason": args.reason, "rejected_at": now()})
    item = update_submission(args.submission, apply)
    print(f"Rejected {item['id']}: {args.reason}")


def submission_by_id(values: list[dict], submission_id: str) -> dict | None:
    return next((item for item in values if item["id"] == submission_id), None)


def update_if_status(submission_id: str, expected: tuple[str, ...], fields: dict) -> bool:
    with locked("queue"):
        values = submissions()
        item = submission_by_id(values, submission_id)
        if not item or item["status"] not in expected:
            return False
        item.update(fields)
        save_json(state_root() / "submissions.json", values)
        return True


def refresh_integration_preview(submission_id: str) -> None:
    try:
        url = build_live_preview("integration")
        update_if_status(submission_id, ("accepted",), {"integration_preview_url": url, "preview_refreshed_at": now()})
    except SystemExit as error:
        update_if_status(submission_id, ("accepted",), {"preview_refresh_error": str(error)})
        print(f"Accepted, but integration preview refresh failed: {error}", file=sys.stderr)


def remove_candidate_after_acceptance(submission_id: str, candidate: Path, integration_path: Path) -> None:
    result = run("git", "worktree", "remove", str(candidate), cwd=integration_path, check=False)
    fields = {"candidate_removed_at": now()} if result.returncode == 0 else {
        "candidate_preserved": str(candidate),
        "candidate_cleanup_error": result.stderr.strip() or "candidate worktree is not clean",
    }
    update_if_status(submission_id, ("accepted",), fields)


def finalize_validation(submission_id: str) -> bool:
    cfg = config()
    integration_path = Path(cfg["worktrees"]["integration"])
    item = submission_by_id(submissions(), submission_id)
    if not item or item["status"] != "validating":
        return False
    result_path = Path(item["validation_result"])
    if pid_alive(item["validation_pid"]):
        print(f"Validation still running for {submission_id} (PID {item['validation_pid']})")
        return False
    if not result_path.exists():
        update_if_status(submission_id, ("validating",), {
            "status": "failed",
            "failed_at": now(),
            "reason": f"Interrupted validator left no result; candidate preserved at {item['candidate_path']}",
        })
        return False
    try:
        exit_code = int(result_path.read_text().strip())
    except ValueError:
        exit_code = -1
    if exit_code != 0:
        update_if_status(submission_id, ("validating",), {
            "status": "failed",
            "failed_at": now(),
            "reason": f"Validation failed with exit {exit_code}; candidate preserved at {item['candidate_path']}; see {item['validation_log']}",
        })
        return False

    with locked("queue"):
        values = submissions()
        current_item = submission_by_id(values, submission_id)
        if not current_item or current_item["status"] != "validating":
            return False
        ensure_clean(integration_path)
        current_head = git("rev-parse", cfg["integration_branch"], cwd=integration_path)
        if current_head != current_item["integration_parent"]:
            current_item.update({
                "status": "rework",
                "failed_at": now(),
                "reason": f"Integration advanced from {current_item['integration_parent']} to {current_head}; candidate preserved at {current_item['candidate_path']}",
            })
            save_json(state_root() / "submissions.json", values)
            return False
        promotion = run("git", "merge", "--ff-only", current_item["candidate_head"], cwd=integration_path, check=False, capture=False)
        if promotion.returncode:
            current_item.update({
                "status": "failed",
                "failed_at": now(),
                "reason": f"Promotion failed; candidate preserved at {current_item['candidate_path']}",
            })
            save_json(state_root() / "submissions.json", values)
            return False
        accepted = git("rev-parse", "HEAD", cwd=integration_path)
        current_item.update({"status": "accepted", "accepted_sha": accepted, "accepted_at": now()})
        save_json(state_root() / "submissions.json", values)

    refresh_integration_preview(submission_id)
    remove_candidate_after_acceptance(submission_id, Path(item["candidate_path"]), integration_path)
    return True


def start_validation(item: dict, candidate: Path, log: Path) -> bool:
    cfg = config()
    result_path = state_root() / "validation" / f"{item['id']}.result"
    temporary_result = result_path.with_suffix(".tmp")
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.unlink(missing_ok=True)
    temporary_result.unlink(missing_ok=True)
    script = (
        "set +e\n" + cfg["validation_command"] + "\ncode=$?\n" +
        f"printf '%s\\n' \"$code\" > {shlex.quote(str(temporary_result))}\n" +
        f"mv {shlex.quote(str(temporary_result))} {shlex.quote(str(result_path))}\nexit \"$code\""
    )
    log.parent.mkdir(parents=True, exist_ok=True)
    with locked("queue"):
        values = submissions()
        current_item = submission_by_id(values, item["id"])
        if not current_item or current_item["status"] != "preparing":
            return False
        with log.open("a") as output:
            output.write(f"$ {cfg['validation_command']}\n")
            process = subprocess.Popen(["/bin/bash", "-c", script], cwd=candidate, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        current_item.update({
            "status": "validating",
            "validation_pid": process.pid,
            "validation_result": str(result_path),
            "validation_log": str(log),
            "validation_started_at": now(),
        })
        save_json(state_root() / "submissions.json", values)
    process.wait()
    return finalize_validation(item["id"])


def receive_one(item: dict) -> bool:
    cfg = config()
    integration_path = Path(cfg["worktrees"]["integration"])
    ensure_clean(integration_path)
    current = git("rev-parse", cfg["integration_branch"], cwd=integration_path)
    if not update_if_status(item["id"], ("queued",), {"status": "preparing", "integration_parent": current, "processing_started_at": now()}):
        return False

    if run("git", "merge-base", "--is-ancestor", item["head"], current, cwd=integration_path, check=False).returncode == 0:
        with locked("queue"):
            values = submissions()
            current_item = submission_by_id(values, item["id"])
            if not current_item or current_item["status"] != "preparing":
                return False
            current_item.update({"status": "accepted", "accepted_sha": current, "accepted_at": now(), "note": "already contained in integration head"})
            save_json(state_root() / "submissions.json", values)
        refresh_integration_preview(item["id"])
        return True

    candidate = state_root() / "candidates" / item["id"]
    log = state_root() / "logs" / f"integrate-{item['id']}.log"
    latest = submission_by_id(submissions(), item["id"])
    reusable = candidate.exists() and latest and latest.get("candidate_head") and latest.get("integration_parent") == current
    if reusable:
        return start_validation(latest, candidate, log)
    if candidate.exists():
        update_if_status(item["id"], ("preparing",), {
            "status": "failed",
            "failed_at": now(),
            "reason": f"Existing candidate preserved for inspection: {candidate}",
        })
        return False

    candidate.parent.mkdir(parents=True, exist_ok=True)
    git("worktree", "add", "--detach", str(candidate), current, cwd=integration_path, capture=False)
    link_dependencies(Path(cfg["worktrees"]["personal"]), candidate)
    merge = run("git", "merge", "--no-ff", "--no-commit", item["head"], cwd=candidate, check=False)
    if merge.returncode:
        conflicts = git("diff", "--name-only", "--diff-filter=U", cwd=candidate, check=False)
        reason = f"Conflict against integration {current}; candidate preserved at {candidate}: {conflicts or merge.stderr.strip()}"
        update_if_status(item["id"], ("preparing",), {"status": "rework", "reason": reason, "failed_at": now(), "candidate_path": str(candidate)})
        return False
    git("commit", "--no-gpg-sign", "-m", f"Integrate {item['title']} ({item['id']})", cwd=candidate, capture=False)
    candidate_head = git("rev-parse", "HEAD", cwd=candidate)
    if not update_if_status(item["id"], ("preparing",), {"candidate_path": str(candidate), "candidate_head": candidate_head}):
        return False
    prepared = submission_by_id(submissions(), item["id"])
    return start_validation(prepared, candidate, log) if prepared else False


def reconcile_interrupted() -> None:
    for item in submissions():
        if item["status"] == "validating":
            if pid_alive(item.get("validation_pid", 0)):
                print(f"Waiting for orphan validator {item['validation_pid']} for {item['id']}")
                while pid_alive(item["validation_pid"]):
                    time.sleep(0.1)
            print(f"Reconciling completed orphan validator for {item['id']}")
            finalize_validation(item["id"])
        elif item["status"] == "preparing":
            candidate = item.get("candidate_path") or str(state_root() / "candidates" / item["id"])
            update_if_status(item["id"], ("preparing",), {
                "status": "failed",
                "failed_at": now(),
                "reason": f"Interrupted candidate preparation preserved at {candidate}",
            })


def receive(args) -> None:
    config()
    with locked("integration"):
        reconcile_interrupted()
        queue = [item for item in submissions() if item["status"] == "queued"]
        if args.submission:
            queue = [item for item in queue if item["id"] == args.submission]
        if not queue:
            print("No approved queued submissions")
            return
        for item in queue:
            print(f"Receiving {item['id']}: {item['title']}")
            accepted = receive_one(item)
            print("Accepted" if accepted else "Not accepted; run fleet status for details")
            if not args.all:
                break


def queued_submission_ids() -> list[str]:
    return [item["id"] for item in submissions() if item["status"] == "queued"]


def spawn_integrator_locked(cfg: dict, initial_ids: list[str]) -> dict:
    log = state_root() / "logs" / f"integrator-wake-{int(time.time())}-{uuid.uuid4().hex[:4]}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    configured = cfg.get("integrator_command")
    command = configured or [str(Path(cfg["worktrees"]["integration"]) / "_scripts" / "fleet"), "integrate"]
    with log.open("a") as output:
        process = subprocess.Popen(command, cwd=cfg["worktrees"]["integration"], stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    marker = {"pid": process.pid, "started_at": now(), "log": str(log), "initial_submission_ids": initial_ids}
    save_json(state_root() / "integrator.json", marker)
    return marker


def wake_integrator() -> None:
    cfg = config()
    if not cfg.get("auto_integrate", True):
        print("Automatic integration disabled; run: fleet integrate")
        return
    marker_path = state_root() / "integrator.json"
    with locked("integrator-start"):
        marker = load_json(marker_path, {})
        if marker.get("pid") and pid_alive(marker["pid"]):
            print(f"Integration agent already running (PID {marker['pid']})")
            return
        pending = queued_submission_ids()
        if not pending:
            return
        marker = spawn_integrator_locked(cfg, pending)
        print(f"Woke integration agent (PID {marker['pid']}); log: {marker['log']}")


def finish_integrator(initial_ids: list[str]) -> None:
    cfg = config()
    marker_path = state_root() / "integrator.json"
    with locked("integrator-start"):
        marker = load_json(marker_path, {})
        if marker.get("pid") == os.getpid():
            save_json(marker_path, {"finished_at": now(), "last_pid": os.getpid(), "initial_submission_ids": initial_ids})
        late_ids = [submission_id for submission_id in queued_submission_ids() if submission_id not in initial_ids]
        if late_ids and cfg.get("auto_integrate", True):
            successor = spawn_integrator_locked(cfg, late_ids)
            print(f"Handed {len(late_ids)} late submission(s) to integration agent PID {successor['pid']}")


def pending(_args) -> None:
    cfg = config()
    values = [item for item in submissions() if item["status"] == "queued"]
    if not values:
        print("No approved queued submissions")
        return
    for item in values:
        print(f"SUBMISSION {item['id']}")
        print(f"  title: {item['title']}")
        print(f"  submitted SHA: {item['head']}")
        print(f"  pinned ref: {item['ref']}")
        print(f"  current integration: {git('rev-parse', cfg['integration_branch'])}")
        print(f"  preview: {item.get('preview_url', 'missing')}")
        print(f"  review: git diff {cfg['integration_branch']}...{item['head']} --")
        print(f"  accept after review: fleet receive {item['id']}")
        print(f"  reject: fleet reject {item['id']} \"specific reason\"")


def integrate(_args) -> None:
    cfg = config()
    integration = Path(cfg["worktrees"]["integration"])
    marker = load_json(state_root() / "integrator.json", {})
    initial_ids = marker.get("initial_submission_ids", []) if marker.get("pid") == os.getpid() else queued_submission_ids()
    prompt = (
        "You are the dedicated Speedshop integration reviewer. Read _scripts/FLEET.md and run `fleet pending`. "
        "For every submission listed in that initial packet, verify its pinned ref resolves to the stated exact SHA, "
        "inspect the complete diff against the current fleet/integrated branch, and use the immutable preview when UI changed. "
        "Decide independently: run `fleet receive <id>` only when the exact diff is correct, in scope, and safe; otherwise run "
        "`fleet reject <id> \"specific rework reason\"`. Never bulk-receive, never edit product files, and never resolve semantic "
        "conflicts by guessing. Report each reviewed SHA and decision."
    )
    log = state_root() / "logs" / f"agent-integrator-{int(time.time())}-{uuid.uuid4().hex[:4]}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    command = ["pi", "--name", "fleet-integrator", "--tools", "read,bash", "-p", prompt]
    try:
        with log.open("w") as output:
            result = subprocess.run(command, cwd=integration, stdout=output, stderr=subprocess.STDOUT)
        print(log.read_text())
        if result.returncode:
            raise SystemExit(f"Integration agent failed ({result.returncode}); log: {log}")
    finally:
        finish_integrator(initial_ids)


def sync(args) -> None:
    cfg = config()
    root = repository_root()
    lane = lane_for_path(root, cfg)
    if lane == "integration":
        raise SystemExit("Integration lane is already the accepted source")
    ensure_clean(root)
    result = run("git", "merge", "--ff-only", cfg["integration_branch"], cwd=root, check=False, capture=False)
    if result.returncode:
        raise SystemExit("Cannot fast-forward safely. Submit/rework divergent commits before syncing.")
    print(f"Synced {lane} to {git('rev-parse', '--short', 'HEAD', cwd=root)}")


def show_status(_args) -> None:
    cfg = config()
    heading("LANES")
    current_claims = claims()
    servers = load_json(state_root() / "servers.json", {})
    for lane in LANES:
        path = Path(cfg["worktrees"][lane])
        head = git("rev-parse", "--short", "HEAD", cwd=path) if path.exists() else "missing"
        dirty = bool(git("status", "--porcelain", cwd=path)) if path.exists() else False
        claim_value = current_claims.get(lane, {})
        preview_value = servers.get(lane, {})
        planned_url = f"http://127.0.0.1:{cfg['live_ports'][lane]}/threadpilot.html"
        preview_state = preview_value.get("url", planned_url) if preview_value and pid_alive(preview_value.get("pid", 0)) else f"stopped: {planned_url}"
        claim_label = claim_value.get("task", "unclaimed") if claim_value.get("status") == "active" else "unclaimed"
        print(f"  {lane:11} {head:8} {'DIRTY' if dirty else 'clean':5} | {claim_label} | {preview_state}")
    heading("SUBMISSIONS")
    values = submissions()
    if not values:
        print("  none")
    for item in values:
        print(f"  {item['id']} {item['status']:12} {item['lane']:9} {item['head'][:8]} {item['title']}")
        if item.get("preview_url"):
            print(f"    preview: {item['preview_url']}")
        if item.get("reason"):
            print(f"    rework: {item['reason']}")


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(prog="fleet", description=__doc__)
    commands = value.add_subparsers(dest="command", required=True)
    bootstrap_parser = commands.add_parser("bootstrap")
    bootstrap_parser.add_argument("--base", default="HEAD")
    bootstrap_parser.add_argument("--worktree-root")
    bootstrap_parser.set_defaults(func=bootstrap)
    status_parser = commands.add_parser("status")
    status_parser.set_defaults(func=show_status)
    claim_parser = commands.add_parser("claim")
    claim_parser.add_argument("lane", nargs="?", choices=["personal", "worker-1", "worker-2", "worker-3", "worker-4"])
    claim_parser.add_argument("task")
    claim_parser.add_argument("--paths", nargs="*")
    claim_parser.add_argument("--signoff", action="store_true")
    claim_parser.set_defaults(func=claim)
    release_parser = commands.add_parser("release")
    release_parser.add_argument("lane", nargs="?", choices=["personal", "worker-1", "worker-2", "worker-3", "worker-4"])
    release_parser.set_defaults(func=release)
    submit_parser = commands.add_parser("submit")
    submit_parser.add_argument("-m", "--message", required=True)
    submit_parser.add_argument("--paths", nargs="+")
    submit_parser.add_argument("--signoff", action="store_true")
    submit_parser.set_defaults(func=submit)
    approve_parser = commands.add_parser("approve")
    approve_parser.add_argument("submission")
    approve_parser.add_argument("sha")
    approve_parser.set_defaults(func=approve)
    retry_parser = commands.add_parser("retry")
    retry_parser.add_argument("submission")
    retry_parser.set_defaults(func=retry)
    reject_parser = commands.add_parser("reject")
    reject_parser.add_argument("submission")
    reject_parser.add_argument("reason")
    reject_parser.set_defaults(func=reject)
    pending_parser = commands.add_parser("pending")
    pending_parser.set_defaults(func=pending)
    receive_parser = commands.add_parser("receive")
    receive_parser.add_argument("submission", nargs="?")
    receive_parser.add_argument("--all", action="store_true")
    receive_parser.set_defaults(func=receive)
    integrate_parser = commands.add_parser("integrate")
    integrate_parser.set_defaults(func=integrate)
    sync_parser = commands.add_parser("sync")
    sync_parser.set_defaults(func=sync)
    preview_parser = commands.add_parser("preview")
    preview_parser.add_argument("lane", nargs="?", choices=[*LANES, "all"])
    preview_parser.add_argument("--open", action="store_true")
    preview_parser.set_defaults(func=preview)
    return value


def main() -> None:
    args = parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
