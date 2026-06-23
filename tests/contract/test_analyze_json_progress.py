"""Contract tests for the ``ppi analyze --json`` progress stream (FR-019)."""

from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner

from ppi.cli.main import cli
from ppi.runtime.progress import (
    CommitProgress,
    RunCompleted,
    RunFailed,
    RunStarted,
    decode_line,
)


def _events(output: str):
    """Decode the JSON-lines emitted on stdout into event structs, skipping non-JSON noise."""
    events = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(decode_line(line))
        except Exception:  # noqa: BLE001
            continue
    return events


def test_analyze_json_emits_ordered_terminal_stream(mini_repo: Path, tmp_path: Path):
    """``--json`` emits run_started -> commit_progress* -> run_completed and no human output."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(mini_repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "analyze",
            "--json",
        ],
    )
    assert result.exit_code == 0, result.output
    events = _events(result.output)
    assert events, "expected at least one progress event"
    assert isinstance(events[0], RunStarted)
    started = events[0]
    assert started.branch
    assert started.mode in ("incremental", "rebuild")
    assert started.commits_total >= 1

    progress_events = [e for e in events if isinstance(e, CommitProgress)]
    assert progress_events, "expected at least one commit_progress event"
    assert [p.processed for p in progress_events] == list(
        range(1, len(progress_events) + 1)
    )
    for p in progress_events:
        assert p.commits_total == started.commits_total
        assert 0 < p.processed <= p.commits_total
        assert len(p.short_hash) == 8

    terminal = [e for e in events if isinstance(e, (RunCompleted, RunFailed))]
    assert len(terminal) == 1, "exactly one terminal event is required"
    assert isinstance(terminal[0], RunCompleted)
    completed = terminal[0]
    assert completed.commits_succeeded + completed.commits_failed == len(progress_events)
    assert completed.duration_ms >= 0

    # run_started precedes the first progress event precedes the terminal event
    first_progress = events.index(progress_events[0])
    terminal_index = events.index(terminal[0])
    assert events.index(events[0]) == 0 and isinstance(events[0], RunStarted)
    assert 0 < first_progress < terminal_index


def test_analyze_json_suppresses_human_output(mini_repo: Path, tmp_path: Path):
    """``--json`` must not emit the human progress bar or the summary lines."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(mini_repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "analyze",
            "--json",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "Analyzing " not in result.output
    assert "Store:" not in result.output
    assert "%" not in result.output  # progressbar percentage never rendered


def test_analyze_without_json_keeps_human_output(mini_repo: Path, tmp_path: Path):
    """Without ``--json`` the human-readable summary is unchanged."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(mini_repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "analyze",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "Analyzed " in result.output
    assert "Store:" in result.output
    # No JSON event objects leak into the human output.
    assert '"type":"run_started"' not in result.output


def test_analyze_json_emits_run_failed_with_stderr_tail_and_exit_reason(monkeypatch, mini_repo, tmp_path):
    """A mid-walk failure emits run_failed with a non-empty stderr_tail and a mapped exit_reason (B1/B2)."""
    from ppi.cli import main as cli_main
    from ppi.runtime.progress import RunFailed

    class _ErrorResult:
        def is_error(self) -> bool:
            return True

        error = "boom: bad branch xyz"

    def _fake_walk_history(*_args, **_kwargs):
        return _ErrorResult()

    monkeypatch.setattr(cli_main, "walk_history", _fake_walk_history)

    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(mini_repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "analyze",
            "--json",
        ],
    )
    # The CLI re-raises after emitting run_failed, so the command exits non-zero.
    assert result.exit_code != 0
    events = _events(result.output)
    failed = [e for e in events if isinstance(e, RunFailed)]
    assert len(failed) == 1
    failed_event = failed[0]
    assert failed_event.exit_reason == "bad_workspace"  # message contains "branch"
    assert failed_event.stderr_tail  # non-empty (SC-006)
    assert "boom: bad branch xyz" in failed_event.stderr_tail
