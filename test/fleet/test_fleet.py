#!/usr/bin/env python3
"""Integration tests for the local fleet queue in disposable Git repositories."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2]


def command(*args, cwd, env=None, check=True):
    return subprocess.run(args, cwd=cwd, env=env, check=check, text=True, capture_output=True)


def free_port_block(size=8):
    for base in range(19000, 29000, 17):
        sockets = []
        try:
            for port in range(base, base + size):
                sock = socket.socket()
                sock.bind(("127.0.0.1", port))
                sockets.append(sock)
            return base
        except OSError:
            sock.close()
        finally:
            for sock in sockets:
                sock.close()
    raise RuntimeError("No free port block")


class FleetTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "repo"
        self.root.mkdir()
        command("git", "init", "-b", "main", cwd=self.root)
        command("git", "config", "user.name", "Fleet Test", cwd=self.root)
        command("git", "config", "user.email", "fleet@example.test", cwd=self.root)
        (self.root / "_scripts").mkdir()
        shutil.copy2(SOURCE / "_scripts/fleet.py", self.root / "_scripts/fleet.py")
        shutil.copy2(SOURCE / "_scripts/fleet", self.root / "_scripts/fleet")
        (self.root / "index.html").write_text("baseline\n")
        command("git", "add", "_scripts/fleet.py", "_scripts/fleet", "index.html", cwd=self.root)
        command("git", "commit", "--no-gpg-sign", "-m", "baseline", cwd=self.root)
        base = free_port_block()
        self.env = os.environ | {
            "FLEET_PORT_BASE": str(base),
            "FLEET_SUBMISSION_PORT_BASE": str(base + 7),
            "FLEET_BUILD_COMMAND": "mkdir -p _site && cp index.html _site/threadpilot.html",
            "FLEET_VALIDATE_COMMAND": "true",
            "FLEET_AUTO_INTEGRATE": "0",
        }
        self.worktrees = Path(self.temporary.name) / "worktrees"
        self.fleet("bootstrap", "--worktree-root", str(self.worktrees))

    def tearDown(self):
        servers_path = self.root / ".git/fleet/servers.json"
        if servers_path.exists():
            for server in json.loads(servers_path.read_text()).values():
                try:
                    os.killpg(server["pid"], signal.SIGTERM)
                except ProcessLookupError:
                    pass
        self.temporary.cleanup()

    def fleet(self, *args, cwd=None, check=True):
        return command(str(self.root / "_scripts/fleet"), *args, cwd=cwd or self.root, env=self.env, check=check)

    def state(self):
        return json.loads((self.root / ".git/fleet/submissions.json").read_text())

    def configure_validation(self, value):
        path = self.root / ".git/fleet/config.json"
        config = json.loads(path.read_text())
        config["validation_command"] = value
        path.write_text(json.dumps(config))

    def commit_change(self, cwd, text, message):
        (cwd / "index.html").write_text(text)
        command("git", "add", "index.html", cwd=cwd)
        command("git", "commit", "--no-gpg-sign", "-m", message, cwd=cwd)

    def test_signoff_is_exact_and_preview_is_immutable(self):
        self.commit_change(self.root, "submitted\n", "candidate")
        submitted = self.fleet("submit", "-m", "held candidate", "--signoff").stdout
        item = self.state()[-1]
        self.assertEqual("held", item["status"])
        integration_before = command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout.strip()
        self.fleet("receive")
        self.assertEqual(integration_before, command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout.strip())
        wrong = self.fleet("approve", item["id"], "0" * 40, check=False)
        self.assertNotEqual(0, wrong.returncode)
        self.assertIn(item["head"], wrong.stderr)
        (self.root / "index.html").write_text("continued editing\n")
        preview = subprocess.check_output(["curl", "-fsS", item["preview_url"]], text=True)
        self.assertEqual("submitted\n", preview)
        self.fleet("approve", item["id"], item["head"])
        self.fleet("receive", item["id"])
        accepted = self.state()[-1]
        self.assertEqual("accepted", accepted["status"])
        self.assertEqual(item["head"], accepted["approved_sha"])
        self.assertEqual("continued editing\n", (self.root / "index.html").read_text())
        self.assertIn("SIGN THIS OFF PLEASE", submitted)

    def test_new_submission_supersedes_old_approval_and_subsequent_accepts(self):
        self.commit_change(self.root, "first\n", "first")
        self.fleet("submit", "-m", "first", "--signoff")
        first = self.state()[-1]
        self.fleet("approve", first["id"], first["head"])
        self.commit_change(self.root, "second\n", "second")
        self.fleet("submit", "-m", "second", "--signoff")
        first, second = self.state()[-2:]
        self.assertEqual("superseded", first["status"])
        self.assertEqual("held", second["status"])
        self.fleet("receive", "--all")
        self.assertEqual("held", self.state()[-1]["status"])
        self.fleet("approve", second["id"], second["head"])
        self.fleet("receive", second["id"])
        self.assertEqual("accepted", self.state()[-1]["status"])
        self.fleet("sync")
        self.assertEqual(command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout, command("git", "rev-parse", "HEAD", cwd=self.root).stdout)

    def test_claims_prevent_overlapping_writers_and_release_cleanly(self):
        self.fleet("claim", "worker-1", "Own index", "--paths", "index.html")
        overlap = self.fleet("claim", "worker-2", "Also own index", "--paths", "index.html", check=False)
        self.assertNotEqual(0, overlap.returncode)
        self.assertIn("worker-1", overlap.stderr)
        self.fleet("release", "worker-1")
        self.fleet("claim", "worker-2", "Own index now", "--paths", "index.html")
        status = self.fleet("status").stdout
        self.assertIn("worker-1", status)
        self.assertIn("unclaimed", status)

    def test_dirty_sync_refuses_without_touching_dirt(self):
        (self.root / "notes.txt").write_text("mine\n")
        result = self.fleet("sync", check=False)
        self.assertNotEqual(0, result.returncode)
        self.assertEqual("mine\n", (self.root / "notes.txt").read_text())

    def test_conflict_returns_rework_and_preserves_accepted_head(self):
        worker = self.worktrees / "worker-1"
        self.commit_change(worker, "worker\n", "worker edit")
        self.fleet("submit", "-m", "worker edit", cwd=worker)
        worker_item = self.state()[-1]
        self.commit_change(self.root, "personal\n", "personal edit")
        self.fleet("submit", "-m", "personal edit")
        personal_item = self.state()[-1]
        self.fleet("receive", personal_item["id"])
        accepted_head = command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout.strip()
        self.fleet("receive", worker_item["id"], check=False)
        items = {item["id"]: item for item in self.state()}
        self.assertEqual("rework", items[worker_item["id"]]["status"])
        self.assertEqual(accepted_head, command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout.strip())
        self.assertEqual("worker\n", (worker / "index.html").read_text())

    def test_validation_failure_can_restart_at_same_sha(self):
        self.commit_change(self.root, "candidate\n", "candidate")
        self.fleet("submit", "-m", "candidate")
        item = self.state()[-1]
        before = command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout.strip()
        self.configure_validation("false")
        self.fleet("receive", item["id"], check=False)
        self.assertEqual("failed", self.state()[-1]["status"])
        self.assertEqual(before, command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout.strip())
        self.configure_validation("true")
        self.fleet("retry", item["id"])
        self.fleet("receive", item["id"])
        result = self.state()[-1]
        self.assertEqual("accepted", result["status"])
        self.assertEqual(item["head"], result["head"])

    def test_live_previews_have_isolated_urls_and_build_outputs(self):
        worker = self.worktrees / "worker-1"
        (worker / "index.html").write_text("worker preview\n")
        personal = self.fleet("preview", "personal").stdout.strip().split()[-1]
        worker_url = self.fleet("preview", "worker-1").stdout.strip().split()[-1]
        self.assertNotEqual(personal, worker_url)
        self.assertEqual("baseline\n", subprocess.check_output(["curl", "-fsS", personal], text=True))
        self.assertEqual("worker preview\n", subprocess.check_output(["curl", "-fsS", worker_url], text=True))
        self.assertNotEqual((self.root / "_site").resolve(), (worker / "_site").resolve())

    def test_concurrent_submissions_are_serialized_and_have_isolated_urls(self):
        workers = [self.worktrees / "worker-1", self.worktrees / "worker-2"]
        for index, worker in enumerate(workers, 1):
            path = worker / f"worker-{index}.txt"
            path.write_text(str(index))
            command("git", "add", path.name, cwd=worker)
            command("git", "commit", "--no-gpg-sign", "-m", f"worker {index}", cwd=worker)
        processes = [subprocess.Popen([str(self.root / "_scripts/fleet"), "submit", "-m", f"worker {index}"], cwd=worker, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for index, worker in enumerate(workers, 1)]
        results = [process.communicate(timeout=30) + (process.returncode,) for process in processes]
        self.assertEqual([0, 0], [result[2] for result in results], results)
        items = self.state()
        self.assertEqual(2, len(items))
        self.assertEqual(2, len({item["id"] for item in items}))
        self.assertEqual(2, len({item["preview_url"] for item in items}))
        for item in items:
            self.assertIn(item["head"], command("git", "show-ref", item["ref"], cwd=self.root).stdout)


if __name__ == "__main__":
    unittest.main()
