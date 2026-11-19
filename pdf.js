/* Minimal PDF writer for FairQuote summaries: text, rectangles, paths, no dependencies.
 * Uses the built-in Helvetica fonts, so the file is small and opens anywhere. */
(function (root) {
  "use strict";
  var W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var WIN = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " " };

  function clean(s) {
    return String(s == null ? "" : s).replace(/[‘’“”–—… ]/g, function (c) { return WIN[c]; });
  }
  function esc(s) {
    var o = "";
    clean(s).split("").forEach(function (c) {
      var n = c.charCodeAt(0);
      if (c === "(" || c === ")" || c === "\\") o += "\\" + c;
      else if (n >= 32 && n <= 126) o += c;
      else if (n === 0xB7) o += "\\267";
      else if (n === 0x2022) o += "\\225";
      else o += "?";
    });
    return o;
  }
  function width(s, size, bold) {
    var w = 0;
    clean(s).split("").forEach(function (c) { var n = c.charCodeAt(0); w += (n >= 32 && n <= 126 ? W[n - 32] : 556); });
    return w * size / 1000 * (bold ? 1.07 : 1);
  }
  function wrap(s, size, bold, max) {
    var out = [];
    String(s == null ? "" : s).split("\n").forEach(function (para) {
      var line = "";
      para.split(/\s+/).forEach(function (word) {
        var t = line ? line + " " + word : word;
        if (line && width(t, size, bold) > max) { out.push(line); line = word; } else line = t;
      });
      out.push(line);
    });
    return out;
  }
  function f(n) { return (Math.round(n * 100) / 100).toString(); }
  function rgb(c) { return c.map(function (v) { return f(v / 255); }).join(" "); }

  function Doc(pw, ph) {
    this.pw = pw; this.ph = ph; this.pages = []; this.cur = null;
  }
  Doc.prototype.addPage = function () { this.cur = []; this.pages.push(this.cur); return this; };
  Doc.prototype.y = function (top) { return this.ph - top; }; // convert from top-based coordinates
  Doc.prototype.text = function (x, top, s, size, o) {
    o = o || {};
    this.cur.push("BT /" + (o.bold ? "F2" : "F1") + " " + f(size) + " Tf " + rgb(o.color || [14, 29, 43]) + " rg " + f(x) + " " + f(this.y(top)) + " Td (" + esc(s) + ") Tj ET");
  };
  Doc.prototype.rect = function (x, top, w, h, fill, stroke) {
    this.cur.push((fill ? rgb(fill) + " rg " : "") + (stroke ? rgb(stroke) + " RG 0.8 w " : "") + f(x) + " " + f(this.y(top + h)) + " " + f(w) + " " + f(h) + " re " + (fill && stroke ? "B" : fill ? "f" : "S"));
  };
  Doc.prototype.roundRect = function (x, top, w, h, r, fill) {
    var y = this.y(top + h), k = r * 0.5523;
    this.cur.push(rgb(fill) + " rg " + f(x + r) + " " + f(y) + " m " + f(x + w - r) + " " + f(y) + " l " + f(x + w - r + k) + " " + f(y) + " " + f(x + w) + " " + f(y + r - k) + " " + f(x + w) + " " + f(y + r) + " c " +
      f(x + w) + " " + f(y + h - r) + " l " + f(x + w) + " " + f(y + h - r + k) + " " + f(x + w - r + k) + " " + f(y + h) + " " + f(x + w - r) + " " + f(y + h) + " c " +
      f(x + r) + " " + f(y + h) + " l " + f(x + r - k) + " " + f(y + h) + " " + f(x) + " " + f(y + h - r + k) + " " + f(x) + " " + f(y + h - r) + " c " +
      f(x) + " " + f(y + r) + " l " + f(x) + " " + f(y + r - k) + " " + f(x + r - k) + " " + f(y) + " " + f(x + r) + " " + f(y) + " c f");
  };
  Doc.prototype.line = function (x1, top1, x2, top2, color, w) {
    this.cur.push(rgb(color) + " RG " + f(w || 0.6) + " w " + f(x1) + " " + f(this.y(top1)) + " m " + f(x2) + " " + f(this.y(top2)) + " l S");
  };
  Doc.prototype.poly = function (pts, fill) { // pts in page coordinates from the top-left
    var self = this;
    this.cur.push(rgb(fill) + " rg " + pts.map(function (p, i) { return f(p[0]) + " " + f(self.y(p[1])) + (i ? " l" : " m"); }).join(" ") + " h f");
  };
  Doc.prototype.polyline = function (pts, color, w) {
    var self = this;
    this.cur.push(rgb(color) + " RG " + f(w) + " w 1 J 1 j " + pts.map(function (p, i) { return f(p[0]) + " " + f(self.y(p[1])) + (i ? " l" : " m"); }).join(" ") + " S");
  };
  Doc.prototype.build = function () {
    var objs = [], self = this;
    function add(s) { objs.push(s); return objs.length; }
    add("<< /Type /Catalog /Pages 2 0 R >>");
    add(""); // pages, filled below
    var f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    var f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    var kids = [];
    this.pages.forEach(function (cmds) {
      var body = cmds.join("\n");
      var c = add("<< /Length " + body.length + " >>\nstream\n" + body + "\nendstream");
      var p = add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + self.pw + " " + self.ph + "] /Resources << /Font << /F1 " + f1 + " 0 R /F2 " + f2 + " 0 R >> >> /Contents " + c + " 0 R >>");
      kids.push(p + " 0 R");
    });
    objs[1] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + kids.length + " >>";
    var out = "%PDF-1.4\n", offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
    var xr = out.length;
    out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + offs.map(function (o) { return ("0000000000" + o).slice(-10) + " 00000 n \n"; }).join("");
    out += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xr + "\n%%EOF";
    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  };

  root.FQPDF = { Doc: Doc, width: width, wrap: wrap, clean: clean };
})(typeof window !== "undefined" ? window : globalThis);
