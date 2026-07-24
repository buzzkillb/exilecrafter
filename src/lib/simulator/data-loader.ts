/**
 * Data loader for the simulator page.
 * Accepts DOM element references as parameters so it stays testable
 * and doesn't depend on the page template.
 */
import {
  setCurrencyData, setOmensData, setModsData, setWeightsData,
  currentBase,
} from './store';

export interface DataLoaderDeps {
  loadingState: HTMLElement;
  emptyState: HTMLElement;
}

export async function loadData(deps: DataLoaderDeps) {
  // If data was already provided externally (e.g. by an e2e test), skip fetch
  if ((window as any).__e2eData) {
    const d = (window as any).__e2eData;
    setCurrencyData(d.currency);
    setOmensData(d.omens);
    setModsData(d.mods);
    setWeightsData(d.weights);
    finishLoad(deps);
    return;
  }
  try {
    const [currencyRes, omensRes, modsRes, weightsRes] = await Promise.all([
      fetch('/data/currency.json'),
      fetch('/data/omens.json'),
      fetch('/data/mods.json'),
      fetch('/data/weights.json'),
    ]);
    if (!currencyRes.ok || !omensRes.ok || !modsRes.ok || !weightsRes.ok) {
      throw new Error('Failed to load data files');
    }
    setCurrencyData(await currencyRes.json());
    setOmensData(await omensRes.json());
    setModsData(await modsRes.json());
    setWeightsData(await weightsRes.json());
    finishLoad(deps);
  } catch (err) {
    console.error('Failed to load data:', err);
    deps.loadingState.innerHTML = `
      <div class="text-3xl mb-2">❌</div>
      <div class="font-display text-xl text-fg mb-1">Failed to load data</div>
      <p class="text-sm text-dim">${err instanceof Error ? err.message : 'Unknown error'}</p>
      <button onclick="location.reload()" class="btn btn-gold mt-4">Retry</button>
    `;
  }
}

export function finishLoad(deps: DataLoaderDeps) {
  // Always hide the loading spinner — it has no business staying visible
  deps.loadingState.classList.add('hidden');
  // Show the empty state only if no base is selected and main UI isn't visible
  if (currentBase) return;
  deps.emptyState.classList.remove('hidden');
}
