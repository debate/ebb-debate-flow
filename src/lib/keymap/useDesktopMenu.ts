"use client";

import { useEffect } from "react";

import { executeCommand } from "@/lib/commands/commands";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { isDesktop } from "@/lib/update/adapter";

/**
 * Bridges the native menu to the command layer. Menu items carry a CommandId
 * as their id and emit "menu:command" on click (see `src-tauri/src/menu.rs`);
 * here we run the matching command. Clicking is the menu's only action path -
 * its chords are display-only text, never real accelerators, because those
 * chords belong to the JS keymap.
 */
export function useDesktopMenu(): void {
    useEffect(() => {
        if (!isDesktop()) return;

        let active = true;
        let unlisten: (() => void) | undefined;

        import("@tauri-apps/api/event").then(({ listen }) =>
            listen<string>("menu:command", (e) => {
                if (e.payload in COMMANDS) executeCommand(e.payload as CommandId);
            }).then((un) => {
                if (active) unlisten = un;
                else un();
            }),
        );

        return () => {
            active = false;
            unlisten?.();
        };
    }, []);
}
