/**
 * The Obelus shell. In this ticket it exists only to prove the build: React,
 * TypeScript and Tailwind produce a page. No editor, no Document, no storage,
 * no Provider.
 */
export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-stone-50 text-stone-900">
      <h1 className="text-3xl font-semibold tracking-tight">Obelus</h1>
      <p className="text-sm text-stone-500">It marks; it never holds the pen.</p>
    </main>
  );
}
