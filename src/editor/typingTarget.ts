/**
 * Whether a key event is headed for a field or the Editor, where an ordinary
 * letter is part of the prose rather than a queue command. Shared by the rail's
 * queue keys and the shell's app-wide `?`, so both agree on what "typing" means.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}
