import { describe, it, expect } from "vitest";
// Assume commands execution context is ready

describe("Group Commands", () => {
  // Setup: Ready state where nodes a and b exist in the same sheet.
  const setup = () => { /* Setup Round with nodes a and b */ };

  it("group.withBelow groups the selected node with the node below it", () => {
    setup(); // Assume round is loaded
    // Select node 'a' (the upper node) and execute command
    executeCommand("group.withBelow"); 
    const groups = useRoundStore.getState().round!.groups;
    expect(groups).toHaveLength(1);
    // Verify the group contains both members
    expect(new Set(groups[0].memberIds)).toEqual(new Set(["a", "b"]));
  });

  it("group.ungroup removes the selected node's group", () => {
    setup(); // Assume round is loaded and a group exists
    // Execute command on selected node 'a'
    executeCommand("group.ungroup"); 
    const groups = useRoundStore.getState().round!.groups;
    expect(groups).toHaveLength(0); // Group dissolved successfully
  });
});