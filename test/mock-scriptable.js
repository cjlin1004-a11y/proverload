/* Minimal stand-ins for the Scriptable globals, enough to render a widget
 * off-device and dump its view tree. */

function node(type) {
  return { type: type, children: [], props: {} };
}

class Color {
  constructor(hex, alpha) { this.hex = hex; this.alpha = alpha == null ? 1 : alpha; }
  static dynamic(a, b) { return a; }
}
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
class Font {
  constructor(name, size) { this.name = name; this.size = size; }
  static systemFont(s) { return new Font('system', s); }
  static boldSystemFont(s) { return new Font('bold', s); }
  static mediumSystemFont(s) { return new Font('medium', s); }
  static boldRoundedSystemFont(s) { return new Font('boldRounded', s); }
  static roundedSystemFont(s) { return new Font('rounded', s); }
}
class LinearGradient { constructor() { this.colors = []; this.locations = []; } }

class DrawContext {
  constructor() { this.ops = 0; this.size = new Size(0, 0); }
  setFillColor() {}
  fillRect() { this.ops++; }
  getImage() { return { __image: true, ops: this.ops, size: this.size }; }
}

class WidgetText {
  constructor(text) { this.text = text; this.node = node('text'); this.node.text = text; }
  set font(f) { this.node.fontSize = f && f.size; }
  get font() { return this._font; }
  set lineLimit(n) { this.node.lineLimit = n; }
  set minimumScaleFactor(v) { this.node.minScale = v; }
  set textColor(c) {}
}

class Stack {
  constructor(kind) { this.node = node(kind || 'stack'); }
  addStack() { const s = new Stack(); this.node.children.push(s.node); return s; }
  addText(t) { const x = new WidgetText(t); this.node.children.push(x.node); return x; }
  addSpacer(n) { this.node.children.push({ type: 'spacer', size: n, children: [] }); }
  addImage(img) { const n = { type: 'image', img: img, children: [] }; this.node.children.push(n); return n; }
  addDate(d) { return this.addText(String(d)); }
  layoutHorizontally() { this.node.props.axis = 'h'; }
  layoutVertically() { this.node.props.axis = 'v'; }
  centerAlignContent() {}
  bottomAlignContent() {}
  topAlignContent() {}
  setPadding() {}
  set size(v) { this.node.props.size = v; }
  set backgroundColor(v) { this.node.props.bg = v; }
  set cornerRadius(v) { this.node.props.radius = v; }
  set spacing(v) { this.node.props.spacing = v; }
  set url(v) { this.node.props.url = v; }
  set backgroundGradient(v) { this.node.props.gradient = v; }
  set refreshAfterDate(v) { this.node.props.refresh = v; }
}

class ListWidget extends Stack {
  constructor() { super('widget'); }
  async presentSmall() {} async presentMedium() {} async presentLarge() {}
}

function install(globals, fileContents) {
  const files = Object.assign({}, fileContents);
  const fm = {
    documentsDirectory: () => '/docs',
    joinPath: (a, b) => a + '/' + b,
    fileExists: (p) => p === '/docs' || p === '/docs/proverload' || p in files,
    createDirectory: () => {},
    readString: (p) => files[p],
    writeString: (p, v) => { files[p] = v; },
    isFileStoredIniCloud: () => false,
    isFileDownloaded: () => true,
    downloadFileFromiCloud: () => {},
    temporaryDirectory: () => '/tmp',
  };
  Object.assign(globals, {
    Color, Size, Rect, Font, LinearGradient, DrawContext, ListWidget,
    FileManager: { iCloud: () => fm, local: () => fm },
    Script: {
      name: () => 'Proverload',
      setWidget(w) { globals.__widget = w; },
      complete() {},
    },
    Device: { isUsingDarkAppearance: () => true },
    Timer: { schedule: (ms, rep, cb) => setTimeout(cb, 0) },
    console: console,
    args: { widgetParameter: null },
  });
  return { files };
}

/* Render the captured widget tree as indented text so a human can eyeball it. */
function dump(n, depth) {
  depth = depth || 0;
  const pad = '  '.repeat(depth);
  let line;
  if (n.type === 'text') line = pad + '"' + n.text + '"';
  else if (n.type === 'spacer') line = pad + '· spacer' + (n.size ? '(' + n.size + ')' : '');
  else if (n.type === 'image') line = pad + '[chart image ' + n.img.ops + ' bars]';
  else line = pad + '<' + n.type + (n.props && n.props.axis ? ' ' + n.props.axis : '') +
    (n.props && n.props.bg ? ' bg=' + n.props.bg.hex : '') + '>';
  const kids = (n.children || []).map((c) => dump(c, depth + 1));
  return [line].concat(kids).join('\n');
}

module.exports = { install, dump, ListWidget };
