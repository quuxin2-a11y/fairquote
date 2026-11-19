// Run with: node tests.js
const assert = require("assert");
globalThis.window = undefined;
require("./data.js");
require("./engine.js");
require("./qr.js");
require("./pdf.js");
require("./report.js");
const { FQ, FQDATA } = globalThis;
let n = 0;
function t(name, f) { f(); n++; }

const civic = { year: 2016, make: "Honda", model: "Accord", body: "sedan", fuel: "gas", odo: 78000, state: "TX" };
const tesla = { year: 2022, make: "Tesla", model: "Model 3", body: "sedan", fuel: "ev", odo: 20000, state: "CA" };

t("every job has well-formed ranges", () => {
  FQDATA.JOBS.forEach((j) => {
    assert(j.parts[0] <= j.parts[1] && j.hrs[0] <= j.hrs[1], j.id);
    assert(j.q && j.q.length, "questions for " + j.id);
  });
});
t("job ids are unique", () => {
  const ids = FQDATA.JOBS.map((j) => j.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
t("every state has a tier", () => {
  Object.keys(FQDATA.STATES).forEach((s) => assert(FQDATA.STATE_TIER[s], s));
});
t("job matching", () => {
  assert.strictEqual(FQ.guessJob("Replace front brake pads"), "brakes_f");
  assert.strictEqual(FQ.guessJob("Front rotors resurface/replace"), "rotors_f");
  assert.strictEqual(FQ.guessJob("Synthetic oil and filter change"), "oil");
  assert.strictEqual(FQ.guessJob("Mystery gizmo"), "");
});
t("luxury and class", () => {
  assert.strictEqual(FQ.vehClass({ make: "BMW" }), "lux");
  assert.strictEqual(FQ.vehClass({ make: "Ford", body: "truck" }), "suv");
  assert.strictEqual(FQ.vehClass({ make: "Honda", body: "sedan" }), "econ");
});
t("a fair brake job is fair", () => {
  const r = FQ.analyze({ lines: [
    { desc: "Front brake pads", type: "parts", amount: 85 },
    { desc: "Labor - front brakes", type: "labor", amount: 160, hours: 1.4, rate: 115 }
  ] }, civic);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].status, "fair");
  assert.strictEqual(r.verdict, "fair");
});
t("an inflated brake job is flagged high", () => {
  const r = FQ.analyze({ lines: [
    { desc: "Front brake pads and rotors", type: "combined", amount: 1150 }
  ] }, civic);
  assert.strictEqual(r.items[0].status, "high");
  assert(r.over > 300, "over " + r.over);
  assert.strictEqual(r.verdict, "high");
});
t("brake families merge and the wider scope wins", () => {
  const r = FQ.analyze({ lines: [
    { desc: "Front brake pads", type: "parts", amount: 70 },
    { desc: "Front rotors", type: "parts", amount: 180 },
    { desc: "Labor", type: "labor", amount: 190 }
  ] }, civic);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].job.id, "rotors_f");
  assert.strictEqual(r.items[0].quoted, 440);
});
t("luxury costs more than standard for the same job", () => {
  const j = FQ.jobById("brakes_f");
  assert(FQ.expect(j, { make: "BMW", state: "TX" }, "TX").total[1] > FQ.expect(j, civic, "TX").total[1]);
});
t("pricier states have higher ranges", () => {
  const j = FQ.jobById("alternator");
  assert(FQ.expect(j, civic, "CA").total[1] > FQ.expect(j, civic, "MS").total[1]);
});
t("an EV is flagged for an oil change", () => {
  const r = FQ.analyze({ lines: [{ desc: "Oil and filter change", type: "combined", amount: 89 }] }, tesla);
  assert.strictEqual(r.items[0].status, "high");
  assert(/electric/i.test(r.items[0].notes.join(" ")));
});
t("odometer sanity: early timing belt", () => {
  const r = FQ.analyze({ lines: [{ desc: "Timing belt kit", type: "combined", amount: 900 }] }, { ...civic, odo: 20000 });
  assert(/earlier than usual/.test(r.items[0].notes.join(" ")));
});
t("shop supplies over the cap are flagged", () => {
  const r = FQ.analyze({ lines: [
    { desc: "Front brake pads", type: "parts", amount: 85 },
    { desc: "Labor", type: "labor", amount: 150 },
    { desc: "Shop supplies", type: "fee", amount: 95 }
  ] }, civic);
  assert.strictEqual(r.fees[0].status, "slight");
});
t("tax and printed totals are not double counted", () => {
  const r = FQ.analyze({ lines: [
    { desc: "Oil and filter change", type: "combined", amount: 70 },
    { desc: "Sales tax", type: "tax", amount: 5.5 },
    { desc: "TOTAL", type: "total", amount: 75.5 }
  ] }, civic);
  assert.strictEqual(r.total, 70);
  assert.strictEqual(r.tax, 5.5);
});
t("unknown work is not judged", () => {
  const r = FQ.analyze({ lines: [{ desc: "Flux capacitor", type: "parts", amount: 400 }] }, civic);
  assert.strictEqual(r.items.length, 0);
  assert.strictEqual(r.unmatched.length, 1);
});
t("a very low price is called unusually low", () => {
  const r = FQ.analyze({ lines: [{ desc: "Catalytic converter", type: "combined", amount: 120 }] }, civic);
  assert.strictEqual(r.items[0].status, "low");
});
t("high shop rate is noted", () => {
  const r = FQ.analyze({ lines: [{ desc: "Alternator", type: "parts", amount: 250 }, { desc: "Labor", type: "labor", amount: 600, hours: 2.5, rate: 240 }] }, civic);
  assert(/labor rate/.test(r.items[0].notes.join(" ")));
});
t("PDF summary is well formed and has a QR code", () => {
  const v = { year: "2016", make: "Honda", model: "Accord", body: "sedan", fuel: "gas", odo: 78000, state: "TX" };
  const r = FQ.analyze({ lines: [{ desc: "Front brake pads and rotors", type: "combined", amount: 1100 }, { desc: "Shop supplies", type: "fee", amount: 88 }] }, v);
  const b = Buffer.from(FQREPORT.build(r, v, { shop: "Joe's (Auto)", link: "https://example.com/get" })).toString("latin1");
  assert(b.startsWith("%PDF-1.4") && b.trimEnd().endsWith("%%EOF"), "pdf frame");
  const start = Number(/startxref\n(\d+)/.exec(b)[1]);
  assert(b.slice(start, start + 4) === "xref", "xref offset points at the table");
  const offs = [...b.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  offs.forEach((o, i) => assert(b.slice(o, o + (String(i + 1) + " 0 obj").length) === (i + 1) + " 0 obj", "object offset " + (i + 1)));
  assert(/Joe's \\\(Auto\\\)/.test(b), "text is escaped");
  const q = FQQR.make("https://example.com/get");
  assert(q.size === 25 && q.get(0, 0) && !q.get(7, 0), "qr finder pattern");
});
console.log(n + " tests passed");
