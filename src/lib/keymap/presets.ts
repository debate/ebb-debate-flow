/**
 * Single flat modeless keymap preset.
 *
 * Chord strings are canonical (see resolve.ts / eventToChord).
 * There is no vim/move mode layer — one binding map for everything.
 * Grab-move is handled by a transient override in useKeymap.
 */

import type { CommandId } from "@/lib/commands/registry";
import type { Chord, Keymap } from "./types";

/** Ctrl+1 .. Ctrl+9 → sheet.jump1 .. sheet.jump9 */
const SHEET_JUMPS: Record<Chord, CommandId> = {
    "Ctrl+1": "sheet.jump1",
    "Ctrl+2": "sheet.jump2",
    "Ctrl+3": "sheet.jump3",
    "Ctrl+4": "sheet.jump4",
    "Ctrl+5": "sheet.jump5",
    "Ctrl+6": "sheet.jump6",
    "Ctrl+7": "sheet.jump7",
    "Ctrl+8": "sheet.jump8",
    "Ctrl+9": "sheet.jump9",
};

/**
 * The single flat keymap. All navigation, creation, and utility chords live
 * here. During a grab-move (moveSource !== null), Enter/Escape are temporarily
 * overridden to move.commit / move.cancel by the useKeymap hook.
 */
export const FLAT_KEYMAP: Keymap = {
    name: "default",
    bindings: {
        // ── Navigation ────────────────────────────────────────────────────────
        ArrowLeft: "move.left",
        ArrowDown: "move.down",
        ArrowUp: "move.up",
        ArrowRight: "move.right",
        Tab: "move.right",
        "Shift+Tab": "move.left",

        // ── Node creation ─────────────────────────────────────────────────────
        Enter: "node.sibling",
        "Shift+Enter": "node.response",

        // ── Row operations ────────────────────────────────────────────────────
        "Ctrl+Backspace": "row.delete",

        // ── Cell operations ───────────────────────────────────────────────────
        Delete: "cell.clear",
        "Ctrl+Shift+Backspace": "node.deleteSubtree",

        // ── Grab move ─────────────────────────────────────────────────────────
        "Ctrl+m": "move.grab",

        // ── Edit ──────────────────────────────────────────────────────────────
        "Ctrl+z": "edit.undo",
        "Ctrl+Shift+z": "edit.redo",

        // ── Status / format ───────────────────────────────────────────────────
        "Ctrl+b": "format.toggleBold",
        "Ctrl+Shift+x": "status.toggleConceded",
        "Ctrl+e": "status.toggleExtended",

        // ── Sheets ────────────────────────────────────────────────────────────
        "]": "sheet.next",
        "[": "sheet.prev",
        "Ctrl+k": "sheet.quickSwitch",
        "Ctrl+a": "sheet.newAff",
        "Ctrl+n": "sheet.newNeg",
        "Ctrl+r": "sheet.rename",
        "Ctrl+,": "settings.open",
        "?": "help.open",
        ...SHEET_JUMPS,
    },
};

/**
 * Grab-move override bindings. When moveSource is active, these chords take
 * priority over the flat keymap for the duration of the grab.
 */
export const GRAB_BINDINGS: Record<Chord, CommandId> = {
    Enter: "move.commit",
    Escape: "move.cancel",
};

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Returns the flat preset keymap. */
export function getPresetKeymap(): Keymap {
    return FLAT_KEYMAP;
}
