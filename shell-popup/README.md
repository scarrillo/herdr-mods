# shell-popup

A scratch shell in a popup over the window, in the focused terminal's folder. Works for spaces on
other machines too. The popup closes when the shell exits.

<img src="preview.png" alt="Shell popup over the Herdr window" width="720">

- Key: `cmd-shift-a`
- To change the size, edit `SIZE` in `mods/shell-popup/main.js`.

## Install

Give your agent this:

```
Read ~/.config/herdr-app/AGENTS.md, then add this mod:
https://github.com/scarrillo/herdr-mods/tree/main/shell-popup
```

Or by hand, from a clone of this repo:

```sh
cp -R shell-popup/mods/shell-popup ~/.config/herdr-app/mods/
```

Then add the key from this folder's `keys.json` to `~/.config/herdr-app/keys.json`. The mod loads
at once; no restart. Needs Herdr 0.1.16 or later.

## Update and remove

- Update: install it again over the old copy.
- Remove: delete `~/.config/herdr-app/mods/shell-popup/` and its key from `keys.json`.
