# Open Finder

Press a key and Finder opens the folder of the terminal you were in.

## What you see

Nothing in Herdr. Finder comes to the front with a window on the folder.

## How it behaves

- `cmd-o` opens the focused terminal's live folder in Finder.
- A space on another machine: an error toast, `This space is on <machine>, not this Mac.`
- A focused pane with no folder (a mod pane): an error toast, `The focused pane has no folder.`
- It shows no agent status.

## Built from

- `mods/finder-open/mod.json`:
  `{ "place": "none", "title": "Open Finder", "overlay": { "kind": "popup", "width": 1, "height": 1, "frame": "none" } }`.
- `mods/finder-open/main.js`: a `View` that draws an empty `div()`. In `init`, when
  `props().overlay` is set, it spawns a task that reads `focused()` for `cwd` and `space`, finds
  that space's `machine` in `spaces()`, runs `exec("open", [cwd])`, posts
  `notify({ title: "Couldn't open Finder", body, level: "error" })` on failure, and closes its
  own overlay with `closeOverlay(props().overlay)` in `finally`.
- `keys.json`: `"cmd-o": "mod.open:finder-open"` in `global`.
- Runs `open`. No network.

## Watch out

- macOS only: `open` is the system's.
- `herdr-app check` runs `init` without an overlay: return early when `props().overlay` is
  missing, or the check opens Finder.
- The mod's own overlay must be 1 × 1 with `"frame": "none"`, or an empty box flashes.
- A remote space's folder isn't on this Mac; refuse it instead of opening a local folder of the
  same path.

## Done when

- `herdr-app check mods/finder-open` passes and opens nothing.
- `herdr-app do mod.open '{"name":"finder-open"}'` brings Finder to the front on the focused
  pane's folder.
- In a space on another machine, the key shows the error toast and Finder stays as it was.
