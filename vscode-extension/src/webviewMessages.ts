/**
 * Zod schemas for incoming webview messages (PPI-034).
 *
 * The webview sends untrusted JSON via `postMessage`; validate the shape before
 * acting on it so a malformed message is ignored, not a crash.
 */
import { z } from "zod";

/** A query request forwarded to `ppi rpc`. */
export const RequestMessageSchema = z.object({
  kind: z.literal("request"),
  id: z.number(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** A command invocation forwarded to a registered VS Code command. */
export const CommandMessageSchema = z.object({
  kind: z.literal("command"),
  command: z.string(),
});

/** Outgoing progress event sent from the extension to the webview. */
export const ProgressEventSchema = z.object({
  run_id: z.string().optional(),
  type: z.string(),
  branch: z.string().optional(),
  mode: z.string().optional(),
  commits_total: z.number().optional(),
  processed: z.number().optional(),
  short_hash: z.string().optional(),
  commits_succeeded: z.number().optional(),
  commits_failed: z.number().optional(),
  duration_ms: z.number().optional(),
  exit_reason: z.string().optional(),
  message: z.string().optional(),
  stderr_tail: z.string().optional(),
});

/** Any incoming webview message. */
export const WebviewMessageSchema = z.discriminatedUnion("kind", [RequestMessageSchema, CommandMessageSchema]);

export type RequestMessage = z.infer<typeof RequestMessageSchema>;
export type CommandMessage = z.infer<typeof CommandMessageSchema>;
export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;