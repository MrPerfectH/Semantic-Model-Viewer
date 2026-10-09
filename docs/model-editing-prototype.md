# Model editing interaction prototype

Question: can editing within the existing colored DAX workspace preserve the viewer's analysis/comparison flow?

This is a throwaway prototype for backlog #44. Production editing and PR #39 remain deferred. User acceptance is pending; a working prototype does not authorize merging or production implementation.

Run from this checkout:

```sh
python3 Models/tools/viewer/scripts/serve.py --port 8932
```

Open http://localhost:8932/editing-prototype.html?variant=inline. The prototype uses the real app shell, measure library, graph and DAX cards with a synthetic in-memory model. Its host has no filesystem API, and normal source editing is disabled. Reload resets changes.

- Edit one measure through the quiet pencil in its card header.
- Change the colored formula in place; expand Properties for description/folder/format.
- Review formula and property changes together, go back, discard, or simulate saving.
- Keep the comparison selected through the draft/review/save flow.
- Try conflict arms a simulated source conflict for the next save; it preserves the draft.
- Selecting another analyzed measure or Overview asks what to do with the draft.
- In-pane and Docked switch between two structural proposals while retaining the draft.
- Relationship concept opens a static inspector proposal; relationship creation/saving is outside this prototype.

Verified through rendered browser interactions: edit/properties/review/save result, preserved comparison, simulated conflict preserving draft and unchanged saved sample, discard, navigation guard, variant switching and relationship concept. No tests added to the throwaway prototype.

Decision to retain: **pending user feedback**. If accepted, absorb only the approved interaction into production; otherwise revise/delete these prototype-only files. Do not merge the experimental editor on the strength of this artifact.
