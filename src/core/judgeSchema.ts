/**
 * The schema the Judge is asked to answer in. Like the findings schema, it is
 * closed: `additionalProperties: false` and a fixed field set mean a model that
 * invents a field has it refused rather than carried. The Judge's answer is
 * analysis of two passages, so there is no field for prose either.
 *
 * `preference` names the label, never a version: the model is told which
 * passage is `A` and which is `B`, and nothing about which is newer. Unmapping
 * the label back to the Writer's view happens in Core, never in the request.
 */
const JUDGE_REASON_PROPERTIES: Record<string, unknown> = {
  evidence_quote: {
    type: "string",
    description: "An exact quote from passage A or passage B that supports the point.",
  },
  explanation: {
    type: "string",
    description: "Why that quote supports the preference or names a problem.",
  },
};

/** The reason schema's closed field set, so a parser cannot drift from it. */
export const JUDGE_REASON_FIELDS = Object.keys(JUDGE_REASON_PROPERTIES);

export const JUDGE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    preference: {
      type: "string",
      enum: ["A", "B", "tie"],
      description: "Which passage is clearer and more effective prose.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "How confident the preference is, from 0 to 1.",
    },
    reasons: {
      type: "array",
      description: "Why, each with a quote from one of the passages.",
      items: {
        type: "object",
        properties: JUDGE_REASON_PROPERTIES,
        required: ["evidence_quote", "explanation"],
        additionalProperties: false,
      },
    },
    problemsInA: {
      type: "array",
      description: "Problems in passage A, listed separately.",
      items: { type: "string" },
    },
    problemsInB: {
      type: "array",
      description: "Problems in passage B, listed separately.",
      items: { type: "string" },
    },
  },
  required: ["preference", "confidence", "reasons", "problemsInA", "problemsInB"],
  additionalProperties: false,
};
