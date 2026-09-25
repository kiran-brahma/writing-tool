import { useEffect, useRef, useState, type ChangeEvent } from "react";

export interface DocumentMenuProps {
  wordCount: number;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  canExport?: boolean;
}

/**
 * Story 191: Document actions (Import Markdown, Export Markdown, word count)
 * behind one control, separated from navigation.
 */
export function DocumentMenu({
  wordCount,
  onExport,
  onImport,
  canExport = true,
}: DocumentMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape and return focus to trigger button
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

  // Close on outside pointer click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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
        className="flex items-center gap-1.5 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600 transition-colors"
      >
        <span>Document</span>
        <span aria-hidden="true" className="text-stone-400">
          ▾
        </span>
      </button>

      {open && (
        <div
          id="document-actions-menu"
          role="menu"
          aria-label="Document actions"
          className="absolute left-0 top-full mt-1.5 w-44 rounded border border-stone-200 bg-white py-1 shadow-md z-30"
        >
          <div className="border-b border-stone-100 px-3 py-1.5 text-xs text-stone-500">
            <span className="font-semibold text-stone-700">
              {wordCount.toLocaleString()}
            </span>{" "}
            {wordCount === 1 ? "word" : "words"}
          </div>
          <label className="flex w-full cursor-pointer items-center px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 transition-colors">
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
            className="flex w-full items-center px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
          >
            Export Markdown
          </button>
        </div>
      )}
    </div>
  );
}
