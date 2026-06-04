/** Common types used across FlowGrid components. */

// ... (other imports and types)

export interface ArgGroup {
  id: string;
  sheetId: string;
  label: string;
  /** Node ids bundled together (same column). */
  memberIds: string[];
}

// ... (other types)

export interface Round {
  id: string;
  sheetId: string;
  nodes: ArgumentNode[];
  /** Group overlays (labeled brackets). */
  groups?: ArgGroup[]; // Making it optional initially before Task 1 commits fully
}