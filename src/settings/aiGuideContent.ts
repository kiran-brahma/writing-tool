import { CHUNK_OVERLAP, DEFAULT_CHARACTER_LIMIT, MIN_CHARACTER_LIMIT } from "../core/chunking";
import {
  CONNECTION_PREFILLS,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_OUTPUT_TOKENS,
  OLLAMA_MAX_OUTPUT_TOKENS,
} from "../wire/connection";
import { allowOriginCommands, originNeedsAllowing } from "../wire/ollama";
import {
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_DELAY_MS,
} from "../wire/transport";

/**
 * The AI guide, as data: how to connect each Provider, what every setting does,
 * the limits Obelus applies and why requests leave from the browser. Numbers
 * and base URLs come from the modules that enforce them, so the guide cannot
 * drift from the app. `aiGuideContent.test.ts` asserts it by substance with no
 * DOM, like `helpContent.ts`.
 *
 * Each section is one Diátaxis mode, labelled, so a how-to never argues and a
 * reference never instructs. Inline markup is deliberately small: `code`,
 * **bold** and <https://links>, rendered by `AiGuideView`.
 */

export type GuideMode = "How-to" | "Reference" | "Explanation";

export type GuideBlock =
  | { readonly kind: "p"; readonly text: string }
  | { readonly kind: "steps"; readonly items: readonly string[] }
  | { readonly kind: "list"; readonly items: readonly string[] }
  | { readonly kind: "code"; readonly text: string }
  | {
      readonly kind: "table";
      readonly head: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }
  | { readonly kind: "sub"; readonly heading: string; readonly blocks: readonly GuideBlock[] };

export interface GuideSection {
  readonly id: string;
  readonly mode: GuideMode;
  readonly heading: string;
  readonly blocks: readonly GuideBlock[];
}

function baseUrlOf(id: string): string {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === id);
  if (prefill === undefined) throw new Error(`No prefill "${id}"`);
  return prefill.baseUrl;
}

function seconds(ms: number): string {
  return `${ms / 1000} s`;
}

const TIMEOUT_MINUTES = DEFAULT_REQUEST_TIMEOUT_MS / 60_000;

/** The guide for a page served from `origin`, or null outside a browser. */
export function aiGuideSections(origin: string | null): readonly GuideSection[] {
  const site = origin ?? "this site's address";
  const needsAllowing = origin === null || originNeedsAllowing(origin);
  const commands = allowOriginCommands(site);

  const ollamaAllowSteps: readonly GuideBlock[] = needsAllowing
    ? [
        {
          kind: "p",
          text: `Allow this site (${site}) in Ollama. Ollama refuses every website it has not been told to trust, and the browser reports the refusal as "Failed to fetch". Pick the commands for your system.`,
        },
        {
          kind: "list",
          items: [
            `**macOS:** run the command below. Then quit Ollama from the menu bar and open it again. The setting lasts until you restart the Mac.`,
          ],
        },
        { kind: "code", text: commands.macos },
        {
          kind: "list",
          items: [
            `**Windows:** run the command below in a terminal. Then quit Ollama from the taskbar and open it again.`,
          ],
        },
        { kind: "code", text: commands.windows },
        {
          kind: "list",
          items: [
            `**Linux:** run \`sudo systemctl edit ollama.service\`. Add the line below under \`[Service]\`, then run \`sudo systemctl restart ollama\`.`,
          ],
        },
        { kind: "code", text: commands.linuxServiceLine },
        {
          kind: "p",
          text: `If \`OLLAMA_ORIGINS\` is already set, add this site to it, separated by a comma.`,
        },
      ]
    : [
        {
          kind: "p",
          text: `This page is served from your own computer, and Ollama accepts it by default. You do not need to set \`OLLAMA_ORIGINS\`.`,
        },
      ];

  return [
    {
      id: "first-model",
      mode: "How-to",
      heading: "Set up your first model",
      blocks: [
        {
          kind: "p",
          text: "Rule passes work with no model and no key. To run model passes, connect one Provider and assign it to the Critic.",
        },
        {
          kind: "steps",
          items: [
            "Get an API key from a Provider. The table in **Providers at a glance** says where. To use local Ollama, skip the key.",
            "In **Connections**, find the card for that Provider. Paste the key into **API key**.",
            "Click **Test connection**. A working Connection reports how many models it can see.",
            "In **Slots**, set **Critic** to that Connection.",
            "Click **List** next to **Model** and pick a model. You can also type a model id.",
            "Set **Judge** to a different Connection or a different model. If you leave it unset, Obelus picks one for you.",
            "Open a Document and run a model pass from the Rail.",
          ],
        },
        {
          kind: "p",
          text: "If **Test connection** fails, read the message under the button. **Errors and what to do** lists each one.",
        },
      ],
    },
    {
      id: "providers-how-to",
      mode: "How-to",
      heading: "Connect each Provider",
      blocks: [
        {
          kind: "sub",
          heading: "OpenAI",
          blocks: [
            {
              kind: "steps",
              items: [
                "Create a key at <https://platform.openai.com/api-keys>.",
                "Paste it into the **OpenAI** card and click **Test connection**.",
                "Leave **Reasoning effort** on **Provider default** unless the model is a reasoning model. OpenAI refuses the setting on other models.",
              ],
            },
          ],
        },
        {
          kind: "sub",
          heading: "Anthropic (Claude)",
          blocks: [
            {
              kind: "steps",
              items: [
                "Create a key in the Claude Console at <https://platform.claude.com>.",
                "Paste it into the **Anthropic** card and click **Test connection**.",
              ],
            },
            {
              kind: "p",
              text: "Obelus sends the two headers Anthropic requires for browser requests, so there is nothing else to set. If your organization has zero data retention (ZDR), Anthropic does not answer browser requests. Use a key from an organization without ZDR.",
            },
          ],
        },
        {
          kind: "sub",
          heading: "Google Gemini",
          blocks: [
            {
              kind: "steps",
              items: [
                "Create a key in Google AI Studio at <https://aistudio.google.com/apikey>.",
                "Paste it into the **Gemini** card and click **Test connection**.",
              ],
            },
            {
              kind: "p",
              text: "Gemini 3 models cannot turn thinking off. **Off** sends their lowest level instead.",
            },
          ],
        },
        {
          kind: "sub",
          heading: "OpenRouter",
          blocks: [
            {
              kind: "steps",
              items: [
                "Create a key at <https://openrouter.ai/settings/keys>.",
                "Paste it into the **OpenRouter** card and click **Test connection**.",
                "Pick a model id in the form `author/model`, such as `anthropic/claude-opus-5` or `openai/gpt-5.2`.",
              ],
            },
            {
              kind: "p",
              text: "One OpenRouter key reaches models from many Providers, including open models such as GLM, Kimi and DeepSeek. It is the simplest way to use open models without installing anything.",
            },
          ],
        },
        {
          kind: "sub",
          heading: "Ollama on your computer",
          blocks: [
            {
              kind: "steps",
              items: [
                "Install Ollama from <https://ollama.com> and open it. You can also run `ollama serve` in a terminal.",
                "Get a model. To run one on your computer, run `ollama pull` with the model's name. To use Ollama's cloud models, run `ollama signin` once.",
                "Leave **API key** empty on the **Ollama (local)** card.",
              ],
            },
            ...ollamaAllowSteps,
            {
              kind: "steps",
              items: [
                "Click **Test connection** on the **Ollama (local)** card. If the browser asks to reach devices on your local network, allow it.",
                "In **Slots**, click **List** and pick a model. `ollama list` in a terminal shows the same names.",
              ],
            },
          ],
        },
        {
          kind: "sub",
          heading: "Ollama cloud models",
          blocks: [
            {
              kind: "p",
              text: "Use them through the **Ollama (local)** card, not through `ollama.com`. Run `ollama signin` once, then pick a model whose name ends in `:cloud`, such as `glm-5.3:cloud`. The Ollama app sends the request with your account, so Obelus needs no key.",
            },
            {
              kind: "p",
              text: "A custom Connection pointed at `https://ollama.com` always fails, whatever key it holds. **About sending requests from your browser** explains why.",
            },
          ],
        },
        {
          kind: "sub",
          heading: "Any other OpenAI-compatible server",
          blocks: [
            {
              kind: "steps",
              items: [
                "Click **Add custom connection**.",
                "Set **Base URL** to the server's OpenAI-compatible root. It usually ends in `/v1`.",
                "Enter a key if the server needs one, then click **Test connection**.",
              ],
            },
            {
              kind: "p",
              text: "The server must answer browser requests from this site. If it does not, the test fails with \"Failed to fetch\". Check the server's CORS setting.",
            },
          ],
        },
      ],
    },
    {
      id: "choose-models",
      mode: "How-to",
      heading: "Choose models for the Critic and the Judge",
      blocks: [
        {
          kind: "list",
          items: [
            "**For the Critic,** pick a capable model that follows instructions and returns JSON reliably. The Critic runs every model pass. Small models more often return JSON Obelus cannot read, or praise, which the praise linter strikes through.",
            "**For the Judge,** pick a different Provider, or at least a different model. A Judge that shares the Critic's model shares its habits. If you leave **Judge** unset, Obelus chooses another Connection: first one on a different Provider with a different model, then any different Provider, then any different model.",
            "**For thinking models,** set **Reasoning effort** to **Low** or **Off**. A pass needs a short trace and a complete JSON answer. A high effort can spend the whole output budget before the answer starts.",
            "**To see costs,** fill in the **Price table** under **Runs**. Obelus then shows an estimate before a Run.",
            "**To pay nothing,** use rule passes, a model running in local Ollama, or a free model on OpenRouter.",
          ],
        },
        {
          kind: "p",
          text: "Model ids are free text. A model released today works without an Obelus update: type its id, or click **List**.",
        },
      ],
    },
    {
      id: "providers-reference",
      mode: "Reference",
      heading: "Providers at a glance",
      blocks: [
        {
          kind: "table",
          head: ["Provider", "Base URL", "Key", "Protocol", "Notes"],
          rows: [
            ["OpenAI", `\`${baseUrlOf("openai")}\``, "Required", "`openai-shaped`", "Refuses **Reasoning effort** on non-reasoning models."],
            ["Anthropic", `\`${baseUrlOf("anthropic")}\``, "Required", "`anthropic-shaped`", "No browser access for organizations with ZDR."],
            ["Gemini", `\`${baseUrlOf("gemini")}\``, "Required", "`gemini-native`", "Gemini 3 cannot turn thinking off."],
            ["OpenRouter", `\`${baseUrlOf("openrouter")}\``, "Required", "`openai-shaped`", "Model ids are `author/model`."],
            ["Ollama (local)", `\`${baseUrlOf("ollama")}\``, "None", "`openai-shaped`", `Needs \`OLLAMA_ORIGINS\` for a deployed site. Caps a response at ${OLLAMA_MAX_OUTPUT_TOKENS} tokens.`],
            ["Custom", "You set it", "If the server needs one", "`openai-shaped`", "The server must answer browser requests."],
            ["Ollama Cloud (`ollama.com`)", "Not supported", "Not usable", "None", "Does not answer browser requests. Use its models through Ollama (local)."],
          ],
        },
        {
          kind: "p",
          text: "The base URL of a built-in card cannot be edited. A custom Connection's can.",
        },
      ],
    },
    {
      id: "connection-reference",
      mode: "Reference",
      heading: "Connection settings",
      blocks: [
        {
          kind: "table",
          head: ["Setting", "What it does", "Default"],
          rows: [
            ["**Base URL**", "The root every request goes to. Obelus refuses to send a request anywhere outside it.", "Set by the card"],
            ["**API key**", "Sent only to the base URL: as `Authorization: Bearer` for OpenAI-shaped, `x-api-key` for Anthropic, and `x-goog-api-key` for Gemini.", "Empty"],
            ["**Key storage**", "**This browser** keeps the key in this browser's storage. **This session only** keeps it in memory, so it is gone after a reload.", "This browser"],
            ["**Max output tokens**", "The most the model may write in one answer, reasoning included.", `${DEFAULT_MAX_OUTPUT_TOKENS}. Ollama: ${OLLAMA_MAX_OUTPUT_TOKENS}.`],
            ["**Reasoning effort**", "How much the model may think before it answers. **Provider default** sends nothing.", "Provider default. Ollama: Low."],
            ["**In flight**", "The most requests this Connection runs at once. The rest wait in a visible queue.", `${DEFAULT_CONCURRENCY}, from 1 to 16`],
            ["**Test connection**", "Asks the Provider for its model list. It costs nothing and proves the base URL and key work.", "None"],
          ],
        },
        {
          kind: "p",
          text: "A Backup leaves API keys out unless you choose to include them.",
        },
      ],
    },
    {
      id: "effort-reference",
      mode: "Reference",
      heading: "Reasoning effort by Provider",
      blocks: [
        {
          kind: "p",
          text: "Each setting is translated to what the Provider accepts.",
        },
        {
          kind: "table",
          head: ["Setting", "OpenAI-shaped", "Anthropic", "Gemini 3", "Gemini 2.5 (token budget)"],
          rows: [
            ["Provider default", "Not sent", "Not sent", "Not sent", "Not sent"],
            ["Off", "`none`", "Thinking disabled", "`minimal`", "0"],
            ["Minimal", "`minimal`", "`low`", "`minimal`", "512"],
            ["Low", "`low`", "`low`", "`low`", "1024"],
            ["Medium", "`medium`", "`medium`", "`medium`", "8192"],
            ["High", "`high`", "`high`", "`high`", "24576"],
            ["Extra high", "`xhigh`", "`xhigh`", "`high`", "24576"],
            ["Max", "`max`", "`max`", "`high`", "24576"],
          ],
        },
        {
          kind: "p",
          text: "Some models refuse some settings, and the Provider's error says so. Claude Fable and Claude Opus 5.5 always think and refuse **Off**. Claude Haiku 4.5 refuses **Minimal** through **Max**. Gemini 2.5 Pro refuses **Off**. OpenAI's non-reasoning models refuse every setting except **Provider default**.",
        },
      ],
    },
    {
      id: "runs-reference",
      mode: "Reference",
      heading: "Slots and run settings",
      blocks: [
        {
          kind: "table",
          head: ["Setting", "What it does", "Default"],
          rows: [
            ["**Critic**", "The Connection and model that run model passes.", "Not set"],
            ["**Judge**", "The Connection and model that compare two versions of a passage. It receives the two passages and nothing else, and runs twice with the labels swapped.", "Another Connection, chosen by Obelus"],
            ["**Model**", "The model id for the Slot. Empty uses the Connection's own model.", "Empty"],
            ["**Screening frame**", "Tells the Critic to read as an editor screening a submission.", "Off"],
            ["**Show the raw provider response**", "Shows each Finding's raw model output in the Rail, so you can check the praise linter yourself.", "Off"],
            ["**Character limit**", `The most text one request carries. A longer Document is split at Section boundaries, and each chunk repeats about ${CHUNK_OVERLAP} characters of the text before it.`, `${DEFAULT_CHARACTER_LIMIT.toLocaleString("en-US")}, at least ${MIN_CHARACTER_LIMIT}`],
            ["**Voice list**", "Words and phrases you have declared yours. Rule passes skip them, and model passes are told not to flag them.", "Empty"],
            ["**Price table**", "USD per million tokens, per model id or id prefix. The estimate is characters ÷ 4 times the price. It never blocks a Run.", "Empty"],
          ],
        },
      ],
    },
    {
      id: "limits-reference",
      mode: "Reference",
      heading: "Limits on every request",
      blocks: [
        {
          kind: "table",
          head: ["Limit", "Value"],
          rows: [
            ["Attempts on a 429 or a 5xx answer", `${DEFAULT_MAX_ATTEMPTS} in total`],
            ["Wait between attempts", `The Provider's \`Retry-After\` when it sends one. Otherwise ${seconds(DEFAULT_BASE_DELAY_MS)}, doubling each time, up to ${seconds(MAX_DELAY_MS)}.`],
            ["Time for one attempt", `${TIMEOUT_MINUTES} minutes, from sending to the last byte. A timed-out attempt is not retried.`],
            ["Requests in flight", `**In flight** per Connection, ${DEFAULT_CONCURRENCY} by default`],
            ["Answer cut off at the output ceiling", "Refused whole, because a pass answer is JSON and half of it is unreadable"],
            ["Where a request may go", "Only to the Connection's base URL, on the same scheme, host and port, at or under its path"],
          ],
        },
      ],
    },
    {
      id: "errors-reference",
      mode: "Reference",
      heading: "Errors and what to do",
      blocks: [
        {
          kind: "p",
          text: "An error from a Provider quotes the Provider's own words after the status code.",
        },
        {
          kind: "table",
          head: ["Message starts with", "Cause", "What to do"],
          rows: [
            ["Could not reach the … Connection: Failed to fetch", "No readable answer came back. The base URL is wrong, the Provider refused the browser, or the key is wrong. OpenAI answers a wrong key in a form the browser cannot read.", "Check the base URL and the key, then click **Test connection**."],
            ["Could not reach the Ollama (local) Connection", "Ollama is not running, or it has not been told to allow this site.", "Follow the Ollama steps above, or open **Setting up local Ollama** on the card."],
            ["ollama.com does not accept requests from a browser", "The Connection points at Ollama Cloud directly.", "Use the **Ollama (local)** card with a `:cloud` model."],
            ["The … Connection returned 401 or 403", "The key is wrong, revoked, or lacks access to the model.", "Create a new key and paste it in."],
            ["The … Connection returned 400", "The Provider refused part of the request, often **Reasoning effort** or the model id.", "Set **Reasoning effort** to **Provider default**, or pick another level."],
            ["The … Connection returned 404", "The model id does not exist on that Provider.", "Click **List** in **Slots** and pick a listed id."],
            ["The … Connection returned 429", "Rate limit, or no credit left. Obelus already retried.", "Wait, lower **In flight**, or add credit."],
            ["The … Connection returned 5xx", "The Provider failed. Obelus already retried.", "Try again later."],
            [`The … Connection did not respond within ${TIMEOUT_MINUTES} minutes`, "The Provider accepted the request and stalled.", "Try again. Lower **Reasoning effort** or the **Character limit** to shorten the work."],
            ["The Provider stopped at the output ceiling", "The answer did not fit in **Max output tokens**.", "Raise **Max output tokens**, or lower **Reasoning effort**."],
            ["The Provider returned no text", "The model spent its whole budget thinking, or sent nothing.", "Lower **Reasoning effort**, or raise **Max output tokens**."],
            ["Session key not set", "The key was kept for this session only, and the page was reloaded.", "Paste the key again, or switch **Key storage** to **This browser**."],
          ],
        },
      ],
    },
    {
      id: "browser-explanation",
      mode: "Explanation",
      heading: "About sending requests from your browser",
      blocks: [
        {
          kind: "p",
          text: "Obelus has no server between you and the model. Your browser sends each request straight to the Provider you configured, with your key. Nobody else sees your Document or your key on the way, including the people who make Obelus. That is the whole privacy claim, and it is why some things are impossible here.",
        },
        {
          kind: "p",
          text: "Before a web page calls another site, the browser asks that site whether it accepts calls from the page. This check is called CORS, and the Provider decides the answer. OpenAI, Anthropic, Google and OpenRouter say yes. Ollama Cloud says no. Local Ollama says yes only to sites its owner allows, because otherwise any website you visit could use the models on your computer.",
        },
        {
          kind: "p",
          text: "A server run by Obelus could call Ollama Cloud for you. It would also see every key and every Document that passed through it, so Obelus does not have one. A program on your own computer can make the call instead, and the Ollama app does exactly that for `:cloud` models. Tools that run in a terminal reach Ollama Cloud directly for the same reason: CORS applies only to web pages.",
        },
        {
          kind: "p",
          text: "The cost of this design is that your key lives in this browser. Anyone who can use this browser profile can read it. Every Provider warns against keys in browser code for that reason. On a shared computer, choose **This session only**, and prefer a key with a spending limit.",
        },
      ],
    },
    {
      id: "model-sees-explanation",
      mode: "Explanation",
      heading: "About what a model sees and what it can do",
      blocks: [
        {
          kind: "p",
          text: "A model pass sends the pass's instructions, your Voice list and the text the pass targets. A paragraph pass also sends one Paragraph either side and the heading outline, never the rest of the body. A Section pass sends that Section, and a Document pass sends the whole Document in chunks. The Judge receives two passages labelled A and B and nothing else, so it cannot favour the one you wrote last. The Provider's own data policy governs what happens to the text after it arrives, so read it before you send anything private.",
        },
        {
          kind: "p",
          text: "A model can only mark. Its answer arrives as Findings anchored to quotes from your text, and the answer's shape has no field for rewritten prose. No control in Obelus puts model text into a Document, so changing Provider or model changes the quality of the marks, never who holds the pen.",
        },
      ],
    },
  ];
}
