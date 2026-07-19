"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import type { EventId } from "@/lib/format/events";
import { makeFlowRound } from "@/lib/model/flow";
import type { Role, Side } from "@/lib/model/types";
import { persistFlow } from "@/lib/persistence/flowPersistence";

/**
 * useCreateFlow - single source of truth for spawning a new round.
 *
 * Creates a round for the given role, event, and speaking order (cross-
 * examination sheet + first flow sheet), persists it, and navigates into
 * the editor. Shared by the dashboard's New-flow menu and its first-run
 * empty state so both stay in lockstep.
 */
export function useCreateFlow() {
    const router = useRouter();

    return useCallback(
        (role: Role, event: EventId = "policy", firstSide: Side = "aff") => {
            const round = makeFlowRound({ role, event, firstSide });
            void persistFlow(round).then(() => router.push(`/flow?id=${round.id}&new=1`));
        },
        [router],
    );
}
