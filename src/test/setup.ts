// A real browser IndexedDB is not present under the Node test runner, so the
// suite installs fake-indexeddb globally. Storage code is exercised against an
// in-memory implementation with no production interface introduced for testing.
// IndexedDB is deliberately not a seam: AGENTS.md names `send(ModelRequest)`
// as the only one.
import "fake-indexeddb/auto";
