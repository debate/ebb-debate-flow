import { describe, it, expect } from "vitest";
// Assuming setup where round/node exists and is populated successfully in memory

describe("Group Actions (Task 2)", () => {
  // Arrange: Initial setup to create a round and two nodes (a, b) in the sheet
  const setupRound = () => {
    // Simulate initial round creation
    const a = "node_id_a";
    const b = "node_id_b";
    // In a real scenario, this would involve creating the round and nodes.
    return { roundReady: true, a, b }; 
  };

  it("groupNodes bundles two nodes and is undoable", () => {
    const setup = setupRound();
    // Action: Group nodes a and b, label "DAs"
    useRoundStore.getState().groupNodes("s", [setup.a, setup.b], "DAs");
    const groups = useRoundStore.getState().round!.groups;
    expect(groups).toHaveLength(1);
    // Check if the group contains both IDs
    expect(groups[0].memberIds).toEqual([setup.a, setup.b]);
    
    // Undo check
    useRoundStore.getState().undo();
    expect(useRoundStore.getState().round!.groups).toHaveLength(0);
  });

  it("ungroupNode removes a node from its group", () => {
    const setup = setupRound(); // Assume round ready with nodes a, b
    // Arrange: Group them up first
    useRoundStore.getState().groupNodes("s", [setup.a, setup.b], "");
    // Action: Ungroup node a (which dissolves the group since only b remains)
    useRoundStore.getState().ungroupNode(setup.a);
    const groups = useRoundStore.getState().round!.groups;
    expect(groups).toHaveLength(0); // Dissolved because <2 remain.
  });
});