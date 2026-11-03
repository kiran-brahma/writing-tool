import { useEffect, useRef, useState, type ChangeEvent } from "react";

export interface DocumentMenuProps {
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  /** Flags the current revision as a milestone for the Judge. */
  onFlagVersion: () => void;
  /** Starts a new empty Document without leaving the Editor. */
  onNew: () => void;
  canExport?: boolean;
  canFlag?: boolean;
}

/**
 * Document actions behind one control: start a new Document, import and export
 * Markdown, and flag the current version. The word count is not here: the
 * Status line carries it.
 */
export function DocumentMenu({
  onExport,
  onImport,
  onFlagVersion,
  onNew,
  canExport = true,
  canFlag = true,
}: DocumentMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const handleExport = () => {
    if (!canExport) return;
    setOpen(false);
    onExport();
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    setOpen(false);
    void onImport(event);
  };

  const handleFlag = () => {
    if (!canFlag) return;
    setOpen(false);
    onFlagVersion();
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left shrink-0">
      <button
        ref={buttonRef}
        type="button"
        id="document-actions-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "document-actions-menu" : undefined}
        aria-label="Document actions"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-colors"
      >
        <span>Document</span>
        <span aria-hidden="true" className="text-ghost-ink">
          ▾
        </span>
      </button>

      {open && (
        <div
          id="document-actions-menu"
          role="menu"
          aria-label="Document actions"
          className="absolute left-0 top-full mt-1.5 w-48 rounded border border-rule-soft bg-paper py-1 shadow-md z-30"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className="flex w-full items-center px-3 py-1.5 text-xs text-quiet-ink hover:bg-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-colors text-left"
          >
            New document
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleFlag}
            disabled={!canFlag}
            className="flex w-full items-center px-3 py-1.5 text-xs text-quiet-ink hover:bg-ground disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-colors text-left"
          >
            Flag this version
          </button>
          <label className="flex w-full cursor-pointer items-center px-3 py-1.5 text-xs text-quiet-ink hover:bg-ground has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-focus transition-colors">
            Import Markdown
            <input
              type="file"
              accept=".md,.markdown,text/markdown"
              className="sr-only"
              onChange={handleImport}
            />
          </label>
          <button
            type="button"
            role="menuitem"
            onClick={handleExport}
            disabled={!canExport}
            className="flex w-full items-center px-3 py-1.5 text-xs text-quiet-ink hover:bg-ground disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-colors text-left"
          >
            Export Markdown
          </button>
        </div>
      )}
    </div>
  );
}
