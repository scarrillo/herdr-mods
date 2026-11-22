// Migrated from herdr config.toml `prefix+o` (`open .`): reveal the focused
// terminal's folder in Finder. Opened by `mod.open`; runs once, then closes itself.
// Local spaces only: a remote folder isn't on this Mac.

import { View, div } from "gpui-kit";
import { exec, focused, spaces, closeOverlay, notify, props } from "herdr";

const NAME = "open finder";

export default class FinderOpen extends View {
  init(_props, cx) {
    // `herdr-app check` renders without an overlay: don't open Finder then.
    if (!props()?.overlay) return;
    cx.spawn(async () => {
      const f = focused();
      const machine = spaces().find((s) => s.id === f?.space)?.machine ?? null;
      console.log(`[${NAME}] cwd=${f?.cwd ?? "-"} machine=${machine ?? "local"}`);
      try {
        if (machine) throw new Error(`This space is on ${machine}, not this Mac.`);
        if (!f?.cwd) throw new Error("The focused pane has no folder.");
        const r = await exec("open", [f.cwd]);
        if (r.code !== 0) throw new Error(r.stderr.trim() || `open exited ${r.code}`);
      } catch (e) {
        console.log(`[${NAME}] failed: ${e}`);
        notify({ title: "Couldn't open Finder", body: String(e?.message ?? e), level: "error" });
      } finally {
        closeOverlay(props().overlay);
      }
    });
  }

  render() {
    return div();
  }
}
