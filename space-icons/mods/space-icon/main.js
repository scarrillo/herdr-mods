// Pick an icon for a space, and its tile's color and shape. A popup: props { space } (a
// space id; without it, the shown space, so `mod.open {name: "space-icon"}` works from a key).
// Type to filter by name or tag, arrows and Enter to pick; it stays open until Esc. Color, shape and size
// apply at once and to spaces that show their letter too; the size is one for every space.
//
// What it keeps, in shared state, for any mod that draws space avatars:
//   "space.icons":        { ids: { <space id>: <icon> }, names: { "<machine>/<space name>": <icon> } }
//                         <icon>: a Lucide name ("heart"), or "<library>/<name>" ("simple/github")
//   "space.icons.library": the library the picker showed last
//   "space.icons.filled":  false when a library with two styles shows its outlined one
//   "space.icons.recent": the icons picked last, newest first
//   "space.icons.style":  { ids: { <space id>: { shape } }, names: { "<machine>/<space name>": { shape, color } }, size,
//                           default: { shape, color }, hide_label }
//                         default: what a space nobody styled gets, set by "All";
//                         hide_label: the sidebar leaves out its "Spaces" heading
//                         shape: "square" | "circle" | "none" (no tile: the glyph in the space's color);
//                         size: the tile's px. The color itself is Herdr's shared "space.colors"
//                         (by id); the copy under names gives it back to a space opened again.
// Draw one with svg(`mods/space-icon/${icon.includes("/") ? icon : "lucide/" + icon}.svg`). Look a
// space up by id first, then by name: ids follow a rename while the space is open, names bring
// the icon back when a space of that name is opened again (ids of closed spaces are dropped,
// names are kept).
//
// The icons are not part of this folder. Each library is one pinned npm release: "Download"
// fetches it from the npm registry with curl, checks its sha512, and unpacks its SVGs and a
// search index into ./<library>/. "Remove" deletes that folder. Until a library is there, the
// grid's place explains the download and holds the button.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, theme, props, closeOverlay, shared, setShared, exec, readTextFile, writeTextFile, appHome } from "herdr";

const OWN = "mods/space-icon/"; // the glyphs this folder ships for its own controls (Lucide's)
// Downloaded into <id>/: <name>.svg and index.json, [[name, "words to search"], …].
// `icons`: the archive's folder of SVGs. `meta`: a file in it that `rows` reads for search words.
// `twin`: the ending of a filled icon's name, where every icon comes outlined and filled.
const LIBRARIES = [
  {
    id: "lucide", name: "Lucide", title: "Lucide Icons", what: "icons", release: "the official Lucide release", count: 2404, mb: 8,
    package: "lucide-static", version: "1.76.0",
    sha512: "f22cce902e3105d8ed88817ae354b56b6d6b1193f60d788071a44560c5f1c319da16681452a2e07a5991331acd7a78ee5b6a5425921712938cb94715c9a745e5",
    icons: "package/icons", meta: "package/tags.json",
    rows: (names, tags) => names.map((n) => [n, (tags[n] ?? []).filter((t) => typeof t === "string").join(" ").toLowerCase()]),
  },
  {
    id: "simple", name: "Simple Icons", title: "Simple Icons", what: "brand logos", release: "the official Simple Icons release", count: 3472, mb: 7,
    package: "simple-icons", version: "16.38.0",
    sha512: "0745b0b3dd1e2f4166eb9687df9080f2433eeff67382c6b2b6dd039dd071ed5166dfea3d1eead521545067586faaa618232349abbc9c9f79109b6bf616189649",
    icons: "package/icons", meta: "package/data/simple-icons.json",
    rows: (names, list) => {
      const by = new Map(list.map((e) => [e.slug, e]));
      return names.map((n) => {
        const e = by.get(n);
        return [n, [e?.title, ...(e?.aliases?.aka ?? []), ...(e?.aliases?.dup ?? []).map((d) => d.title)].filter((t) => typeof t === "string").join(" ").toLowerCase()];
      });
    },
  },
  {
    id: "material", name: "Material", title: "Material Symbols", what: "icons", release: "a pinned Material Symbols release", count: 7890, mb: 2,
    package: "@material-symbols/svg-400", version: "0.49.0",
    sha512: "cd7c27e76c717c0aa698776188d9ae3f7aaa1eaaffc51a7b5dc851dfc45fba393c91dc768e0e319aff6e2e86d4da76073cc9da5dec3c794dca69dadd66a176b0",
    icons: "package/rounded", meta: null, twin: "-fill",
    rows: (names) => names.map((n) => [n, n.replace(/[_-]/g, " ")]),
  },
];
const urlOf = (l) => `https://registry.npmjs.org/${l.package}/-/${l.package.split("/").pop()}-${l.version}.tgz`;
// What "space.icons" keeps for an icon, and the file it is drawn from. Lucide's are bare names.
const idOf = (l, name) => (l.id === "lucide" ? name : `${l.id}/${name}`);
// A library's folder on disk: the only place the download and "Remove" delete from. Refuses a
// Herdr home that isn't a plain absolute path, and anything that isn't one of LIBRARIES.
function folderOf(lib) {
  const home = appHome();
  if (typeof home !== "string" || !home.startsWith("/") || home.replace(/\/+$/, "") === "" || home.split("/").includes("..")) {
    throw new Error(`unexpected Herdr home "${home}"`);
  }
  if (!LIBRARIES.includes(lib)) throw new Error("unknown library");
  return `${home.replace(/\/+$/, "")}/${OWN}${lib.id}`;
}
const fileOf = (icon) => `${OWN}${icon.includes("/") ? icon : `lucide/${icon}`}.svg`;
const COLS = 10;
const CELL = 34;
const ROWS = 8.5; // shown at once: the half row at the bottom says there is more to scroll
const RECENT = 2 * COLS;
const SIZE = { min: 14, max: 24, step: 2, normal: 18 };
const SHAPES = [["square", "Square"], ["circle", "Circle"], ["none", "No background"]];
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
// Herdr's six space colors (stored by name), then a few more (stored as #rrggbb).
const COLORS = [...Object.keys(MARK), "#e5534b", "#d4a72c", "#33b3d6", "#6e7781"];
// What Herdr gives a space: a square tile in the palette color the fewest spaces have.
const PALETTE = Object.keys(MARK);
const nextColor = (taken) => PALETTE.reduce((best, c) => (taken.filter((v) => v === c).length < taken.filter((v) => v === best).length ? c : best));
const fillOf = (color, t) => (color.startsWith("#") ? color : (MARK[color] ?? t[color]));

// A space's avatar as the sidebar draws it.
function tile({ size, shape, fill, icon, letter }) {
  const bare = shape === "none";
  const ink = bare ? fill : "#ffffff";
  return h_flex().size(size).flex_none().rounded(shape === "circle" ? size / 2 : Math.round(size * 5 / 18))
    .when(!bare, (el) => el.bg(fill)).items_center().justify_center().text_size(size * (bare ? 0.72 : 0.58)).font_bold().text_color(ink)
    .child(icon ? svg(fileOf(icon)).size(Math.round(bare ? size - 2 : size * 2 / 3)).flex_none().text_color(ink) : letter);
}

export const nameKey = (s) => `${s.machine ?? ""}/${s.name}`;

// Names starting with the text, then names containing it, then tags containing it.
export function search(icons, text) {
  const f = text.trim().toLowerCase().replace(/\s+/g, "-");
  if (!f) return null;
  const starts = [], inName = [], inTags = [];
  const words = text.trim().toLowerCase().split(/\s+/);
  for (const [name, tags] of icons) {
    if (name.startsWith(f)) starts.push(name);
    else if (name.includes(f)) inName.push(name);
    else if (words.every((w) => tags.includes(w) || name.includes(w))) inTags.push(name);
  }
  return [...starts, ...inName, ...inTags];
}

export default class SpaceIcon extends View {
  init(_props, cx) {
    this.at = 0;
    this.scroll = 0;
    this.lib = LIBRARIES.find((l) => l.id === shared("space.icons.library")) ?? LIBRARIES[0];
    this.filled = shared("space.icons.filled") ?? true;
    this.icons = []; // [name, words] rows, from the library's index.json
    this.have = "loading"; // this library: then "ready" or "missing"
    this.busy = null; // the id of the library being downloaded
    this.note = "";
    this.error = null;
    this.confirm = false; // "Remove" was pressed once
    this.items = []; // icons as "space.icons" keeps them
    this.input = InputState.new({ placeholder: "Search icons…" });
    cx.spawn(async (cx) => this.load(cx));
    this.input.on("change", (_e, cx) => {
      this.filter();
      cx.notify();
    });
    this.input.on("submit", () => this.pick(this.items[this.at]));
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  // The icons picked last from this library, then all of it.
  unfiltered() {
    const all = this.rows().map(([name]) => idOf(this.lib, name));
    const known = new Set(all);
    const recent = (shared("space.icons.recent") ?? []).filter((n) => known.has(n));
    const seen = new Set(recent);
    return [...recent, ...all.filter((n) => !seen.has(n))];
  }

  // The shown library's rows: one style of it where it has two.
  rows() {
    const twin = this.lib.twin;
    return twin ? this.icons.filter(([name]) => name.endsWith(twin) === this.filled) : this.icons;
  }

  // Outlined or filled, for a library with both.
  fill(filled) {
    console.log(`space-icon: ${this.lib.id} ${filled ? "filled" : "outlined"}`);
    this.filled = filled;
    setShared("space.icons.filled", filled);
    this.filter();
    this.input.focus();
  }

  filter() {
    const found = search(this.rows(), this.input.value());
    this.items = found ? found.map((name) => idOf(this.lib, name)) : this.unfiltered();
    this.at = 0;
    this.scroll = 0;
  }

  // Reads the shown library's index; without one the picker offers the download.
  async load(cx) {
    const lib = this.lib;
    const text = await readTextFile(`${appHome()}/${OWN}${lib.id}/index.json`);
    if (lib !== this.lib) return; // another library was chosen meanwhile
    // By name, those starting with a digit last: a library shouldn't open on "10k" and "123".
    const rows = text ? JSON.parse(text) : [];
    const digit = ([name]) => /^[0-9]/.test(name);
    this.icons = [...rows.filter((r) => !digit(r)), ...rows.filter(digit)];
    this.have = text ? "ready" : "missing";
    this.filter();
    console.log(`space-icon: ${lib.id}: ${text ? `${this.icons.length} icons loaded` : "not downloaded"}`);
    cx.notify();
  }

  // Shows another library.
  use(lib, cx) {
    if (lib === this.lib) return;
    console.log(`space-icon: library ${lib.id}`);
    this.lib = lib;
    this.icons = [];
    this.items = [];
    this.have = "loading";
    this.confirm = false;
    this.error = null;
    setShared("space.icons.library", lib.id);
    cx.spawn(async (cx) => this.load(cx));
    this.input.focus();
  }

  // Fetches a library's pinned release into ./<id>/. Everything is built in a hidden folder
  // (Herdr doesn't reload the mod for those) and swapped in by one command at the end.
  async download(cx, lib) {
    if (this.busy) return;
    const say = (text) => {
      this.note = text;
      console.log(`space-icon: download ${lib.id}: ${text}`);
      cx.notify();
    };
    const sh = async (command, args, timeout = 60000) => {
      const r = await exec(command, args, { timeout });
      if (r.code !== 0) throw new Error(`${command}: ${r.stderr.trim() || `exit ${r.code}`}`);
      return r.stdout;
    };
    this.busy = lib.id;
    this.error = null;
    try {
      const target = folderOf(lib);
      const stage = `${target.slice(0, -lib.id.length)}.fetch-${lib.id}`;
      const fresh = `${stage}/${lib.id}`;
      const archive = `${stage}/archive.tgz`;
      say(`Downloading ${lib.title}…`);
      await sh("rm", ["-rf", stage]);
      await sh("mkdir", ["-p", fresh]);
      await sh("curl", ["-fsSL", "--max-time", "240", "-o", archive, urlOf(lib)], 300000);
      say("Checking the download…");
      const sum = (await sh("shasum", ["-a", "512", archive])).trim().split(/\s+/)[0];
      if (sum !== lib.sha512) throw new Error("the download doesn't match the expected checksum; nothing was installed");
      say("Unpacking…");
      await sh("tar", ["-xzf", archive, "-C", fresh, `--strip-components=${lib.icons.split("/").length}`, lib.icons]);
      const names = (await sh("ls", [fresh])).split("\n").filter((n) => /^[a-z0-9_-]+\.svg$/.test(n)).map((n) => n.slice(0, -4)).sort();
      if (names.length !== lib.count) throw new Error(`unpacked ${names.length} icons, expected ${lib.count}`);
      let meta = null;
      if (lib.meta) {
        const parts = lib.meta.split("/");
        await sh("tar", ["-xzf", archive, "-C", stage, `--strip-components=${parts.length - 1}`, lib.meta]);
        meta = JSON.parse(await readTextFile(`${stage}/${parts.pop()}`));
      }
      const rows = lib.rows(names, meta);
      await writeTextFile(`${fresh}/index.json`, JSON.stringify(rows), null);
      // One command, so the reload the new folder causes can't leave it half done.
      await sh("sh", ["-c", 'rm -rf "$1" && mv "$2" "$1" && rm -rf "$3"', "sh", target, fresh, stage]);
      say(`${rows.length} icons installed`);
    } catch (e) {
      this.error = String(e?.message ?? e);
      console.log(`space-icon: download ${lib.id} failed: ${this.error}`);
    }
    this.busy = null;
    await this.load(cx);
  }

  // Deletes a library's downloaded folder. Spaces keep their choice; its tiles are empty until
  // the library is downloaded again.
  async remove(cx, lib) {
    console.log(`space-icon: remove ${lib.id}`);
    this.confirm = false;
    try {
      const r = await exec("rm", ["-rf", folderOf(lib)]);
      if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
    } catch (e) {
      this.error = String(e?.message ?? e);
      console.log(`space-icon: remove ${lib.id} failed: ${this.error}`);
    }
    await this.load(cx);
  }

  space() {
    const id = props()?.space;
    return spaces().find((s) => (id ? s.id === id : s.active)) ?? null;
  }

  close() {
    closeOverlay(props().overlay);
  }

  // `icon`: as "space.icons" keeps it.
  pick(icon) {
    const s = this.space();
    if (!s || !icon) return;
    const kept = shared("space.icons") ?? {};
    const open = new Set(spaces().map((p) => p.id));
    const ids = Object.fromEntries(Object.entries(kept.ids ?? {}).filter(([id]) => open.has(id)));
    const names = { ...(kept.names ?? {}) };
    ids[s.id] = icon;
    names[nameKey(s)] = icon;
    setShared("space.icons.recent", [icon, ...(shared("space.icons.recent") ?? []).filter((n) => n !== icon)].slice(0, RECENT));
    console.log(`space-icon: ${s.name} (${s.id}) -> ${icon}`);
    setShared("space.icons", { ids, names });
    this.input.focus();
  }

  // This space as Herdr draws one: its letter on a square in a palette color, whatever "All
  // Spaces" set. Kept as its own shape and color, so it stays that way.
  reset() {
    const s = this.space();
    if (!s) return;
    const all = spaces();
    const open = new Set(all.map((p) => p.id));
    const others = (kept) => Object.fromEntries(Object.entries(kept ?? {}).filter(([id]) => open.has(id) && id !== s.id));
    const icons = shared("space.icons") ?? {};
    const style = shared("space.icons.style") ?? {};
    const colors = shared("space.colors") ?? {};
    const color = nextColor(all.filter((p) => p.id !== s.id).map((p) => colors[p.id]));
    console.log(`space-icon: reset ${s.name} (${s.id}) -> letter, square, ${color}`);
    setShared("space.icons", { ids: others(icons.ids), names: Object.fromEntries(Object.entries(icons.names ?? {}).filter(([key]) => key !== nameKey(s))) });
    setShared("space.icons.style", { ...style, ids: { ...others(style.ids), [s.id]: { shape: "square" } }, names: { ...(style.names ?? {}), [nameKey(s)]: { shape: "square", color } } });
    setShared("space.colors", { ...colors, [s.id]: color });
    this.input.focus();
  }

  // The tile's look. `shape` and `color` are this space's; `size` is every space's.
  restyle({ shape, color, size }) {
    const s = this.space();
    const kept = shared("space.icons.style") ?? {};
    const open = new Set(spaces().map((p) => p.id));
    const ids = Object.fromEntries(Object.entries(kept.ids ?? {}).filter(([id]) => open.has(id)));
    const names = { ...(kept.names ?? {}) };
    const next = { ...kept, ids, names };
    if (size !== undefined) next.size = Math.max(SIZE.min, Math.min(SIZE.max, size));
    if (s && shape) {
      ids[s.id] = { ...ids[s.id], shape };
      names[nameKey(s)] = { ...names[nameKey(s)], shape };
    }
    if (s && color) {
      names[nameKey(s)] = { ...names[nameKey(s)], color };
      setShared("space.colors", { ...(shared("space.colors") ?? {}), [s.id]: color });
    }
    console.log(`space-icon: style ${s?.name ?? "-"} ${JSON.stringify({ shape, color, size: next.size })}`);
    setShared("space.icons.style", next);
    this.input.focus();
  }

  // Whether the sidebar shows its "Spaces" heading.
  hideLabel(hide) {
    console.log(`space-icon: hide "Spaces" heading ${hide}`);
    setShared("space.icons.style", { ...(shared("space.icons.style") ?? {}), hide_label: hide });
    this.input.focus();
  }

  // This space's color or shape, given to every open space and to the ones made later.
  restyleAll({ shape, color }) {
    const all = spaces();
    const kept = shared("space.icons.style") ?? {};
    const open = new Set(all.map((p) => p.id));
    const ids = Object.fromEntries(Object.entries(kept.ids ?? {}).filter(([id]) => open.has(id)));
    const names = { ...(kept.names ?? {}) };
    for (const p of all) {
      if (shape) ids[p.id] = { ...ids[p.id], shape };
      names[nameKey(p)] = { ...names[nameKey(p)], ...(shape ? { shape } : { color }) };
    }
    if (color) setShared("space.colors", Object.fromEntries(all.map((p) => [p.id, color])));
    console.log(`space-icon: style all ${all.length} spaces ${JSON.stringify({ shape, color })}`);
    setShared("space.icons.style", { ...kept, ids, names, default: { ...kept.default, ...(shape ? { shape } : { color }) } });
    this.input.focus();
  }

  render() {
    const t = theme();
    const s = this.space();
    const kept = shared("space.icons") ?? {};
    const current = s ? (kept.ids?.[s.id] ?? kept.names?.[nameKey(s)] ?? null) : null;
    const color = (s && (shared("space.colors") ?? {})[s.id]) || "ansi6";
    const fill = fillOf(color, t);
    const style = shared("space.icons.style") ?? {};
    const size = style.size ?? SIZE.normal;
    const shape = (s && (style.ids?.[s.id]?.shape ?? style.names?.[nameKey(s)]?.shape)) || style.default?.shape || "square";
    const letter = [...(s?.name ?? "?")][0]?.toUpperCase() ?? "?";
    const stop = (_e, cx) => cx.stop_propagation();
    const choice = (id, on, tip) => h_flex().id(id).size(26).flex_none().items_center().justify_center().rounded(6).cursor_pointer().tooltip(tip)
      .when(on, (el) => el.bg(t.selected)).when(!on, (el) => el.hover((h) => h.bg(t.hover))).on_mouse_down("left", stop);
    const step = (id, label, to, tip) => h_flex().id(id).size(22).flex_none().items_center().justify_center().rounded(5).cursor_pointer().tooltip(tip)
      .text_color(to === size ? t.dim : t.foreground).hover((h) => h.bg(t.hover)).on_mouse_down("left", stop)
      .on_click(() => this.restyle({ size: to })).child(label);
    const items = this.items;
    const lib = this.lib;
    const ready = this.have === "ready";
    const busy = this.busy === lib.id;
    this.at = Math.max(0, Math.min(this.at, items.length - 1));

    // Only the rows in view are described: a strip of fixed rows moved by the wheel and the arrows.
    const height = Math.round(ROWS * CELL);
    const total = Math.ceil(items.length / COLS) * CELL;
    const maxScroll = Math.max(0, total - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const first = Math.floor(this.scroll / CELL);
    const last = Math.min(Math.ceil(items.length / COLS), Math.ceil((this.scroll + height) / CELL));

    const cell = (name, i) =>
      div().id(`icon-${name.replace("/", "-")}`).size(CELL).flex_none().flex().items_center().justify_center().rounded(7)
        .cursor_pointer().tooltip(name.split("/").pop())
        .when(i === this.at, (el) => el.bg(t.selected))
        .when(i !== this.at, (el) => el.hover((h) => h.bg(t.hover)))
        .when(name === current, (el) => el.border_1().border_color(t.accent))
        .on_click(() => {
          this.at = i; // the search field names the icon just picked
          this.pick(name);
        })
        .child(svg(fileOf(name)).size(18).flex_none().text_color(t.foreground));

    const strip = [];
    for (let r = first; r < last; r++) {
      strip.push(h_flex().absolute().left(0).top(r * CELL - this.scroll).h(CELL)
        .children(items.slice(r * COLS, (r + 1) * COLS).map((name, c) => cell(name, r * COLS + c))));
    }

    const move = (by) => {
      this.at = Math.max(0, Math.min(this.at + by, items.length - 1));
      const top = Math.floor(this.at / COLS) * CELL;
      if (top < this.scroll) this.scroll = top;
      if (top + CELL > this.scroll + height) this.scroll = top + CELL - height;
    };

    return v_flex()
      .id("space-icon")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(12)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") move(COLS);
        else if (k === "up") move(-COLS);
        else if (k === "right") move(1);
        else if (k === "left") move(-1);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().gap(9).items_center()
        .child(h_flex().size(SIZE.max).flex_none().items_center().justify_center().child(tile({ size, shape, fill, icon: current, letter })))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(s ? s.name : "No space"))
        .when(Boolean(s && (current || shape !== "square" || !PALETTE.includes(color))), (el) => el.child(h_flex().id("space-reset").size(24).flex_none().items_center().justify_center().rounded(5).text_color(t.muted)
          .cursor_pointer().hover((h) => h.bg(t.hover).text_color(t.foreground)).tooltip("Reset to Herdr's look: the letter, a square, a palette color").on_mouse_down("left", stop).on_click(() => this.reset())
          .child(svg(`${OWN}rotate-ccw.svg`).size(14).flex_none()))))
      // This space: its shape (one framed choice of three, drawn in grey), then its color.
      .child(h_flex().h(30).flex_none().gap(6).items_center()
        .child(h_flex().flex_none().p(2).gap(2).rounded(8).border_1().border_color(t.border).children(SHAPES.map(([name, tip]) => choice(`shape-${name}`, name === shape, tip).size(24)
          .on_click(() => this.restyle({ shape: name }))
          .child(tile({ size: SIZE.normal, shape: name, fill: t.muted, icon: current, letter })))))
        .children(COLORS.map((c) => div().id(`color-${c}`).size(18).flex_none().rounded(9).bg(fillOf(c, t)).cursor_pointer()
          .when(c === color, (el) => el.border_2().border_color(t.foreground))
          .on_mouse_down("left", stop).on_click(() => this.restyle({ color: c })))))
      .child(div().h(1).flex_none().bg(t.border)) // this space above, the icons below
      .child(h_flex().h(26).flex_none().gap(4).items_center()
        .children(LIBRARIES.map((l) => div().id(`library-${l.id}`).flex_none().px(9).py(3).rounded(6).text_size(11.5).cursor_pointer()
          .tooltip(`${l.title}: ${l.count.toLocaleString("en-US")} ${l.what}`)
          .border_1() // unselected: a thin outline; selected: filled
          .when(l === lib, (el) => el.bg(t.selected).border_color(t.selected).text_color(t.foreground))
          .when(l !== lib, (el) => el.border_color(t.border).text_color(t.muted).hover((h) => h.bg(t.hover).text_color(t.foreground)))
          .on_mouse_down("left", stop).on_click((_e, cx) => this.use(l, cx)).child(l.name)))
        .when(Boolean(lib.twin) && ready, (el) => el.child(div().id("library-filled").flex_none().ml(4).px(9).py(3).rounded(6).text_size(11.5).cursor_pointer()
          .tooltip(this.filled ? "Showing filled icons. Click for outlined." : "Showing outlined icons. Click for filled.")
          .border_1()
          .when(this.filled, (el) => el.bg(t.selected).border_color(t.selected).text_color(t.foreground))
          .when(!this.filled, (el) => el.border_color(t.border).text_color(t.muted).hover((h) => h.bg(t.hover).text_color(t.foreground)))
          .on_mouse_down("left", stop).on_click((_e, cx) => { this.fill(!this.filled); cx.notify(); }).child("Filled")))
        .child(div().flex_1())
        .when(ready, (el) => el.child(h_flex().id("library-remove").h(24).min_w(24).flex_none().px(5).items_center().justify_center().rounded(5).text_size(11.5).cursor_pointer()
          .tooltip(`Remove ${lib.title}: delete its downloaded icons`)
          .text_color(this.confirm ? "#e5534b" : t.muted).hover((h) => h.bg(t.hover))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => {
            if (this.confirm) return cx.spawn(async (cx) => this.remove(cx, lib));
            this.confirm = true;
            cx.notify();
          })
          .child(this.confirm ? "Confirm" : svg(`${OWN}trash.svg`).size(14).flex_none()))))
      .child(h_flex().h(32).flex_none().px(10).gap(8).items_center().rounded(8).border_1().border_color(t.accent).bg(t.background)
        .child(svg(`${OWN}search.svg`).size(14).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().min_w(0).h_full().text_size(12.8).text_color(t.foreground))
        // The icon under the keyboard, or clicked last, without its library.
        .child(div().flex_none().max_w(150).truncate().text_size(11.5).text_color(t.dim).child(ready ? (items[this.at] ?? "").split("/").pop() : "")))
      .child(div().id("icon-grid").relative().w(COLS * CELL).h(height).flex_none().overflow_hidden()
        .on_scroll_wheel((e, cx) => {
          this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
          cx.notify();
        })
        .children(strip)
        .when(ready && !items.length, (el) => el.child(div().p(10).text_color(t.dim).child("No icon matches.")))
        .when(this.have === "missing", (el) => el.child(v_flex().size_full().px(24).gap(12).items_center().justify_center()
          .child(div().font_semibold().text_color(t.foreground).child(`Download ${lib.title}`))
          .child(div().text_size(11.5).text_color(t.muted).text_center().child(
            `A secure, one-time download of ${lib.count.toLocaleString("en-US")} ${lib.what} (about ${lib.mb} MB), verified against ${lib.release} before anything is installed.`))
          .when(!this.busy, (el) => el.child(div().id("icons-download").flex_none().px(12).py(6).rounded(7).bg(t.accent).text_color(t.accent_foreground)
            .cursor_pointer().on_mouse_down("left", stop).on_click((_e, cx) => cx.spawn(async (cx) => this.download(cx, lib))).child("Download")))
          .when(busy, (el) => el.child(div().text_color(t.foreground).child(this.note)))
          .when(Boolean(this.busy) && !busy, (el) => el.child(div().text_size(11.5).text_color(t.dim).child("Another download is running.")))
          .when(Boolean(this.error), (el) => el.child(div().text_size(11.5).text_color("#e5534b").text_center().child(`It didn't work: ${this.error}`))))))
      .child(div().h(1).flex_none().bg(t.border)) // below: what goes for every space
      .child(h_flex().h(26).flex_none().gap(6).items_center()
        .child(div().flex_none().mr(4).text_size(11.5).text_color(t.dim).child("All Spaces"))
        .child(choice("shape-all", false, "Use this shape for every space, and new ones").on_click(() => this.restyleAll({ shape }))
          .child(tile({ size: SIZE.normal, shape, fill: t.muted, icon: current, letter })))
        .child(choice("color-all", false, "Use this color for every space, and new ones").on_click(() => this.restyleAll({ color }))
          .child(div().size(18).flex_none().rounded(9).bg(fill)))
        .child(div().flex_1())
        .child(step("size-down", "\u2212", Math.max(SIZE.min, size - SIZE.step), "Smaller tiles"))
        .child(div().w(18).flex_none().text_size(11.5).text_color(t.muted).child(h_flex().justify_center().child(String(size))))
        .child(step("size-up", "+", Math.min(SIZE.max, size + SIZE.step), "Larger tiles")))
      .child(h_flex().id("hide-label").h(20).flex_none().gap(7).items_center().text_size(11.5).text_color(t.muted).cursor_pointer()
        .hover((h) => h.text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => this.hideLabel(!style.hide_label))
        .child(h_flex().size(14).flex_none().items_center().justify_center().rounded(4).border_1().border_color(style.hide_label ? t.accent : t.input)
          .when(Boolean(style.hide_label), (el) => el.bg(t.accent).child(svg(`${OWN}check.svg`).size(10).flex_none().text_color(t.accent_foreground))))
        .child("Hide \u201cSpaces\u201d heading"));
  }
}
