# Native select transport boundary

The keyboard-focus and keyboard-focus-committed runs remain failures. Adding Enter did NOT resolve the issue, so the earlier commit hypothesis in the first DIAGNOSIS is superseded, not accepted as cause.

A separate plain HTML select with A/B/C options on a data URL retained C after ArrowUp for nativeVirtualKeyCode38, omitted, and126. It also retained C using rawKeyDown with Page.bringToFront and document.hasFocus true. See native-key-diagnostic.json and native-key-raw-diagnostic.json plus their source/logs. This isolates the default-action anomaly outside production, but does not establish a complete cause. No more product retries were made. A first about:blank diagnostic raced initial document navigation and lost its inserted select; the stable data-URL diagnostic avoids that unrelated setup failure.

Product callbacks and projections pass on actual select change events, while trusted key events passed for row activation/removal, source Enter/Back, Escape, Delete and resizer. Keyboard-only option selection is still unverified and must not be restamped as passed or automatically classified as a product defect. No installed/native inference.
