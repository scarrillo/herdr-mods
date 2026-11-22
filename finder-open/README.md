# finder-open

Opens the focused terminal's folder in Finder.

- Key: `cmd-o`
- Needs: macOS. A space on another machine shows an error instead.

## Install

Give your agent this:

```
Read ~/.config/herdr-app/AGENTS.md, then add this mod:
https://github.com/scarrillo/herdr-mods/tree/main/finder-open
```

Or by hand, from a clone of this repo:

```sh
cp -R finder-open/mods/finder-open ~/.config/herdr-app/mods/
```

Then add the key from this folder's `keys.json` to `~/.config/herdr-app/keys.json`. The mod loads
at once; no restart. Needs Herdr 0.1.16 or later.

## Update and remove

- Update: install it again over the old copy.
- Remove: delete `~/.config/herdr-app/mods/finder-open/` and its key from `keys.json`.
