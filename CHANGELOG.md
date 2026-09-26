# Changelog

All notable changes to Obelus are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). `docs/releasing.md` describes how a
release is cut.

## [Unreleased]

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

[Unreleased]: https://github.com/kiran-brahma/writing-tool/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kiran-brahma/writing-tool/releases/tag/v0.1.0
