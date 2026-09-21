import { useEffect, useState } from "react";

/** The elapsed time of an in-flight run, refreshed while it runs. */
export function ElapsedTimer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = globalThis.setInterval(() => setNow(Date.now()), 100);
    return () => globalThis.clearInterval(interval);
  }, []);

  return <span className="tabular-nums">{((now - since) / 1000).toFixed(1)}s</span>;
}
