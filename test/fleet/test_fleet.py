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
import time
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
        shutil.copy2(SOURCE / "_scripts/FLEET.md", self.root / "_scripts/FLEET.md")
        (self.root / "index.html").write_text("baseline\n")
        (self.root / ".gitignore").write_text("_site/\n")
        command("git", "add", ".gitignore", "_scripts/FLEET.md", "_scripts/fleet.py", "_scripts/fleet", "index.html", cwd=self.root)
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
        integrator_path = self.root / ".git/fleet/integrator.json"
        if integrator_path.exists():
            integrator = json.loads(integrator_path.read_text())
            integrator_pid = integrator.get("pid", integrator.get("last_pid", 0))
            if integrator_pid > 0:
                try:
                    os.killpg(integrator_pid, signal.SIGTERM)
                except (ProcessLookupError, PermissionError):
                    pass
        self.temporary.cleanup()

    def fleet(self, *args, cwd=None, check=True):
        return command(str(self.root / "_scripts/fleet"), *args, cwd=cwd or self.root, env=self.env, check=check)

    def state(self):
        return json.loads((self.root / ".git/fleet/submissions.json").read_text())

    def configure(self, **updates):
        path = self.root / ".git/fleet/config.json"
        config = json.loads(path.read_text())
        config.update(updates)
        path.write_text(json.dumps(config))

    def configure_validation(self, value):
        self.configure(validation_command=value)

    def wait_for(self, predicate, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.05)
        self.fail("Timed out waiting for fleet state")

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

    def test_staged_mode_submits_index_bytes_and_preserves_unstaged_edit(self):
        path = self.root / "index.html"
        path.write_text("staged bytes\n")
        command("git", "add", "index.html", cwd=self.root)
        path.write_text("unfinished bytes\n")
        self.fleet("submit", "-m", "partial staging", "--signoff")
        item = self.state()[-1]
        submitted = command("git", "show", f"{item['head']}:index.html", cwd=self.root).stdout
        self.assertEqual("staged bytes\n", submitted)
        self.assertEqual("unfinished bytes\n", path.read_text())
        self.assertIn("unfinished bytes", command("git", "diff", cwd=self.root).stdout)

    def test_preview_must_finish_before_submission_is_receivable(self):
        self.commit_change(self.root, "candidate\n", "candidate")
        started = Path(self.temporary.name) / "preview-started"
        unblock = Path(self.temporary.name) / "preview-unblock"
        self.configure(build_command=f"touch {started}; while [ ! -f {unblock} ]; do sleep .05; done; exit 1")
        process = subprocess.Popen([str(self.root / "_scripts/fleet"), "submit", "-m", "candidate"], cwd=self.root, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.wait_for(started.exists)
            self.assertEqual("preview-building", self.state()[-1]["status"])
            before = command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout
            self.fleet("receive")
            self.assertEqual(before, command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout)
            unblock.touch()
            process.communicate(timeout=15)
            self.assertEqual("preview-failed", self.state()[-1]["status"])
        finally:
            unblock.touch()
            if process.poll() is None:
                process.kill()

    def test_reject_during_validation_prevents_promotion(self):
        self.commit_change(self.root, "candidate\n", "candidate")
        self.fleet("submit", "-m", "candidate")
        item = self.state()[-1]
        started = Path(self.temporary.name) / "validation-started"
        unblock = Path(self.temporary.name) / "validation-unblock"
        self.configure_validation(f"touch {started}; while [ ! -f {unblock} ]; do sleep .05; done")
        before = command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout
        process = subprocess.Popen([str(self.root / "_scripts/fleet"), "receive", item["id"]], cwd=self.root, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.wait_for(started.exists)
            self.fleet("reject", item["id"], "not approved")
            unblock.touch()
            process.communicate(timeout=15)
            self.assertEqual("rejected", self.state()[-1]["status"])
            self.assertEqual(before, command("git", "rev-parse", "fleet/integrated", cwd=self.root).stdout)
        finally:
            unblock.touch()
            if process.poll() is None:
                process.kill()

    def test_rebootstrap_refuses_and_preserves_queue_and_claims(self):
        self.fleet("claim", "worker-1", "Owned", "--paths", "index.html")
        self.commit_change(self.root, "candidate\n", "candidate")
        self.fleet("submit", "-m", "candidate", "--signoff")
        before_submissions = (self.root / ".git/fleet/submissions.json").read_text()
        before_claims = (self.root / ".git/fleet/claims.json").read_text()
        result = self.fleet("bootstrap", "--worktree-root", str(self.worktrees), check=False)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("already bootstrapped", result.stderr)
        self.assertEqual(before_submissions, (self.root / ".git/fleet/submissions.json").read_text())
        self.assertEqual(before_claims, (self.root / ".git/fleet/claims.json").read_text())

    def test_status_works_from_repository_subdirectory(self):
        result = self.fleet("status", cwd=self.root / "_scripts")
        self.assertIn("LANES", result.stdout)

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

    def test_integration_preview_refreshes_after_acceptance(self):
        url = self.fleet("preview", "integration").stdout.strip().split()[-1]
        self.assertEqual("baseline\n", subprocess.check_output(["curl", "-fsS", url], text=True))
        self.commit_change(self.root, "accepted preview\n", "candidate")
        self.fleet("submit", "-m", "candidate")
        self.fleet("receive")
        self.assertEqual("accepted preview\n", subprocess.check_output(["curl", "-fsS", url], text=True))
        self.assertIn("preview_refreshed_at", self.state()[-1])

    def test_orphan_validator_is_reconciled_without_deleting_candidate(self):
        self.commit_change(self.root, "candidate\n", "candidate")
        self.fleet("submit", "-m", "candidate")
        item = self.state()[-1]
        started = Path(self.temporary.name) / "orphan-started"
        unblock = Path(self.temporary.name) / "orphan-unblock"
        validation = f"echo evidence > orphan-evidence.txt; touch {started}; while [ ! -f {unblock} ]; do sleep .05; done"
        self.configure_validation(validation)
        receiver = subprocess.Popen([str(self.root / "_scripts/fleet"), "receive", item["id"]], cwd=self.root, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.wait_for(started.exists)
        candidate = Path(self.state()[-1]["candidate_path"])
        validator_pid = self.state()[-1]["validation_pid"]
        receiver.kill()
        receiver.communicate(timeout=5)
        self.assertTrue(candidate.exists())
        self.assertTrue((candidate / "orphan-evidence.txt").exists())
        unblock.touch()
        replacement = self.fleet("receive", check=False)
        self.assertEqual(0, replacement.returncode, replacement.stderr)
        self.assertEqual("accepted", self.state()[-1]["status"])
        self.assertEqual(validator_pid, self.state()[-1]["validation_pid"])
        self.assertTrue(candidate.exists(), "dirty evidence-bearing candidate must be preserved")

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

    def test_wake_hands_late_submission_to_successor_integrator(self):
        fake_bin = Path(self.temporary.name) / "fake-bin"
        fake_bin.mkdir()
        first_done = Path(self.temporary.name) / "first-done"
        unblock = Path(self.temporary.name) / "integrator-unblock"
        count = Path(self.temporary.name) / "integrator-count"
        fake_pi = fake_bin / "pi"
        fake_pi.write_text("""#!/usr/bin/env python3
import json, os, pathlib, subprocess, time
state = pathlib.Path(os.environ['FLEET_TEST_STATE'])
count_path = pathlib.Path(os.environ['FLEET_TEST_COUNT'])
number = int(count_path.read_text()) + 1 if count_path.exists() else 1
count_path.write_text(str(number))
items = [item for item in json.loads((state / 'submissions.json').read_text()) if item['status'] == 'queued']
if items:
    subprocess.run([os.environ['FLEET_TEST_CLI'], 'receive', items[0]['id']], check=True)
if number == 1:
    pathlib.Path(os.environ['FLEET_TEST_FIRST_DONE']).touch()
    unblock = pathlib.Path(os.environ['FLEET_TEST_UNBLOCK'])
    while not unblock.exists(): time.sleep(.05)
""")
        fake_pi.chmod(0o755)
        integration_cli = self.worktrees / "integration/_scripts/fleet"
        self.env.update({
            "PATH": str(fake_bin) + os.pathsep + self.env["PATH"],
            "FLEET_TEST_STATE": str(self.root / ".git/fleet"),
            "FLEET_TEST_COUNT": str(count),
            "FLEET_TEST_CLI": str(integration_cli),
            "FLEET_TEST_FIRST_DONE": str(first_done),
            "FLEET_TEST_UNBLOCK": str(unblock),
        })
        self.configure(auto_integrate=True)
        self.commit_change(self.root, "first\n", "first")
        self.fleet("submit", "-m", "first")
        self.wait_for(first_done.exists)
        worker = self.worktrees / "worker-2"
        extra = worker / "late.txt"
        extra.write_text("late\n")
        command("git", "add", "late.txt", cwd=worker)
        command("git", "commit", "--no-gpg-sign", "-m", "late", cwd=worker)
        self.fleet("submit", "-m", "late", cwd=worker)
        self.assertEqual("queued", self.state()[-1]["status"])
        unblock.touch()
        self.wait_for(lambda: len(self.state()) == 2 and all(item["status"] == "accepted" for item in self.state()), timeout=25)
        self.assertGreaterEqual(int(count.read_text()), 2)

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
