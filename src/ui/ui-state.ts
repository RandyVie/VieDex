// Per-tab UI state. Kept in memory on purpose: queries and titles stay out of the URL.
export const ui = {
  query: '',
  /** Title handed from a broken wikilink to the new-note form. */
  pendingTitle: '',
  expanded: new Set<string>(),
};
