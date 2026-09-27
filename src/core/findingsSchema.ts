/**
 * The findings schema Obelus sends a model. This is the constitutional
 * decision, not a prompt instruction: it exposes only the issue, the diagnosis,
 * an optional pattern and the quoted span. There is deliberately no
 * field for rewritten prose, and `additionalProperties: false` refuses one if a
 * model invents it. A model cannot hand the Writer a sentence through a schema
 * that has nowhere to put it.
 *
 * There is no offset field either. Core finds the quote inside the Target and
 * records the position itself (`applyContainment`); a reasoning model asked for
 * a character offset spelled the Document out letter by letter and ran out of
 * output budget before it answered.
 */
const FINDING_ITEM_PROPERTIES: Record<string, unknown> = {
  issue: {
    type: "string",
    description: "A short label for the problem.",
  },
  diagnosis: {
    type: "string",
    description: "Why the quoted span is a problem, in the model's words.",
  },
  pattern: {
    type: "string",
    description: "The category or rule the problem matches, if any.",
  },
  quote: {
    type: "string",
    description: "The exact span from the target, copied verbatim.",
  },
};

/**
 * The fields the findings schema exposes, derived from the schema itself so the
 * parser's closed field set and the wire schema cannot drift apart.
 */
export const FINDING_FIELDS = Object.keys(FINDING_ITEM_PROPERTIES);

export const FINDINGS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      description: "Problems found in the target.",
      items: {
        type: "object",
        properties: FINDING_ITEM_PROPERTIES,
        required: ["issue", "diagnosis", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
};
