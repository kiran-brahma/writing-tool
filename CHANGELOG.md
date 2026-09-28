# Changelog

All notable changes to Obelus are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). `docs/releasing.md` describes how a
release is cut.

## [Unreleased]

## [0.3.0] - 2026-09-28

### Added

- AI Settings has a **Guide** page: how to connect OpenAI, Anthropic, Gemini, OpenRouter, local
  Ollama, Ollama cloud models and custom servers; how to choose models for the Critic and the
  Judge; every Connection, Slot and run setting; the limits on each request; each error with its
  cause and fix; and why requests leave from your browser.

### Fixed

- When local Ollama cannot be reached, the error now says why and what to do: it names the
  `OLLAMA_ORIGINS` command for this site instead of asking you to check a key Ollama does not use.
  The Ollama (local) card in AI Settings has setup steps for macOS, Windows and Linux with the
  site's address filled in, and opens them when "Test connection" fails.
- A custom Connection pointed at `ollama.com` now explains why it fails: Ollama Cloud does not
  accept requests from a browser, whatever the key. The error points to the Ollama (local)
  Connection with `ollama signin` and a `:cloud` model instead.

## [0.2.0] - 2026-09-27

### Added

- Reasoning effort now offers Off (no thinking), Minimal, Extra high and Max alongside Low, Medium
  and High, with clearer labels. It now reaches Anthropic and Gemini Connections too, not only the
  OpenAI-compatible ones.

### Fixed

- Thinking models no longer run out of output budget before answering a model pass. Passes stop
  asking the model for character offsets, which it spent its whole budget counting; Obelus finds
  each quote itself. The Topic strings pass also caps its findings at ten and asks for short quotes.
  An existing library keeps its saved Starter passes, so use Restore the Starter pack to pick up
  the new prompts.
- Anthropic Connections work with current Claude models. Obelus no longer sends a temperature,
  which Claude models released after Opus 4.6 reject.

## [0.1.0] - 2026-09-26

The first tagged release. It covers the v1 spec through v1.3 (the page and the mark), as deployed to
Cloudflare Workers.

### Added

- Rich-text editor with a library of documents, tags, search and status; automatic and milestone
  revisions; a word-level diff; Markdown import and export; whole-library backup and restore; and a
  single-document bundle.
- Rule passes that run on save, offline and with no API key: hedges and intensifiers,
  nominalizations, throat-clearing openers, wordy constructions, repeated words and openers, the
  passive pass at note severity, and sentence-rhythm metrics. Their word lists and patterns are
  editable, and the Voice list silences rules.
- Model passes that return findings anchored to quotes, with praise struck through rather than
  hidden. They include per-pass screening frames, the reader pass, and a pass workbench whose
  assistant works on prompts and never on prose.
- The Judge, which compares two revisions twice with the labels swapped, defaults to a different
  Connection from the Critic, and records a session-only calibration prediction.
- Connections for OpenAI, Anthropic, Google Gemini, OpenRouter, local Ollama and Custom endpoints,
  with output ceiling and reasoning effort controls, cost estimates, and bounded calls so a stalled
  Provider cannot hold the mutation lock.
- The Working order rail with Findings and Judge modes, the Current Finding, a Callout on each
  Highlight, margin marks beside Paragraphs with open Findings, and the Outline in the left margin
  on wide screens.
- Literata type, a reading measure, the Status line, a dark scheme with a Light | Dark | System
  choice, a narrow layout where the Rail overlays the prose, plain-language glosses, and
  accessibility work on the rail, announcements and contrast.
- A Privacy page that lists where data lives and how to verify the single-origin claim in DevTools.
- An offline shell: the app opens with existing documents without a network.
- PNG app icons (192, 512, maskable 512) and an Apple touch icon, so the app installs with its own
  icon on iOS, Android and desktop Chrome.
- README instructions for installing Obelus as an app, and for allowing the deployed origins in
  `OLLAMA_ORIGINS` so local Ollama, and Ollama Cloud models through the local daemon, work from the
  deployed site.

### Changed

- The web app manifest has a stable `id`, and its `theme_color` matches the light background, so an
  installed window's title bar no longer flashes dark.

[Unreleased]: https://github.com/kiran-brahma/writing-tool/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/kiran-brahma/writing-tool/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kiran-brahma/writing-tool/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kiran-brahma/writing-tool/releases/tag/v0.1.0
