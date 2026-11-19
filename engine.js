/* FairQuote check engine. Pure functions, no DOM, so the app, the guide and the tests share it. */
(function (root) {
  "use strict";
  var D = root.FQDATA;

  function money(n) {
    n = Math.round(n);
    return "$" + n.toLocaleString("en-US");
  }
  function range(a, b) {
    return money(a) + " to " + money(b);
  }
  function num(x) {
    var n = parseFloat(String(x == null ? "" : x).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function sum(list, f) {
    return list.reduce(function (s, x) {
      return s + f(x);
    }, 0);
  }

  function rateFor(state) {
    var t = D.TIERS[D.STATE_TIER[state] || "M"];
    return { lo: t.lo, hi: t.hi, tier: t.name };
  }

  function vehClass(v) {
    var make = String((v && v.make) || "").toLowerCase();
    if (D.LUXURY.indexOf(make) >= 0) return "lux";
    if (v && (v.body === "suv" || v.body === "truck" || v.body === "van")) return "suv";
    return "econ";
  }

  function guessJob(desc) {
    var text = String(desc || "");
    var best = null;
    D.JOBS.forEach(function (j) {
      if (j.re.test(text) && (!best || j.scope > best.scope || (j.scope === best.scope && j.re.source.length > best.re.source.length))) {
        // a more specific (wider scope) job in the same family wins
        if (!best || j.fam === best.fam ? j.scope >= (best ? best.scope : 0) : true) best = j;
      }
    });
    return best ? best.id : "";
  }

  function jobById(id) {
    for (var i = 0; i < D.JOBS.length; i++) if (D.JOBS[i].id === id) return D.JOBS[i];
    return null;
  }

  // What a job should cost on this vehicle in this state: a low and a high figure.
  function expect(job, veh, state) {
    var cls = D.CLASSES[vehClass(veh)];
    var r = rateFor(state);
    var parts = [job.parts[0] * cls.pm, job.parts[1] * cls.pm * 1.15]; // 15% allowance for OEM-brand parts
    var hours = [job.hrs[0] * cls.lm, job.hrs[1] * cls.lm];
    var labor = [hours[0] * r.lo, hours[1] * r.hi];
    if (job.flatDollars) {
      parts = [0, 0];
      labor = [job.flatDollars[0], job.flatDollars[1]];
      hours = [0, 0];
    }
    return {
      parts: parts, labor: labor, hours: hours, rate: r,
      total: [parts[0] + labor[0], parts[1] + labor[1]]
    };
  }

  function intervalNote(job, odo) {
    if (!job.due || !odo) return "";
    var lo = job.due[0], hi = job.due[1];
    var span = lo.toLocaleString("en-US") + " to " + hi.toLocaleString("en-US");
    if (odo < lo * 0.5)
      return "At " + odo.toLocaleString("en-US") + " miles this is earlier than usual (typically every " + span + " miles). Ask what you or the shop noticed that led to it.";
    if (odo > hi * 2.2)
      return "This is usually done every " + span + " miles. If it has never been done, it may be overdue.";
    return "";
  }

  function status(quoted, exp) {
    var lo = exp.total[0], hi = exp.total[1];
    if (quoted > hi * 1.2) return "high";
    if (quoted > hi) return "slight";
    if (quoted < lo * 0.55 && quoted > 0) return "low";
    return "fair";
  }

  /* quote: { shop, lines:[{desc,type,qty,amount,hours,rate,jobId}] }  veh: {year,make,model,body,fuel,odo,state}
   * type is one of parts, labor, combined, fee, tax, discount, total, other. */
  function analyze(quote, veh) {
    var lines = (quote.lines || []).map(function (l, i) {
      var type = l.type || "other";
      return {
        i: i, desc: String(l.desc || ""), type: type, amount: num(l.amount), qty: num(l.qty) || 1,
        hours: num(l.hours), rate: num(l.rate), jobId: l.jobId || ""
      };
    });
    var state = (veh && veh.state) || "TX";
    var odo = num(veh && veh.odo);
    var ev = veh && veh.fuel === "ev";
    var area = rateFor(state);

    // Drop printed totals so they are not counted twice.
    lines = lines.filter(function (l) {
      return !(l.type === "total" || D.FEE_RE.total.test(l.desc));
    });
    lines.forEach(function (l) {
      if (l.type === "other" && D.FEE_RE.tax.test(l.desc)) l.type = "tax";
      else if (l.type === "other" && D.FEE_RE.discount.test(l.desc)) l.type = "discount";
      else if (l.type === "other" && D.FEE_RE.supplies.test(l.desc)) l.type = "fee";
      if (l.type === "discount") l.amount = -Math.abs(l.amount);
    });

    // Match work lines to jobs.
    var work = lines.filter(function (l) {
      return l.type === "parts" || l.type === "labor" || l.type === "combined" || l.type === "other";
    });
    work.forEach(function (l) {
      if (!l.jobId || !jobById(l.jobId)) l.jobId = guessJob(l.desc);
    });

    // Group by job family; the widest-scope job in the family sets the benchmark.
    var groups = {};
    var loose = [];
    work.forEach(function (l) {
      if (!l.jobId) return loose.push(l);
      var j = jobById(l.jobId);
      var g = groups[j.fam] || (groups[j.fam] = { fam: j.fam, job: j, lines: [] });
      if (j.scope > g.job.scope) g.job = j;
      g.lines.push(l);
    });
    var keys = Object.keys(groups);
    // Labor lines with no job: attach to the only group, or keep them as loose labor.
    var looseLabor = loose.filter(function (l) { return l.type === "labor"; });
    var looseOther = loose.filter(function (l) { return l.type !== "labor"; });
    if (keys.length === 1 && looseLabor.length) {
      looseLabor.forEach(function (l) { groups[keys[0]].lines.push(l); });
      looseLabor = [];
    }

    var items = [];
    keys.forEach(function (k) {
      var g = groups[k];
      var job = g.job;
      var quoted = sum(g.lines, function (l) { return l.amount; });
      var partsAmt = sum(g.lines.filter(function (l) { return l.type === "parts"; }), function (l) { return l.amount; });
      var laborAmt = sum(g.lines.filter(function (l) { return l.type === "labor"; }), function (l) { return l.amount; });
      var hrs = sum(g.lines, function (l) { return l.hours; });
      var rate = 0;
      g.lines.forEach(function (l) { if (l.rate) rate = l.rate; });
      var e = expect(job, veh, state);
      var notes = [];
      var st = status(quoted, e);
      var tags = [];

      if (ev && job.ev === false) {
        st = "high";
        notes.push("Your vehicle is electric, and this service does not apply to electric vehicles. Ask the shop to explain exactly what was done.");
      }
      var intv = intervalNote(job, odo);
      if (intv) notes.push(intv);
      if (rate && rate > area.hi * 1.15)
        notes.push("The shop labor rate of " + money(rate) + "/hr is above the typical " + money(area.lo) + " to " + money(area.hi) + "/hr in your " + area.tier + ". Dealers and specialty shops often charge more.");
      var bookHi = e.hours[1];
      if (hrs && bookHi && hrs > bookHi * 1.25)
        notes.push("The shop billed " + hrs + " hours; this job is typically " + e.hours[0].toFixed(1) + " to " + bookHi.toFixed(1) + " hours. Ask which labor guide they used.");
      if (partsAmt && e.parts[1] && partsAmt > e.parts[1] * 1.35)
        notes.push("The parts total is above the typical " + range(e.parts[0], e.parts[1]) + ". Ask for the brand, whether they are OEM or aftermarket, and the part numbers.");
      if (st === "low") notes.push("This is unusually low. Ask what quality of parts is included and whether anything is missing from the quote.");
      if (!notes.length && st === "fair") notes.push("This is within the typical range for your vehicle and area.");

      items.push({
        key: k, job: job, quoted: quoted, parts: partsAmt, labor: laborAmt, hours: hrs, rate: rate,
        expect: e, status: st, notes: notes, tags: tags,
        over: Math.max(0, quoted - e.total[1]),
        mid: (e.total[0] + e.total[1]) / 2,
        lines: g.lines
      });
    });

    // Fees.
    var fees = lines.filter(function (l) { return l.type === "fee"; });
    var laborTotal = sum(items, function (it) { return it.labor; }) + sum(looseLabor, function (l) { return l.amount; });
    var feeItems = fees.map(function (l) {
      var st = "fair", notes = [];
      var isSupplies = /suppl|misc|sundry|hardware/i.test(l.desc);
      if (isSupplies) {
        var cap = Math.max(25, laborTotal * 0.1);
        if (l.amount > cap && l.amount > 30) {
          st = "slight";
          notes.push("Shop supplies are usually a small percentage of labor, often capped around 10%. Ask how this is calculated and whether it has a cap.");
        } else notes.push("Within the usual range for shop supplies.");
      } else {
        if (l.amount > 40) {
          st = "slight";
          notes.push("Disposal and environmental fees are usually $5 to $30. Ask what this covers.");
        } else notes.push("Within the usual range for a disposal or environmental fee.");
      }
      return { line: l, status: st, notes: notes, over: st === "fair" ? 0 : Math.max(0, l.amount - (isSupplies ? Math.max(25, laborTotal * 0.1) : 30)) };
    });

    // Loose labor: judge the rate and nothing else.
    var looseItems = looseLabor.map(function (l) {
      var notes = [], st = "fair";
      if (l.rate && l.rate > area.hi * 1.15) {
        st = "slight";
        notes.push("A rate of " + money(l.rate) + "/hr is above the typical " + money(area.lo) + " to " + money(area.hi) + "/hr here.");
      } else notes.push("Not tied to a specific job on the quote, so only the rate can be checked. Ask which job these hours are for.");
      return { line: l, status: st, notes: notes };
    });

    var unmatched = looseOther;
    var taxTotal = sum(lines.filter(function (l) { return l.type === "tax"; }), function (l) { return l.amount; });
    var total = sum(lines.filter(function (l) { return l.type !== "tax"; }), function (l) { return l.amount; });
    var benchmarked = sum(items, function (it) { return it.quoted; });
    var over = sum(items, function (it) { return it.over; }) + sum(feeItems, function (f) { return f.over; });
    var ratio = benchmarked ? over / benchmarked : 0;
    var verdict = ratio > 0.25 ? "high" : ratio > 0.07 ? "slight" : "fair";
    if (items.some(function (it) { return ev && it.job.ev === false; })) verdict = "high";
    var lowTotal = sum(items, function (it) { return it.expect.total[0]; });
    var highTotal = sum(items, function (it) { return it.expect.total[1]; });

    return {
      items: items, fees: feeItems, loose: looseItems, unmatched: unmatched,
      total: total, tax: taxTotal, benchmarked: benchmarked, over: over, verdict: verdict,
      range: [lowTotal, highTotal], area: area, state: state, vehClass: D.CLASSES[vehClass(veh)].name
    };
  }

  root.FQ = { money: money, range: range, num: num, rateFor: rateFor, vehClass: vehClass, guessJob: guessJob, jobById: jobById, expect: expect, analyze: analyze, intervalNote: intervalNote };
})(typeof window !== "undefined" ? window : globalThis);
