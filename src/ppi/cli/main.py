"""CLI entry point for ppi."""

from __future__ import annotations

import csv
import io
import json
import subprocess
import sys
import time
import traceback
import uuid
import webbrowser
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import click

from ppi.core.analyzer import report_config_to_scope
from ppi.core.contracts import AnalysisBatch, ProjectRef, RunMeta, batch_to_json
from ppi.core.odoo.pipeline import ReportConfig, build_report_config
from ppi.history import git
from ppi.history.walker import cleanup_worktree, walk_history
from ppi.history.worktree import remove_worktree
from ppi.query.rpc_server import serve_rpc
from ppi.runtime import lock as project_lock
from ppi.runtime.log import get_logger, set_verbose
from ppi.runtime.names import parse_module_file_path
from ppi.runtime.paths import (
    analysis_dir_for_repo,
    assert_outside_repo,
    ensure_analysis_dir,
    ensure_in_project_store,
    in_project_store_dir,
    lock_path,
    project_id_from_repo,
    store_path,
    worktree_path,
    writer_lock_path,
)
from ppi.runtime.progress import (
    CommitProgress,
    RunCompleted,
    RunFailed,
    RunStarted,
    emit,
)
from ppi.storage import schema
from ppi.storage.queries import QueryNotFoundError, StoreReader
from ppi.storage.writer import StoreWriter

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class CliContext:
    """Shared CLI configuration."""

    repo: Path
    branch: str | None
    profile: str
    analysis_dir: Path
    verbose: bool = False


pass_context = click.make_pass_decorator(CliContext, ensure=True)


def _parse_file_path(file_path: str) -> tuple[str, str]:
    """Split a CLI file filter into module name and relative path."""
    try:
        return parse_module_file_path(file_path)
    except ValueError as exc:
        raise click.ClickException("--file must be module/relative/path") from exc


def _emit_query_rows(rows: list[dict], output_format: str) -> None:
    """Print query result rows in the selected output format."""
    if output_format == "json":
        click.echo(json.dumps(rows, ensure_ascii=False, indent=2, default=str))
        return
    if not rows:
        click.echo("No rows.")
        return
    if output_format == "csv":
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        click.echo(buffer.getvalue().rstrip("\n"))
        return
    headers = list(rows[0].keys())
    click.echo(" | ".join(headers))
    for row in rows:
        click.echo(" | ".join(str(row[key]) for key in headers))


def _recover_stale_artifacts(ctx: CliContext) -> list[str]:
    """Remove stale worktree and orphan lock files when safe."""
    actions: list[str] = []
    locked = project_lock.is_locked(writer_lock_path(ctx.repo))
    wt = worktree_path(ctx.analysis_dir)
    if wt.exists() and not locked:
        removed = remove_worktree(ctx.repo, ctx.analysis_dir)
        if removed.is_ok():
            actions.append("removed stale worktree")
    lock_file = writer_lock_path(ctx.repo)
    if lock_file.is_file() and not project_lock.is_locked(lock_file):
        lock_file.unlink(missing_ok=True)
        actions.append("removed stale lock file")
    return actions


def _format_duration(seconds: float) -> str:
    """Format elapsed seconds for analyze summary output."""
    total = int(seconds)
    minutes, secs = divmod(total, 60)
    if minutes:
        return f"{minutes}m{secs}s"
    return f"{secs}s"


def _open_store_reader(repo: Path) -> StoreReader:
    """Open a read-only store reader with schema compatibility errors surfaced."""
    try:
        return StoreReader(store_path(repo), read_only=True)
    except FileNotFoundError as exc:
        raise click.ClickException(str(exc)) from exc
    except schema.SchemaIncompatibleError as exc:
        raise click.ClickException(str(exc)) from exc


def _assert_store_metadata(ctx: CliContext, stored: ProjectRef) -> None:
    """Ensure CLI branch and profile match the store."""
    branch_result = git.resolve_branch(ctx.repo, ctx.branch)
    if branch_result.is_error():
        raise click.ClickException(branch_result.error)
    if stored.branch != branch_result.ok:
        raise click.ClickException(
            f"Store contains branch {stored.branch!r}; rerun analyze for {branch_result.ok!r}.",
        )
    if stored.profile != ctx.profile:
        raise click.ClickException(
            f"Store contains profile {stored.profile!r}; "
            f"rerun analyze with profile {ctx.profile!r}.",
        )


def _resolve_context(
    repo: Path,
    branch: str | None,
    profile: str,
    analysis_dir: Path | None,
) -> CliContext:
    """Build shared CLI context and validate artifact placement."""
    if profile != "odoo":
        raise click.ClickException(f"Unsupported analysis profile: {profile}")
    resolved_repo = repo.resolve()
    analysis = analysis_dir or analysis_dir_for_repo(resolved_repo)
    try:
        ensure_analysis_dir(analysis)
        ensure_in_project_store(resolved_repo)
        for artifact in (analysis, worktree_path(analysis), lock_path(analysis)):
            assert_outside_repo(resolved_repo, artifact)
    except (OSError, ValueError) as exc:
        raise click.ClickException(str(exc)) from exc
    return CliContext(
        repo=resolved_repo,
        branch=branch,
        profile=profile,
        analysis_dir=analysis,
    )


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.option(
    "--repo", type=click.Path(exists=True, file_okay=False, path_type=Path), required=True
)
@click.option("--branch", default=None, help="Branch to analyze; defaults to current branch.")
@click.option("--profile", default="odoo", show_default=True)
@click.option(
    "--analysis-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Directory for store, worktree, and runtime artifacts.",
)
@click.option("-v", "--verbose", is_flag=True, help="Extra diagnostics on stderr.")
@click.pass_context
def cli(
    click_ctx: click.Context,
    repo: Path,
    branch: str | None,
    profile: str,
    analysis_dir: Path | None,
    verbose: bool,
) -> None:
    """Analyze Git history metrics for Python/Odoo projects."""
    set_verbose(verbose)
    base = _resolve_context(repo, branch, profile, analysis_dir)
    click_ctx.obj = CliContext(
        repo=base.repo,
        branch=base.branch,
        profile=base.profile,
        analysis_dir=base.analysis_dir,
        verbose=verbose,
    )


@cli.command()
@click.option("--rebuild", is_flag=True, help="Drop stored history and re-analyze all commits.")
@click.option(
    "--jsonl",
    "jsonl_output",
    type=click.Path(dir_okay=False, path_type=Path),
    default=None,
    help="Optional JSONL output path for analysis batches.",
)
@click.option(
    "--addons-path",
    "addons_paths",
    multiple=True,
    help=(
        "Relative addons root inside the worktree; repeat for multiple roots. "
        "Defaults to worktree root."
    ),
)
@click.option(
    "--module-prefix", "module_prefixes", multiple=True, help="Include modules with this prefix."
)
@click.option(
    "--include-module", "include_modules", multiple=True, help="Include exact module names."
)
@click.option("--all-modules", "all_modules", is_flag=True, help="Include every discovered module.")
@click.option(
    "--json",
    "json_output",
    is_flag=True,
    help="Emit machine-readable JSON-lines progress events on stdout and suppress human output.",
)
@pass_context
def analyze(
    ctx: CliContext,
    rebuild: bool,
    jsonl_output: Path | None,
    addons_paths: tuple[str, ...],
    module_prefixes: tuple[str, ...],
    include_modules: tuple[str, ...],
    all_modules: bool,
    json_output: bool,
) -> None:
    """Walk non-merge commit history and collect metrics."""
    if ctx.verbose:
        log.debug("analysis dir: %s", ctx.analysis_dir)
    run_id = str(uuid.uuid4())
    started_at = git.utc_now_epoch()
    mode = "rebuild" if rebuild else "incremental"
    project_id = project_id_from_repo(ctx.repo)
    loop_entered = False
    writer: StoreWriter | None = None

    def _run(branch_name: str, scope: str, skip_commits: set[str]) -> None:
        nonlocal writer, loop_entered
        try:
            writer = StoreWriter(store_path(ctx.repo))
        except schema.SchemaIncompatibleError as exc:
            raise click.ClickException(str(exc)) from exc
        if rebuild:
            writer.clear_project_data()
        else:
            stored = writer.get_project()
            if stored is not None:
                if stored.project_id != project_id:
                    raise click.ClickException(
                        "Repository changed for this analysis directory; rerun with --rebuild.",
                    )
                if stored.branch != branch_name:
                    raise click.ClickException(
                        f"Branch changed from {stored.branch!r} to {branch_name!r}; "
                        f"rerun with --rebuild.",
                    )
                if stored.profile != ctx.profile:
                    raise click.ClickException(
                        f"Profile changed from {stored.profile!r} to {ctx.profile!r}; "
                        f"rerun with --rebuild.",
                    )
                if stored.scope != scope:
                    raise click.ClickException(
                        "Module scope changed; rerun with --rebuild.",
                    )
            skip_commits = writer.stored_commit_hashes()
        writer.upsert_project(
            ProjectRef(
                project_id=project_id,
                repo_path=str(ctx.repo),
                branch=branch_name,
                profile=ctx.profile,
                scope=scope,
            ),
        )
        writer.start_run(
            RunMeta(
                run_id=run_id,
                branch=branch_name,
                mode=mode,
                status="running",
                started_at=started_at,
                finished_at=None,
                commits_total=0,
                commits_succeeded=0,
                commits_failed=0,
            ),
        )
        loop_entered = True
        _run_analyze_loop(
            ctx,
            branch_name,
            skip_commits,
            writer,
            run_id,
            jsonl_output,
            started_at,
            mode,
            addons_paths,
            report_config,
            json_output,
        )

    try:
        branch_result = git.resolve_branch(ctx.repo, ctx.branch)
        if branch_result.is_error():
            raise click.ClickException(branch_result.error)
        branch_name = branch_result.ok
        report_config = build_report_config(
            project_label=ctx.repo.name,
            module_prefixes=module_prefixes,
            include_modules=include_modules,
            all_modules=all_modules or (not module_prefixes and not include_modules),
        )
        scope = report_config_to_scope(report_config)
        skip_commits: set[str] = set()
        with project_lock.write_lock(writer_lock_path(ctx.repo)):
            _run(branch_name, scope, skip_commits)
    except BaseException as exc:
        if json_output and not loop_entered:
            emit(
                RunFailed(
                    run_id=run_id,
                    exit_reason=_exit_reason(exc),
                    message=str(exc),
                    stderr_tail=_stderr_tail(exc),
                ),
            )
        if isinstance(exc, RuntimeError) and not isinstance(exc, click.ClickException):
            raise click.ClickException(str(exc)) from exc
        raise
    finally:
        if writer is not None:
            writer.close()


def _batch_succeeded(batch: AnalysisBatch) -> bool:
    """Return whether a batch represents successful analysis output."""
    has_metrics = bool(batch.files or batch.modules or batch.edges)
    if batch.failures and not has_metrics:
        return False
    return True


def _exit_reason(exc: BaseException) -> str:
    """Map an exception to the ``RunFailed.exit_reason`` closed enum.

    Contract: ``cli_error, schema_incompatible, lock_busy, bad_workspace, unknown``.
    """
    if isinstance(exc, schema.SchemaIncompatibleError):
        return "schema_incompatible"
    if isinstance(exc, project_lock.LockBusyError):
        return "lock_busy"
    if isinstance(exc, click.ClickException):
        message = str(exc).lower()
        if any(token in message for token in ("repo", "branch", "workspace", "directory")):
            return "bad_workspace"
        return "cli_error"
    return "unknown"


def _stderr_tail(exc: BaseException) -> str:
    """Build a capped stderr tail for a ``RunFailed`` event (SC-006)."""
    if isinstance(exc, click.ClickException):
        text = exc.message
    else:
        text = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    return text[-2000:]


class _JsonProgressSink:
    """Progress sink for ``--json``: emit one ``CommitProgress`` event per commit."""

    def __init__(self, commits_total: int) -> None:
        self.commits_total = commits_total

    def update(self, processed: int, short_hash: str) -> None:
        """Emit a progress event (no human-readable output)."""
        emit(
            CommitProgress(
                processed=processed,
                commits_total=self.commits_total,
                short_hash=short_hash,
            ),
        )


class _BarProgressSink:
    """Progress sink for the human path: update the ``click.progressbar``."""

    def __init__(self, bar: Any, branch_name: str, commits_total: int) -> None:
        self._bar = bar
        self._branch_name = branch_name
        self._commits_total = commits_total

    def update(self, processed: int, short_hash: str) -> None:
        """Advance the bar and relabel it with the current commit."""
        self._bar.label = (
            f"Analyzing {self._branch_name} [{processed}/{self._commits_total}] {short_hash}"
        )
        self._bar.update(1)


@contextmanager
def _progress_sink(json_output: bool, commits_total: int, branch_name: str):
    """Yield one progress sink, suppressing the human bar when ``json_output``."""
    if json_output:
        yield _JsonProgressSink(commits_total)
    else:
        with click.progressbar(
            length=commits_total,
            label=f"Analyzing {branch_name}",
            show_eta=True,
            show_pos=True,
        ) as bar:
            yield _BarProgressSink(bar, branch_name, commits_total)


def _run_analyze_loop(
    ctx: CliContext,
    branch_name: str,
    skip_commits: set[str],
    writer: StoreWriter,
    run_id: str,
    jsonl_output: Path | None,
    started_at: int,
    mode: str,
    addons_paths: tuple[str, ...],
    report_config: ReportConfig,
    json_output: bool = False,
) -> None:
    """Execute the history walk with progress reporting.

    When ``json_output`` is set, emit ``ProgressEvent`` JSON-lines on stdout and
    suppress the human-readable progress bar and summary lines.
    """
    state = None
    run_status = "failed"
    commits_succeeded = 0
    commits_failed = 0
    processed = 0

    def _record_outcome(batch: AnalysisBatch, succeeded: bool) -> None:
        """Tally one batch outcome and log per-commit failures when present."""
        nonlocal commits_succeeded, commits_failed
        if succeeded:
            commits_succeeded += 1
            return
        if batch.failures:
            commits_failed += 1
            for failure in batch.failures:
                target = failure.file_path or batch.commit.commit_hash[:8]
                log.warning("analysis failed at %s: %s", target, failure.error_text)

    try:
        prepared = walk_history(
            ctx.repo,
            branch_name,
            ctx.analysis_dir,
            profile=ctx.profile,
            skip_commits=skip_commits,
            addons_paths=addons_paths,
            report_config=report_config,
        )
        if prepared.is_error():
            raise click.ClickException(prepared.error)
        batches, state = prepared.ok
        if json_output:
            emit(
                RunStarted(
                    run_id=run_id,
                    branch=branch_name,
                    mode=mode,
                    commits_total=state.commits_total,
                ),
            )
        jsonl_file = jsonl_output.open("w", encoding="utf-8") if jsonl_output else None
        loop_started = time.perf_counter()
        try:
            with _progress_sink(json_output, state.commits_total, branch_name) as sink:
                for batch in batches:
                    processed += 1
                    short_hash = batch.commit.commit_hash[:8]
                    sink.update(processed, short_hash)
                    if jsonl_file is not None:
                        jsonl_file.write(batch_to_json(batch) + "\n")
                    succeeded = _batch_succeeded(batch)
                    try:
                        writer.write_batch(batch, run_id)
                    except Exception:
                        if succeeded:
                            commits_failed += 1
                        raise
                    _record_outcome(batch, succeeded)
        finally:
            if jsonl_file is not None:
                jsonl_file.close()
        run_status = "completed"
        if json_output:
            emit(
                RunCompleted(
                    run_id=run_id,
                    commits_succeeded=commits_succeeded,
                    commits_failed=commits_failed,
                    duration_ms=int((time.perf_counter() - loop_started) * 1000),
                ),
            )
    except BaseException as exc:
        if json_output:
            emit(
                RunFailed(
                    run_id=run_id,
                    exit_reason=_exit_reason(exc),
                    message=str(exc),
                    stderr_tail=_stderr_tail(exc),
                ),
            )
        raise
    finally:
        cleanup_worktree(ctx.repo, ctx.analysis_dir)
        writer.finish_run(
            RunMeta(
                run_id=run_id,
                branch=branch_name,
                mode=mode,
                status=run_status,
                started_at=started_at,
                finished_at=git.utc_now_epoch(),
                commits_total=state.commits_total if state is not None else 0,
                commits_succeeded=commits_succeeded,
                commits_failed=commits_failed,
            ),
        )
    if json_output or state is None or run_status != "completed":
        return
    click.echo(
        f"Analyzed {processed}/{state.commits_total} commits "
        f"(succeeded: {commits_succeeded}, failed: {commits_failed}) "
        f"in {_format_duration(time.perf_counter() - loop_started)}",
    )
    click.echo(f"Store: {store_path(ctx.repo)}")


@cli.command()
@click.option("--metric", type=str, required=True)
@click.option("--module", "module_name", default=None)
@click.option(
    "--file", "file_path", default=None, help="Filter to one file as module/relative/path."
)
@click.option("--commit", "commit_hash", default=None, help="Snapshot selector (default: latest).")
@click.option(
    "--agg",
    type=click.Choice(["mean", "median", "p95", "max"], case_sensitive=False),
    default="mean",
    show_default=True,
)
@click.option(
    "--include-zero-score", is_flag=True, help="Include score==0 edges in graph/edge reads."
)
@click.option(
    "--format",
    "output_format",
    type=click.Choice(["table", "json", "csv"], case_sensitive=False),
    default="table",
    show_default=True,
)
@pass_context
def query(
    ctx: CliContext,
    metric: str,
    module_name: str | None,
    file_path: str | None,
    commit_hash: str | None,
    agg: str,
    include_zero_score: bool,
    output_format: str,
) -> None:
    """Query stored metrics without re-running analysis."""
    metric = metric.lower()
    if module_name and file_path:
        raise click.ClickException("Use either --module or --file, not both.")
    if project_lock.is_locked(writer_lock_path(ctx.repo)):
        raise click.ClickException("Analysis in progress; query later.")
    try:
        reader = _open_store_reader(ctx.repo)
    except click.ClickException:
        raise
    try:
        stored = reader.get_project()
        if stored is not None:
            _assert_store_metadata(ctx, stored)

        def _ch(commit_hash: str | None) -> str:
            return commit_hash or reader.latest_commit_hash()

        payload: dict | list
        if metric == "graph":
            payload = reader.graph_at_commit(commit_hash, include_zero_score=include_zero_score)
        elif metric == "snapshot-table-modules":
            rows = reader.snapshot_table_modules(commit_hash)
            payload = {"commit_hash": _ch(commit_hash), "rows": [{"cells": row} for row in rows]}
        elif metric == "snapshot-table-files":
            rows = reader.snapshot_table_files(commit_hash, module_name)
            payload = {"commit_hash": _ch(commit_hash), "rows": [{"cells": row} for row in rows]}
        elif metric == "snapshot-relations":
            relations = reader.snapshot_relations(commit_hash, include_zero_score=include_zero_score)
            payload = {"commit_hash": _ch(commit_hash), "relations": relations}
        elif metric == "project-info":
            payload = reader.project_info()
        elif metric == "ui-config":
            payload = {"dashboard_metrics": [], "aggregations": [], "tables": [], "graph": {"edge_types": [], "line_categories": [], "brightness_metrics": [], "node_size_metrics": [], "link_thickness_metrics": []}}
        elif file_path:
            mod, rel = _parse_file_path(file_path)
            if not reader.file_exists(mod, rel):
                raise click.ClickException(f"Unknown file: {file_path}")
            payload = (
                reader.file_lines_timeseries(mod, rel)
                if metric == "lines"
                else reader.file_complexity_timeseries(mod, rel, metric=metric, agg=agg)
            )
        elif metric == "lines":
            if not module_name:
                raise click.ClickException("--module is required for lines metric")
            if not reader.module_exists(module_name):
                raise click.ClickException(f"Unknown module: {module_name}")
            payload = reader.module_lines_timeseries(module_name)
        else:
            if not module_name:
                raise click.ClickException("--module is required for metric timeseries")
            if not reader.module_exists(module_name):
                raise click.ClickException(f"Unknown module: {module_name}")
            payload = reader.module_complexity_timeseries(module_name, metric=metric, agg=agg)
    except QueryNotFoundError as exc:
        raise click.ClickException(str(exc)) from exc
    finally:
        reader.close()
    if isinstance(payload, dict):
        click.echo(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
        return
    _emit_query_rows(payload, output_format)


@cli.command()
@click.option("--host", default="127.0.0.1", show_default=True)
@click.option("--port", default=8765, show_default=True, type=int)
@click.option("--open", "open_browser", is_flag=True)
@pass_context
def serve(ctx: CliContext, host: str, port: int, open_browser: bool) -> None:
    """Start the dashboard API server."""
    if project_lock.is_locked(writer_lock_path(ctx.repo)):
        raise click.ClickException("Analysis in progress; serve later.")
    store_file = store_path(ctx.repo)
    if store_file.is_file():
        try:
            reader = _open_store_reader(ctx.repo)
            stored = reader.get_project()
            if stored is not None:
                _assert_store_metadata(ctx, stored)
            reader.close()
        except click.ClickException:
            raise
    import uvicorn

    from ppi.server.app import STATIC_DIR, _static_dir, create_app

    static_dir = _static_dir()
    if static_dir == STATIC_DIR:
        log.warning(
            "frontend/dist not found; serving fallback static UI. "
            "Build the dashboard: cd frontend && npm install && npm run build",
        )
    app = create_app(store_path(ctx.repo), writer_lock_path(ctx.repo))
    url = f"http://{host}:{port}/"
    if open_browser:
        webbrowser.open(url)
    uvicorn.run(app, host=host, port=port)


@cli.command()
@pass_context
def rpc(ctx: CliContext) -> None:
    """Run a long-lived read-only JSON-RPC query servant over stdio.

    The store and writer lock are resolved from ``repo`` (same as ``analyze``);
    ``--analysis-dir`` on the CLI group only affects the worktree used by
    ``analyze`` and is ignored here.
    """
    serve_rpc(ctx.repo)


@cli.command()
@click.option(
    "--recover-stale",
    is_flag=True,
    help="Remove stale worktree and orphan lock files when safe.",
)
@pass_context
def doctor(ctx: CliContext, recover_stale: bool) -> None:
    """Verify environment prerequisites."""
    if recover_stale:
        for action in _recover_stale_artifacts(ctx):
            click.echo(f"RECOVERED {action}")
    checks: list[tuple[str, bool, str]] = []
    git_check = git.git_version(ctx.repo)
    checks.append(
        ("git", git_check.is_ok(), git_check.ok.strip() if git_check.is_ok() else git_check.error)
    )
    branch_check = git.resolve_branch(ctx.repo, ctx.branch)
    checks.append(
        (
            "branch",
            branch_check.is_ok(),
            branch_check.ok if branch_check.is_ok() else branch_check.error,
        )
    )
    writable = False
    writable_message = ""
    try:
        test_file = ctx.analysis_dir / ".write_test"
        ctx.analysis_dir.mkdir(parents=True, exist_ok=True)
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink()
        writable = True
        writable_message = str(ctx.analysis_dir)
    except OSError as exc:
        writable_message = str(exc)
    checks.append(("analysis_dir_writable", writable, writable_message))
    ppi_ok = True
    ppi_message = "not created yet"
    try:
        ensure_in_project_store(ctx.repo)
        ppi_message = str(in_project_store_dir(ctx.repo))
    except ValueError as exc:
        ppi_ok = False
        ppi_message = str(exc)
    checks.append(("ppi_dir", ppi_ok, ppi_message))
    tracked = subprocess.run(
        ["git", "-C", str(ctx.repo), "ls-files", "--error-unmatch", ".ppi"],
        capture_output=True,
        text=True,
    )
    if tracked.returncode == 0:
        click.echo(
            "WARN .ppi is tracked in git; self-ignoring .gitignore cannot untrack committed files"
        )
    store_ok = True
    store_message = "store not created yet"
    if store_path(ctx.repo).is_file():
        try:
            reader = _open_store_reader(ctx.repo)
            version = reader.schema_version()
            reader.close()
            store_message = (
                f"store readable (schema_version={version}, expected={schema.SCHEMA_VERSION})"
            )
        except schema.SchemaIncompatibleError as exc:
            store_ok = False
            store_message = str(exc)
        except Exception as exc:  # noqa: BLE001
            store_ok = False
            store_message = str(exc)
    checks.append(("store", store_ok, store_message))
    locked = project_lock.is_locked(writer_lock_path(ctx.repo))
    checks.append(("writer_lock", not locked, "free" if not locked else "locked"))
    worktree_exists = worktree_path(ctx.analysis_dir).exists()
    checks.append(
        (
            "worktree",
            not worktree_exists,
            "absent" if not worktree_exists else "stale worktree present",
        )
    )
    failed = False
    for name, ok, detail in checks:
        status = "OK" if ok else "FAIL"
        click.echo(f"{status} {name}: {detail}")
        failed = failed or not ok
    if not recover_stale and (locked or worktree_exists):
        click.echo(
            "Hint: rerun with --recover-stale to remove stale worktree or orphan lock files."
        )
    if failed:
        sys.exit(1)
