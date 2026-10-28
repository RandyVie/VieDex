export interface View {
  el: HTMLElement;
  /** Re-render when the index changes. Off for views holding user input. */
  live?: boolean;
  /** Return false to block leaving, e.g. unsaved edits. */
  canLeave?: () => Promise<boolean>;
  dispose?: () => void;
}
