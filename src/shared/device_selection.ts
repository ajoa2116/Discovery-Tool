/** Whether a nonempty displayed selection is fully selected, independently of hidden IDs. */
export function allVisibleSelected(selected: ReadonlySet<string>, visible: ReadonlySet<string>): boolean {
  return visible.size > 0 && [...visible].every(id => selected.has(id));
}

/** Toggle displayed rows only; preserve hidden selection and both input sets. */
export function toggleVisibleSelection(selected: ReadonlySet<string>, visible: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  const remove = allVisibleSelected(selected, visible);
  for (const id of visible) {
    if (remove) next.delete(id);
    else next.add(id);
  }
  return next;
}
