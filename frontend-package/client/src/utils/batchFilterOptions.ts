export type BatchFilterOption = { value: string; label: string };

export function normalizeBatchFilterOptions(batches: unknown): BatchFilterOption[] {
  if (!Array.isArray(batches)) return [];
  return batches
    .map((b): BatchFilterOption | null => {
      if (typeof b === 'string') {
        const v = b.trim();
        return v ? { value: v, label: v } : null;
      }
      const o = b as { value?: string; label?: string };
      const value = String(o.value ?? '').trim();
      if (!value) return null;
      return { value, label: String(o.label ?? value) };
    })
    .filter((b): b is BatchFilterOption => b !== null);
}

export function batchGuidOf(item: Record<string, unknown>): string {
  const g = item.batchGuid ?? item['Batch GUID'];
  return g ? String(g).trim() : '';
}

export function matchesBatchFilter(item: Record<string, unknown>, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const id = batchGuidOf(item);
  if (id && selected.includes(id)) return true;
  const name = String(item.batchName ?? item['Batch Name'] ?? '');
  return name ? selected.includes(name) : false;
}
