/**
 * Zod schemas for incoming webview messages (PPI-034).
 *
 * The webview sends untrusted JSON via `postMessage`; validate the shape before
 * acting on it so a malformed message is ignored, not a crash.
 */
import { z } from "zod";

/** A query request forwarded to `ppi rpc`. */
const RequestMessageSchema = z.object({
  kind: z.literal("request"),
  id: z.number().int().positive(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** A command invocation forwarded to a registered VS Code command. */
const CommandMessageSchema = z.object({
  kind: z.literal("command"),
  command: z.string(),
});

/** Any incoming webview message. */
export const WebviewMessageSchema = z.discriminatedUnion("kind", [RequestMessageSchema, CommandMessageSchema]);