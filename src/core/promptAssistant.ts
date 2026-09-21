import type { Connection } from "../wire/connection";
import type { ModelRequest } from "../wire/modelRequest";
import type { Transport } from "../wire/transport";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "./modelCall";
import { placeholderTokens } from "./prompt";
import { CONSTITUTION_CLAUSES } from "./starterPasses";

/**
 * The prompt-authoring assistant (stories 104 and 105). It helps the Writer
 * write a Pass prompt, and it works only on Pass prompts and never on the
 * Writer's prose.
 *
 * Story 105 is enforced by the signature, not by a prompt: input is the
 * Writer's request and their current Pass prompt, and there is no parameter for
 * a Document, a Target or any prose. A model reply cannot reach the Document
 * either — the result is prompt text the Writer may keep in a Pass record, and
 * there is no path from here into the Editor.
 */

/**
 * The assistant's standing instruction. It names the placeholders Obelus can
 * fill and the two constitutional clauses every model Pass keeps, so a prompt
 * the assistant drafts starts from the same shape the Starter passes use. It
 * asks for the prompt itself and nothing else, because the Writer is writing
 * instructions, not reading an essay.
 */
export const PROMPT_ASSISTANT_SYSTEM = [
  "You help a writer author a Pass prompt for Obelus, a browser-only writing tool. A Pass prompt is",
  "an instruction to a model that reads a piece of writing and reports problems in it; the model",
  "never writes prose. Return the Pass prompt itself and nothing else: no explanation, no preamble,",
  "no code fence.",
  "",
  `The prompt may use only these placeholders, written exactly: ${placeholderTokens().join(
    ", ",
  )}. Any other`,
  "placeholder is refused when the prompt is saved, so do not invent one.",
  "",
  "The prompt must name the text the model may analyze, and say that surrounding text is context",
  "rather than target. It must ask for each problem as a quote from the target, a zero-based offset",
  "within the target, a short issue label and a diagnosis. It must include this sentence exactly:",
  CONSTITUTION_CLAUSES,
].join("\n");

/** What the assistant is given. Nothing here is the Writer's prose. */
export interface PromptAssistantRequest {
  /** What the Writer wants the Pass to look for, in their own words. */
  request: string;
  /** The Writer's current Pass prompt, which may be empty. */
  prompt: string;
}

export interface PromptAssistantResult {
  /** The suggested Pass prompt, ready to keep in a Pass record. */
  suggestion: string;
  /** The Provider's whole response, so the Writer can see what came back. */
  rawResponse: string;
}

export interface PromptAssistantConfig {
  /** The single seam. The assistant leaves through the same door as every Run. */
  transport: Transport;
  maxOutputTokens?: number;
}

/** A prompt the assistant could not produce: an empty model, or an empty reply. */
export class PromptAssistantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptAssistantError";
  }
}

/**
 * Story 104: one model call that drafts a Pass prompt. It builds a plain
 * request rather than a Pass request on purpose — the assistant is not a Pass,
 * it never receives the Screening frame, and its output is prompt text rather
 * than Findings. A failure is raised to the caller rather than swallowed.
 */
export async function assistPassPrompt(
  input: PromptAssistantRequest,
  connection: Connection,
  config: PromptAssistantConfig,
): Promise<PromptAssistantResult> {
  if (connection.model.trim() === "") {
    throw new PromptAssistantError(`Set a model on the ${connection.name} Connection first.`);
  }

  const request: ModelRequest = {
    connection,
    model: connection.model,
    system: PROMPT_ASSISTANT_SYSTEM,
    messages: [{ role: "user", content: assistantUserMessage(input) }],
    maxOutputTokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0,
  };

  const rawResponse = await config.transport.send(request);
  const suggestion = stripPromptFences(rawResponse);
  if (suggestion === "") {
    throw new PromptAssistantError("The assistant returned no prompt text. Try again.");
  }
  return { suggestion, rawResponse };
}

/**
 * The user turn: the Writer's request and their current draft, and nothing
 * else. It is an exported pure function so a test can assert the assistant is
 * handed no prose without standing up a transport.
 */
function assistantUserMessage(input: PromptAssistantRequest): string {
  const request = input.request.trim();
  const prompt = input.prompt.trim();
  return [
    "The writer wants a Pass that does this:",
    request === "" ? "(not described)" : request,
    "",
    "The writer's current prompt draft:",
    prompt === "" ? "(empty)" : prompt,
  ].join("\n");
}

/**
 * The prompt text a model reply carries. A model often wraps its answer in a
 * code fence even when told not to, so one surrounding fence is stripped; any
 * other text is returned as it came, because a tolerant reader is more useful
 * than a strict one here.
 */
export function stripPromptFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return (match === null ? trimmed : match[1]).trim();
}
