// Migrated from herdr config.toml `prefix+alt+g` popup: lazygit at 80% over the
// window, in the focused terminal's folder (and machine). Opened by `mod.open`;
// this copy only launches the terminal popup, then closes itself. The popup
// closes when lazygit exits.

import { View, div } from "gpui-kit";
import { hc, focused, spaces, openOverlay, closeOverlay, notify, props } from "herdr";

const NAME = "lazygit popup";
const ARGV = ["lazygit"];
const SIZE = 0.8;

export default class LazygitPopup extends View {
  init(_props, cx) {
    // `herdr-app check` renders without an overlay: don't start a terminal then.
    if (!props()?.overlay) return;
    cx.spawn(async () => {
      // This copy's own 1×1 popup, closed once: before the dialog opens, or after a failure.
      let own = props().overlay;
      const closeOwn = () => {
        if (own) closeOverlay(own);
        own = null;
      };
      const f = focused();
      const machine = spaces().find((s) => s.id === f?.space)?.machine ?? null;
      const args = ["run", "--bg", "--json", "--rm", "--no-parent"];
      if (f?.cwd) args.push("--cwd", f.cwd);
      if (machine) args.push("--on", machine);
      if (ARGV.length) args.push("--", ...ARGV);
      console.log(`[${NAME}] open cwd=${f?.cwd ?? "-"} machine=${machine ?? "local"}`);
      try {
        const r = await hc(args);
        if (r.code !== 0) throw new Error(r.stderr.trim() || `hc exited ${r.code}`);
        const { address } = JSON.parse(r.stdout);
        console.log(`[${NAME}] started ${address}`);
        // Closed first: closing it after the dialog opens hands the keyboard back to the pane behind.
        closeOwn();
        openOverlay({ kind: "dialog", modal: true, width: SIZE, height: SIZE, layout: { type: "block", content: { terminal: address } } });
      } catch (e) {
        console.log(`[${NAME}] failed: ${e}`);
        notify({ title: `Couldn't open ${NAME}`, body: String(e?.message ?? e), level: "error" });
      } finally {
        closeOwn();
      }
    });
  }

  render() {
    return div();
  }
}
