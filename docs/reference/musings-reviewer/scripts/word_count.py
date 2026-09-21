#!/usr/bin/env python3
"""Deterministic Unicode-aware word counter for short prose."""

import re
import sys

# Count runs of Unicode letters/numbers as words, keeping internal punctuation that
# commonly belongs inside one token. Examples: "don't", "one-sitting", "O9X",
# "8.0", and "1,000" each count as one word.
WORD_RE = re.compile(r"[^\W_]+(?:[.,'’\-][^\W_]+)*", re.UNICODE)


def count_words(text: str) -> int:
    return len(WORD_RE.findall(text))


def main() -> None:
    print(count_words(sys.stdin.read()))


if __name__ == "__main__":
    main()
