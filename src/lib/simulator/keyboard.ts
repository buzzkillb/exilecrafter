/**
 * Keyboard shortcuts for the simulator page.
 * Built from OP_KEYBOARD_HINTS once at module load.
 * Returns a dispose() function for clean teardown.
 */
import { OP_KEYBOARD_HINTS } from './operations';

export interface KeyboardDeps {
  currentItem: () => any;
  undoBtn: HTMLElement;
  flash: (msg: string, kind: 'ok' | 'error') => void;
  applyCraft: (opId: string) => void;
  getCurrencyAvailability: (item: any) => Record<string, { valid: boolean; reason?: string }>;
}

// Build once at module scope — not per call
const KEY_MAP: Record<string, string> = {};
for (const [op, key] of Object.entries(OP_KEYBOARD_HINTS)) {
  if (key) KEY_MAP[key.toLowerCase()] = op;
}

export function setupKeyboardShortcuts(deps: KeyboardDeps): () => void {
  const handler = (e: KeyboardEvent) => {
    const item = deps.currentItem();
    if (!item) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      deps.undoBtn.click();
      return;
    }
    const opId = KEY_MAP[key];
    if (opId) {
      e.preventDefault();
      const avail = deps.getCurrencyAvailability(item)[opId];
      if (!avail?.valid) { deps.flash(avail?.reason || 'Not available.', 'error'); return; }
      deps.applyCraft(opId);
    }
  };

  document.addEventListener('keydown', handler);

  // Return a dispose function for HMR-safe teardown
  return () => document.removeEventListener('keydown', handler);
}
