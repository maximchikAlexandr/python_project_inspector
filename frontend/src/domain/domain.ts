/**
 * Typed domain enums and value objects shared across the frontend (PPI-039/040).
 *
 * Mirrors the Python `EdgeKind`/`LineCategory` StrEnums from
 * `src/ppi/core/value_objects.py`. String conversion happens only at the
 * serialization/API boundary; everywhere else code carries the typed union so
 * a typo is a compile error, not a silent miss.
 */

/** All coupling edge kinds emitted by the Odoo/Python/XML/security analysis. */
export type EdgeKind =
  | "python__inherit"
  | "python_method_call"
  | "python_private_method_call"
  | "python_many2one"
  | "python_one2many"
  | "python_many2many"
  | "python_related"
  | "python_api_depends"
  | "python_api_onchange"
  | "python_api_constrains"
  | "python_env_model"
  | "python_field_property_access"
  | "security_ir_rule_model_ref"
  | "security_ir_rule_ref"
  | "security_xml_ref"
  | "security_csv_ref"
  | "xml_inherit_id"
  | "xml_ref"
  | "xml_percent_ref"
  | "manifest_depends";

/** Edge kind groups used by the graph breakdown (subset that scores). */
export type GraphBreakdownKind = "model_reuse" | "extension_or_method" | "view" | "field_property";

/** Line-count categories tracked per module. */
export type LineCategory =
  | "python_lines"
  | "js_lines"
  | "python_test_lines"
  | "xml_lines"
  | "css_lines"
  | "html_lines";

/** Structured parse/analysis failure (PPI-040) — replaces `string | null`. */
export interface ParseFailure {
  readonly kind: ParseFailureKind;
  readonly path: string;
  readonly line: number | null;
  readonly column: number | null;
  readonly message: string;
  readonly origin: ParseFailureOrigin;
}

export type ParseFailureKind =
  | "python_syntax"
  | "manifest_parse"
  | "manifest_read"
  | "complexity_tool"
  | "source_quote_read"
  | "unknown";

export type ParseFailureOrigin = "python" | "xml" | "manifest" | "complexity" | "security" | "unknown";

/** Build a `ParseFailure`, filling optional fields with null. */
export function parseFailure(args: {
  readonly kind: ParseFailureKind;
  readonly path: string;
  readonly message: string;
  readonly origin: ParseFailureOrigin;
  readonly line?: number | null;
  readonly column?: number | null;
}): ParseFailure {
  return {
    kind: args.kind,
    path: args.path,
    line: args.line ?? null,
    column: args.column ?? null,
    message: args.message,
    origin: args.origin,
  };
}

/** Format a `ParseFailure` for display (UI boundary only). */
export function formatParseFailure(failure: ParseFailure): string {
  const loc = failure.line != null ? `:${failure.line}${failure.column != null ? `:${failure.column}` : ""}` : "";
  return `${failure.path}${loc} [${failure.kind}]: ${failure.message}`;
}

/**
 * Build a `ParseFailure` from a backend `FailureRow` (PPI-040).
 *
 * The backend still ships a flat `error_text` string; this adapter lifts it
 * into the typed `ParseFailure` value object so UI code switches on `kind`,
 * not on string parsing. The origin/kind are inferred from the row fields when
 * available, otherwise fall back to `unknown`.
 */
export function parseFailureFromRow(row: {
  readonly commit_hash: string | null;
  readonly file_path: string | null;
  readonly error_text: string;
}): ParseFailure {
  const path = row.file_path ?? "(unknown)";
  return parseFailure({
    kind: "unknown",
    path,
    message: row.error_text,
    origin: inferOrigin(path),
  });
}

function inferOrigin(path: string): ParseFailureOrigin {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".xml")) return "xml";
  if (path.endsWith("__manifest__.py") || path.endsWith("__openerp__.py")) return "manifest";
  if (path.endsWith(".csv")) return "security";
  return "unknown";
}