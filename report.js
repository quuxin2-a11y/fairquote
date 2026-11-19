/* Builds the shareable PDF summary of a quote check. Needs FQ, FQDATA, FQPDF and FQQR. */
(function (root) {
  "use strict";
  var E = root.FQ, D = root.FQDATA, P = root.FQPDF, Q = root.FQQR;
  var INK = [14, 29, 43], MUT = [85, 102, 122], LINE = [223, 231, 227], GREEN = [15, 122, 85], DARK = [15, 61, 46];
  var VERDICT = {
    fair: { label: "Looks fair", sub: "No line is meaningfully above the typical range.", bg: [229, 244, 237], fg: [11, 90, 63] },
    slight: { label: "A bit high", sub: "Some lines are above the typical range. Worth asking questions.", bg: [255, 242, 220], fg: [163, 82, 0] },
    high: { label: "Higher than typical", sub: "Several items are well above the typical range. Ask before you approve.", bg: [253, 236, 235], fg: [179, 38, 30] }
  };
  var STATUS = { fair: ["Looks fair", [11, 90, 63]], slight: ["A bit high", [163, 82, 0]], high: ["Higher than typical", [179, 38, 30]], low: ["Unusually low", [29, 78, 216]], none: ["Not checked", MUT] };
  var PW = 612, PH = 792, M = 48, CW = PW - 2 * M, FOOT = 60;

  function logo(doc, x, top, s) {
    var k = s / 64;
    function p(a, b) { return [x + a * k, top + b * k]; }
    doc.roundRect(x, top, s, s, 15 * k, [18, 166, 114]);
    doc.poly([p(18, 14), p(46, 14), p(46, 50), p(41, 47), p(36.5, 50), p(32, 47), p(27.5, 50), p(23, 47), p(18, 50)], [255, 255, 255]);
    doc.polyline([p(24, 29), p(29.5, 34.5), p(41, 22)], [18, 166, 114], 3.2 * k);
  }
  function qr(doc, x, top, size, text) {
    var q = Q.make(text), n = q.size + 8, ms = size / n;
    doc.rect(x, top, size, size, [255, 255, 255], LINE);
    for (var y = 0; y < q.size; y++) {
      var x0 = -1;
      for (var xx = 0; xx <= q.size; xx++) {
        var dark = xx < q.size && q.get(xx, y);
        if (dark && x0 < 0) x0 = xx;
        if (!dark && x0 >= 0) { doc.rect(x + (x0 + 4) * ms, top + (y + 4) * ms, (xx - x0) * ms, ms + 0.15, [0, 0, 0]); x0 = -1; }
      }
    }
  }

  function build(r, v, o) {
    o = o || {};
    var link = o.link || "https://quuxin2-a11y.github.io/fairquote-site/";
    var doc = new P.Doc(PW, PH).addPage(), top = 0;
    function newPage() {
      doc.addPage(); top = M;
      logo(doc, M, top - 4, 22); doc.text(M + 30, top + 12, "FairQuote quote check", 11, { bold: true, color: DARK });
      top += 34;
    }
    function need(h) { if (top + h > PH - FOOT) newPage(); }
    function para(s, size, opt) {
      opt = opt || {};
      P.wrap(s, size, opt.bold, opt.w || CW).forEach(function (ln) { need(size * 1.35); doc.text(opt.x || M, top + size, ln, size, opt); top += size * 1.35; });
    }

    // header band
    doc.rect(0, 0, PW, 92, DARK);
    logo(doc, M, 24, 44);
    doc.text(M + 56, 49, "FairQuote", 24, { bold: true, color: [255, 255, 255] });
    doc.text(M + 56, 68, "Quote check summary", 11, { color: [190, 225, 208] });
    var dt = o.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    doc.text(PW - M - P.width(dt, 10), 49, dt, 10, { color: [190, 225, 208] });
    top = 116;

    // vehicle + shop
    var vline = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") + " · " + Number(v.odo || 0).toLocaleString("en-US") + " miles · " + (D.STATES[v.state] || v.state || "");
    doc.text(M, top + 12, vline, 12, { bold: true }); top += 20;
    if (o.shop) { doc.text(M, top + 11, "Quote from: " + o.shop, 10, { color: MUT }); top += 16; }
    top += 8;

    // verdict
    var vd = VERDICT[r.verdict] || VERDICT.fair;
    doc.roundRect(M, top, CW, 92, 12, vd.bg);
    doc.text(M + 16, top + 30, vd.label, 20, { bold: true, color: vd.fg });
    doc.text(M + 16, top + 47, vd.sub, 9.5, { color: MUT });
    var rows = [["Quote total", E.money(r.total) + (r.tax ? " (+ " + E.money(r.tax) + " tax)" : "")]];
    if (r.items.length) rows.push(["Typical for checked work", E.range(r.range[0], r.range[1])]);
    if (r.over > 0) rows.push(["Above the typical range", E.money(r.over)]);
    rows.forEach(function (rw, i) {
      var y = top + 62 + i * 13;
      doc.text(M + 16, y, rw[0], 9.5, { color: MUT });
      doc.text(M + CW - 16 - P.width(rw[1], 10, true), y, rw[1], 10, { bold: true });
    });
    top += 92 + 10;
    doc.text(M, top + 9, "Typical prices use " + (r.area ? r.area.tier : "") + " labor rates for " + (D.STATES[v.state] || "your state") + ", " + r.vehClass + " vehicle pricing.", 8.5, { color: MUT });
    top += 20;

    // table
    function head() {
      doc.rect(M, top, CW, 20, [244, 247, 246]);
      [["Line", M + 8], ["Quoted", 292], ["Typical", 354], ["Rating", 468]].forEach(function (c) { doc.text(c[1], top + 14, c[0], 8.5, { bold: true, color: MUT }); });
      top += 20;
    }
    doc.text(M, top + 12, "Line by line", 13, { bold: true }); top += 20;
    head();
    r.items.forEach(function (it) {
      var lines = P.wrap(it.job.name, 10, true, 232), h = Math.max(lines.length * 13, 13) + 12;
      if (top + h > PH - FOOT) { newPage(); head(); }
      lines.forEach(function (ln, i) { doc.text(M + 8, top + 15 + i * 13, ln, 10, { bold: true }); });
      doc.text(292, top + 15, E.money(it.quoted), 10);
      doc.text(354, top + 15, E.range(it.expect.total[0], it.expect.total[1]), 9.5, { color: MUT });
      var st = STATUS[it.status] || STATUS.none;
      doc.text(468, top + 15, st[0], 9, { bold: true, color: st[1] });
      top += h; doc.line(M, top, M + CW, top, LINE);
    });
    r.fees.forEach(function (fe) {
      if (top + 26 > PH - FOOT) { newPage(); head(); }
      var st = STATUS[fe.status] || STATUS.none;
      doc.text(M + 8, top + 15, (fe.line.desc || "Fee").slice(0, 42), 10, { bold: true });
      doc.text(292, top + 15, E.money(fe.line.amount), 10);
      doc.text(354, top + 15, "fee", 9.5, { color: MUT });
      doc.text(468, top + 15, st[0], 9, { bold: true, color: st[1] });
      top += 26; doc.line(M, top, M + CW, top, LINE);
    });
    if (r.unmatched && r.unmatched.length) {
      top += 8;
      para("Not checked yet: " + r.unmatched.map(function (l) { return (l.desc || "item") + " " + E.money(l.amount); }).join("; ") + ". Ask the shop for the part brand and number and compare online.", 9, { color: MUT });
    }
    top += 8;

    // what to ask
    var flagged = r.items.filter(function (it) { return it.status !== "fair"; });
    if (flagged.length) {
      need(40); doc.text(M, top + 12, "What to ask the shop", 13, { bold: true }); top += 22;
      flagged.forEach(function (it) {
        need(40); doc.text(M, top + 10, it.job.name, 10.5, { bold: true }); top += 15;
        it.notes.forEach(function (nt) { para(nt, 9, { color: MUT, x: M + 8, w: CW - 8 }); });
        it.job.q.slice(0, 2).forEach(function (qq) { para("• " + qq, 10, { x: M + 8, w: CW - 8 }); });
        top += 2;
      });
    }

    // QR block
    need(124); top += 4;
    doc.roundRect(M, top, CW, 108, 12, [244, 247, 246]);
    qr(doc, M + 14, top + 12, 84, link);
    doc.text(M + 116, top + 32, "Check your own quote", 15, { bold: true, color: DARK });
    doc.text(M + 116, top + 49, "Scan the code to get FairQuote.", 10.5);
    var yy = top + 65;
    P.wrap(link, 8.5, false, CW - 130).slice(0, 3).forEach(function (ln) { doc.text(M + 116, yy, ln, 8.5, { color: GREEN }); yy += 11; });
    top += 120;

    // footers
    var total = doc.pages.length;
    doc.pages.forEach(function (_, i) {
      doc.cur = doc.pages[i];
      doc.line(M, PH - 50, PW - M, PH - 50, LINE);
      var disc = "FairQuote gives typical price ranges from starter estimates and typical state labor rates. It is a guide for asking good questions, not a guarantee or a quote, and it does not say any shop is dishonest. Actual prices vary with part brand, vehicle details and the shop.";
      P.wrap(disc, 7.5, false, CW - 60).forEach(function (ln, j) { doc.text(M, PH - 40 + j * 9, ln, 7.5, { color: MUT }); });
      var pg = "Page " + (i + 1) + " of " + total;
      doc.text(PW - M - P.width(pg, 8), PH - 40, pg, 8, { color: MUT });
    });
    return doc.build();
  }
  root.FQREPORT = { build: build };
})(typeof window !== "undefined" ? window : globalThis);
