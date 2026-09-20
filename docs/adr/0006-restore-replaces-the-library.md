# Restoring a Backup replaces the Library

A Backup is a snapshot of the whole Library, so restoring it replaces every Document, Revision,
Finding, setting and Connection in this browser. Merging was rejected: a merge would leave Documents
the snapshot never contained and make "what does this file recover?" ambiguous, which defeats the
file's one job as a recovery path. The Writer confirms the replace explicitly, and any keys the
backup omitted are not treated as instructions to delete the keys already on this browser.

## Considered Options

- **Merge/upsert the backup into the existing Library.** Rejected: it makes the file additive rather
  than authoritative, so a cleared browser and a half-full one would recover different states from
  the same file.
- **Always keep the browser's own API keys, even when the backup carries keys.** Rejected: a backup
  made with the key opt-in is the Writer's deliberate record, and its keys should win.

## Consequences

A restore is destructive, so the shell gated it behind an explicit confirmation. When a backup
excluded keys, the persisted keys already on this browser survive the replace; a backup that included
keys overwrites them.
