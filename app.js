/* FairQuote app. Plain JavaScript, no framework, nothing leaves the phone except the quote photo
 * you choose to read (sent to your FairQuote server) and the links you tap. */
(function () {
  "use strict";
  var D = window.FQDATA, E = window.FQ;
  var APP_V = "1.1.0";
  var KEY = "fq-v1";
  var root = document.getElementById("app");

  // ---------- storage ----------
  var S = load();
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    s = s || {};
    s.vehicles = s.vehicles || [];
    s.history = s.history || [];
    s.settings = s.settings || { server: "", token: "", tag: "", link: "" };
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Could not save on this device."); }
  }
  function active() {
    for (var i = 0; i < S.vehicles.length; i++) if (S.vehicles[i].id === S.activeId) return S.vehicles[i];
    return S.vehicles[0] || null;
  }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function vlabel(v) {
    if (!v) return "Add vehicle";
    return v.nick || [v.year, v.make, v.model].filter(Boolean).join(" ");
  }
  function vfull(v) {
    return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  }

  // ---------- state ----------
  var tab = "home";
  var CHK = { step: "start", img: "", quote: null, busy: false, err: "", result: null, veh: null };
  var FORM = null; // vehicle form draft
  var SET = false;

  var SAMPLES = [
    { name: "Brake job (priced high)", note: "A made-up quote for demonstration.", shop: "Sample Auto Care", lines: [
      { desc: "Front brake pads, premium ceramic", type: "parts", amount: 142 },
      { desc: "Front rotors (2)", type: "parts", amount: 318 },
      { desc: "Labor: replace front pads and rotors", type: "labor", amount: 660, hours: 4, rate: 165 },
      { desc: "Shop supplies", type: "fee", amount: 88 },
      { desc: "Environmental fee", type: "fee", amount: 19 }
    ] },
    { name: "Oil change and filters (fair)", note: "A made-up quote for demonstration.", shop: "Sample Quick Lube", lines: [
      { desc: "Synthetic oil and filter change", type: "combined", amount: 79.95 },
      { desc: "Cabin air filter", type: "combined", amount: 42.99 },
      { desc: "Tire rotation", type: "combined", amount: 25 },
      { desc: "Shop supplies", type: "fee", amount: 6 }
    ] },
    { name: "Alternator (labor rate high)", note: "A made-up quote for demonstration.", shop: "Sample Dealer Service", lines: [
      { desc: "Alternator, new OEM", type: "parts", amount: 612 },
      { desc: "Labor: replace alternator", type: "labor", amount: 640, hours: 2.5, rate: 256 },
      { desc: "Diagnostic fee", type: "fee", amount: 189 }
    ] }
  ];

  // ---------- icons ----------
  var IC = {
    play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-3px"><path d="M8 5v14l11-7z"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z"/><path d="M9.5 10l2 2 3.5-4"/></svg>',
    car: '<svg viewBox="0 0 24 24"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="13.5" r=".6"/><circle cx="16.5" cy="13.5" r=".6"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/></svg>',
    gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
    cam: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    logo: '<svg class="logo" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#12a672"/><path d="M18 14h28v36l-5-3-4.5 3-4.5-3-4.5 3-4.5-3-5 3z" fill="#fff"/><path d="M24 29l5.5 5.5L41 22" fill="none" stroke="#0f7a55" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  // ---------- helpers ----------
  var toastT;
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.remove(); }, 2800);
  }
  var STATUS = {
    fair: ["Looks fair", "s-fair"], slight: ["A bit high", "s-slight"], high: ["Higher than typical", "s-high"],
    low: ["Unusually low", "s-low"], none: ["Not checked", "s-none"]
  };
  function pill(st) { var s = STATUS[st] || STATUS.none; return '<span class="pill ' + s[1] + '">' + s[0] + "</span>"; }

  function partsLinks(job, v) {
    if (!job.term) return "";
    var q = encodeURIComponent((v ? [v.year, v.make, v.model].filter(Boolean).join(" ") + " " : "") + job.term);
    var tag = S.settings.tag ? "&tag=" + encodeURIComponent(S.settings.tag) : "";
    var L = [
      ["AutoZone", "https://www.autozone.com/searchresult?searchText=" + q],
      ["O'Reilly", "https://www.oreillyauto.com/search?q=" + q],
      ["NAPA", "https://www.napaonline.com/en/search?text=" + q],
      ["Amazon", "https://www.amazon.com/s?k=" + q + tag],
      ["Compare prices", "https://www.google.com/search?tbm=shop&q=" + q]
    ];
    return '<div class="links">' + L.map(function (l) {
      return '<a href="' + l[1] + '" target="_blank" rel="noopener">' + l[0] + "</a>";
    }).join("") + "</div>";
  }

  // ---------- PDF summary ----------
  var DEFAULT_LINK = "https://quuxin2-a11y.github.io/fairquote/site.html";
  function toBase64(bytes) {
    var s = "", n = 0x8000;
    for (var i = 0; i < bytes.length; i += n) s += String.fromCharCode.apply(null, bytes.subarray(i, i + n));
    return btoa(s);
  }
  function sharePdf() {
    var r = CHK.result, v = CHK.veh || active();
    var bytes;
    try {
      bytes = window.FQREPORT.build(r, v, { shop: CHK.quote && CHK.quote.shop, link: S.settings.link || DEFAULT_LINK });
    } catch (e) { return toast("Could not make the PDF."); }
    var name = "FairQuote-" + [v.make, v.model].filter(Boolean).join("-").replace(/[^A-Za-z0-9-]+/g, "") + "-" + new Date().toISOString().slice(0, 10) + ".pdf";
    var P = window.Capacitor && window.Capacitor.Plugins;
    if (P && P.Filesystem && P.Share) {
      return P.Filesystem.writeFile({ path: name, data: toBase64(bytes), directory: "CACHE" })
        .then(function (f) { return P.Share.share({ title: "FairQuote summary", text: "My repair quote check from FairQuote", url: f.uri, dialogTitle: "Share summary" }); })
        .catch(function (e) { if (!/cancel/i.test(String(e && e.message))) toast("Could not share the PDF."); });
    }
    var file = new File([bytes], name, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: "FairQuote summary" }).catch(function () {});
    var url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast("PDF saved to your downloads.");
  }

  // ---------- how-to videos (play inside the app) ----------
  function videoBlock(job, v) {
    if (!job.diy) return "";
    return '<h3 style="margin-top:12px">Watch how it is done</h3><button class="btn sm alt" data-act="vids" data-id="' + job.id + '">' + IC.play + ' How-to videos</button><div class="vids"></div>';
  }
  function videoQuery(job, v) {
    return ((v && [v.year, v.make, v.model].filter(Boolean).join(" ")) || "") + " " + job.name + " how to DIY";
  }
  function ytSearchUrl(q) { return "https://www.youtube.com/results?search_query=" + encodeURIComponent(q); }
  function loadVideos(el) {
    var job = E.jobById(el.dataset.id), v = active();
    var box = el.parentNode.querySelector(".vids");
    var q = videoQuery(job, v).replace(/\s+/g, " ").trim();
    var st = S.settings;
    var fallback = '<a class="btn sm ghost" href="' + ytSearchUrl(q) + '" target="_blank" rel="noopener">Search on YouTube instead</a>';
    if (!st.server) { box.innerHTML = '<p class="sm mut">Videos need your FairQuote server (Settings).</p>' + fallback; return; }
    box.innerHTML = '<div class="spin" style="margin:12px auto;width:28px;height:28px;border-width:4px"></div>';
    fetch(st.server.replace(/\/+$/, "") + "/videos?q=" + encodeURIComponent(q), { headers: { "x-fq-token": st.token || "" } })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (!j.ok || !j.videos || !j.videos.length) { box.innerHTML = '<p class="sm mut">' + esc(j.error || "No videos found.") + "</p>" + fallback; return; }
        box.innerHTML = j.videos.map(function (x) {
          return '<button class="vrow" data-act="playvid" data-id="' + esc(x.id) + '" data-t="' + esc(x.title) + '"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + esc(x.id) + '/mqdefault.jpg"><span><b>' + esc(x.title) + '</b><span class="sm mut">' + esc(x.channel) + "</span></span></button>";
        }).join("");
      })
      .catch(function () { box.innerHTML = '<p class="sm mut">Could not load videos. Check your connection.</p>' + fallback; });
  }
  function openModal(title, src, opts) {
    closeVideo();
    opts = opts || {};
    var m = document.createElement("div");
    m.id = "vmodal";
    m.innerHTML = '<div class="vbox"><div class="vbar"><b>' + esc(title) + '</b><button data-act="closevid" aria-label="Close">×</button></div>' +
      '<div class="vframe' + (opts.tall ? " tall" : "") + '"><iframe src="' + esc(src) + '" title="' + esc(title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; geolocation" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' +
      '<p class="sm" style="margin:10px 0 0">' + esc(opts.hint || "") + ' <a href="' + esc(opts.link) + '" target="_blank" rel="noopener">' + esc(opts.linkText) + "</a></p></div>";
    document.body.appendChild(m);
  }
  function playVideo(id, title) {
    openModal(title || "Video", "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?playsinline=1&rel=0&modestbranding=1",
      { hint: "Video not playing?", link: "https://www.youtube.com/watch?v=" + encodeURIComponent(id), linkText: "Open on YouTube" });
  }
  var CFG = null;
  function getConfig() {
    if (CFG) return Promise.resolve(CFG);
    var st = S.settings;
    if (!st.server) return Promise.resolve({ maps: "" });
    return fetch(st.server.replace(/\/+$/, "") + "/config", { headers: { "x-fq-token": st.token || "" } })
      .then(function (r) { return r.json(); })
      .then(function (j) { CFG = j && j.ok ? j : { maps: "" }; return CFG; })
      .catch(function () { return { maps: "" }; });
  }
  function shopsMap(v) {
    var q = "auto repair near " + ((v && (v.zip || D.STATES[v.state])) || "me");
    getConfig().then(function (c) {
      var src = c.maps ? "https://www.google.com/maps/embed/v1/search?key=" + encodeURIComponent(c.maps) + "&q=" + encodeURIComponent(q)
        : "https://maps.google.com/maps?output=embed&q=" + encodeURIComponent(q);
      openModal("Repair shops near " + ((v && (v.zip || D.STATES[v.state])) || "you"), src,
        { tall: true, hint: "Tap a pin for hours, ratings and phone.", link: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q), linkText: "Open in Maps" });
    });
  }
  // Links that leave the app open in the in-app browser panel when the Android app provides one.
  function openOut(url) {
    try {
      var B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
      if (B && B.open) { B.open({ url: url }); return true; }
    } catch (e) { /* fall through */ }
    return false;
  }
  function closeVideo() { var m = document.getElementById("vmodal"); if (m) m.remove(); }

  // ---------- chrome ----------
  function shell(inner, opts) {
    opts = opts || {};
    var v = active();
    var top = '<div class="top">' + IC.logo + "<b>FairQuote</b><span class=\"sp\"></span>" +
      (v && !opts.bare ? '<button class="chip" data-act="tab" data-v="garage">' + esc(vlabel(v)) + "</button>" : "") +
      (opts.bare ? "" : '<button class="ico" data-act="settings" aria-label="Settings">' + IC.gear + "</button>") + "</div>";
    var tabs = opts.bare ? "" : '<nav class="tabs">' + [
      ["home", "Home", IC.home], ["check", "Check", IC.check], ["garage", "Garage", IC.car], ["guide", "Guide", IC.book]
    ].map(function (t) {
      return '<button data-act="tab" data-v="' + t[0] + '" class="' + (tab === t[0] && !SET ? "on" : "") + '">' + t[2] + "<span>" + t[1] + "</span></button>";
    }).join("") + "</nav>";
    root.innerHTML = top + "<main>" + inner + "</main>" + tabs;
    window.scrollTo(0, 0);
  }

  function render() {
    if (!S.vehicles.length && !FORM && !S.skipped) return welcome();
    if (FORM) return vehicleForm();
    if (SET) return settings();
    if (tab === "home") return home();
    if (tab === "check") return check();
    if (tab === "garage") return garage();
    if (tab === "guide") return guide();
  }

  // ---------- welcome and vehicle ----------
  function welcome() {
    shell('<div class="stack"><h1>Is your repair quote fair?</h1>' +
      '<p class="mut">Take a photo of any car repair quote. FairQuote checks it line by line against typical prices for your vehicle and your state, then shows you what to ask and where to find the parts for less.</p>' +
      '<div class="card"><div class="step"><div class="n">1</div><div><b>Add your vehicle</b><br><span class="mut sm">Year, make, model and mileage make the check accurate.</span></div></div>' +
      '<div class="step"><div class="n">2</div><div><b>Snap the quote</b><br><span class="mut sm">Or type the lines in.</span></div></div>' +
      '<div class="step"><div class="n">3</div><div><b>See what is fair</b><br><span class="mut sm">Plus questions to ask and cheaper parts.</span></div></div></div>' +
      '<button class="btn" data-act="newveh">Add my vehicle</button>' +
      '<button class="btn alt" data-act="skip">Try a sample quote first</button>' +
      '<p class="sm mut" style="text-align:center">Your vehicle details stay on this phone. No account needed.</p></div>', { bare: true });
  }

  function vehicleForm() {
    var f = FORM;
    var years = "";
    for (var y = new Date().getFullYear() + 1; y >= 1990; y--) years += '<option' + (String(f.year) === String(y) ? " selected" : "") + ">" + y + "</option>";
    var states = Object.keys(D.STATES).map(function (k) {
      return '<option value="' + k + '"' + (f.state === k ? " selected" : "") + ">" + D.STATES[k] + "</option>";
    }).join("");
    function chips(name, list) {
      return '<div class="chips">' + list.map(function (o) {
        return '<button type="button" class="opt ' + (f[name] === o[0] ? "on" : "") + '" data-act="pick" data-n="' + name + '" data-v="' + o[0] + '">' + o[1] + "</button>";
      }).join("") + "</div>";
    }
    shell('<h1>' + (f.id ? "Edit vehicle" : "Your vehicle") + '</h1><p class="mut">This is your profile. It makes the price check match your car, mileage and state.</p>' +
      '<form id="vf" class="card" autocomplete="off">' +
      '<label class="f">Nickname (optional)</label><input type="text" name="nick" value="' + esc(f.nick) + '" placeholder="Mark\'s Accord">' +
      '<div class="grid2"><div><label class="f">Year</label><select name="year">' + years + '</select></div>' +
      '<div><label class="f">Make</label><input type="text" name="make" list="makes" value="' + esc(f.make) + '" placeholder="Honda"><datalist id="makes">' + D.MAKES.map(function (m) { return "<option>" + m + "</option>"; }).join("") + "</datalist></div></div>" +
      '<div class="grid2"><div><label class="f">Model</label><input type="text" name="model" value="' + esc(f.model) + '" placeholder="Accord"></div>' +
      '<div><label class="f">Trim or engine (optional)</label><input type="text" name="trim" value="' + esc(f.trim) + '" placeholder="EX 2.4L"></div></div>' +
      '<label class="f">Body type</label>' + chips("body", [["sedan", "Car"], ["suv", "SUV"], ["truck", "Truck"], ["van", "Van"]]) +
      '<label class="f">Fuel</label>' + chips("fuel", [["gas", "Gas"], ["diesel", "Diesel"], ["hybrid", "Hybrid"], ["ev", "Electric"]]) +
      '<div class="grid2"><div><label class="f">Odometer (miles)</label><input type="number" inputmode="numeric" name="odo" value="' + esc(f.odo) + '" placeholder="78000"></div>' +
      '<div><label class="f">ZIP (optional)</label><input type="text" inputmode="numeric" name="zip" maxlength="5" value="' + esc(f.zip) + '" placeholder="78701"></div></div>' +
      '<label class="f">State</label><select name="state">' + states + "</select>" +
      "</form>" +
      '<button class="btn" data-act="saveveh">Save vehicle</button>' +
      (S.vehicles.length ? '<div style="height:10px"></div><button class="btn ghost" data-act="cancelform">Cancel</button>' : ""), { bare: !S.vehicles.length });
  }
  function readForm() {
    var fm = document.getElementById("vf");
    if (!fm) return;
    ["nick", "year", "make", "model", "trim", "odo", "zip", "state"].forEach(function (n) { FORM[n] = fm.elements[n].value.trim(); });
  }

  function garage() {
    var list = S.vehicles.map(function (v) {
      var on = active() && v.id === active().id;
      return '<div class="card"><b>' + esc(vlabel(v)) + "</b>" + (on ? ' <span class="pill s-fair">Active</span>' : "") +
        '<div class="sm mut" style="margin:2px 0 10px">' + esc(vfull(v)) + " · " + Number(v.odo || 0).toLocaleString("en-US") + " miles · " + esc(D.STATES[v.state] || v.state) + "</div>" +
        '<div class="row">' + (on ? "" : '<button class="btn sm alt" data-act="use" data-id="' + v.id + '">Use this</button>') +
        '<button class="btn sm alt" data-act="editveh" data-id="' + v.id + '">Edit</button>' +
        '<button class="btn sm ghost" data-act="odo" data-id="' + v.id + '">Update miles</button></div></div>';
    }).join("");
    shell("<h1>Garage</h1><p class=\"mut\">Each vehicle keeps its own details. FairQuote uses the active one for every check.</p>" + list +
      '<button class="btn" data-act="newveh">Add a vehicle</button>');
  }

  // ---------- home ----------
  function home() {
    var v = active();
    var saved = S.history.reduce(function (s, h) { return s + (h.over || 0); }, 0);
    var hist = S.history.slice(0, 5).map(function (h) {
      return '<button class="card row" style="width:100%;text-align:left" data-act="openhist" data-id="' + h.id + '"><div style="flex:1"><b>' + esc(h.shop || "Quote") + '</b><div class="sm mut">' + esc(h.veh) + " · " + new Date(h.ts).toLocaleDateString() + '</div></div><div style="text-align:right"><b>' + E.money(h.total) + "</b><br>" + pill(h.verdict) + "</div></button>";
    }).join("");
    shell('<div class="hero"><div class="sub">' + (v ? esc(vlabel(v)) : "Welcome") + '</div><div class="big">Got a quote?<br>Let\'s check it.</div><div class="sub" style="margin-top:6px">Photo in, fair-price check out.</div>' +
      '<button class="btn" data-act="startcheck">' + IC.cam + " Check a quote</button></div>" +
      (saved > 0 ? '<div class="card" style="margin-top:12px"><span class="mut sm">Above typical range, found so far</span><div style="font-size:28px;font-weight:800;color:var(--gd)">' + E.money(saved) + "</div></div>" : "") +
      '<h2>Look up a job</h2><div class="card"><p class="sm mut">No quote yet? See what a repair should cost on ' + (v ? "your " + esc(vlabel(v)) : "a typical car") + ".</p>" + jobPicker() + '<div id="lookup"></div></div>' +
      (hist ? "<h2>Recent checks</h2>" + hist : "") +
      '<div class="card"><b>Not sure how it works?</b><p class="sm mut">The guide walks through it with a live example.</p><button class="btn sm alt" data-act="tab" data-v="guide">Open the guide</button></div>');
  }
  function jobPicker() {
    return '<select id="jobsel"><option value="">Choose a repair…</option>' + D.JOBS.filter(function (j) { return j.id !== "diag"; }).map(function (j) {
      return '<option value="' + j.id + '">' + esc(j.name) + "</option>";
    }).join("") + "</select>";
  }
  function showLookup(id, target) {
    var el = document.getElementById(target || "lookup");
    if (!el) return;
    if (!id) { el.innerHTML = ""; return; }
    var j = E.jobById(id), v = active() || { make: "", body: "sedan", fuel: "gas", state: "TX", odo: 0 };
    var e = E.expect(j, v, v.state);
    var evNo = v.fuel === "ev" && j.ev === false;
    el.innerHTML = '<div class="verdict fair" style="margin-top:10px"><div class="sm">Typical total, parts and labor</div><div class="t">' + (evNo ? "Not applicable" : E.range(e.total[0], e.total[1])) + "</div>" +
      (evNo ? '<div class="sm">This service does not exist on electric vehicles.</div>' :
        '<div class="kv"><span>Parts</span><b>' + E.range(e.parts[0], e.parts[1]) + '</b></div><div class="kv"><span>Labor</span><b>' + E.range(e.labor[0], e.labor[1]) + '</b></div><div class="kv"><span>Shop time</span><b>' + (e.hours[1] ? e.hours[0].toFixed(1) + " to " + e.hours[1].toFixed(1) + " hrs" : "flat fee") + "</b></div>") + "</div>" +
      '<div class="sm mut">' + esc(e.rate.tier.charAt(0).toUpperCase() + e.rate.tier.slice(1)) + ": typical shop labor " + E.money(e.rate.lo) + " to " + E.money(e.rate.hi) + "/hr. Starter estimates, not a quote.</div>" +
      '<div class="note"><b>Ask the shop</b><ul class="q">' + j.q.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul></div>" + videoBlock(j, v) + partsLinks(j, v);
  }

  // ---------- check flow ----------
  function check() {
    if (!active()) { shell('<div class="empty"><p>Add your vehicle first so the check matches your car.</p><button class="btn" data-act="newveh">Add my vehicle</button></div>'); return; }
    if (CHK.step === "start") return checkStart();
    if (CHK.step === "reading") return shell('<div class="empty"><div class="spin"></div><h3>Reading your quote…</h3><p class="sm">This usually takes a few seconds.</p></div>');
    if (CHK.step === "review") return checkReview();
    if (CHK.step === "result") return checkResult();
  }
  function checkStart() {
    var haveServer = !!S.settings.server;
    shell("<h1>Check a quote</h1>" +
      (CHK.err ? '<div class="note e">' + esc(CHK.err) + "</div>" : "") +
      '<p class="mut">Make sure the whole quote is in the photo, with each line and price readable.</p>' +
      '<input id="file" type="file" accept="image/*" class="hide">' +
      '<button class="btn" data-act="pickfile">' + IC.cam + " Take or choose a photo</button>" +
      (haveServer ? "" : '<div class="note w" style="margin-top:12px">Photo reading needs your FairQuote server. Add its address in Settings, or type the quote in below.</div>') +
      '<div style="height:10px"></div><button class="btn alt" data-act="typeit">Type the quote in</button>' +
      "<h2>Or try a sample</h2>" + SAMPLES.map(function (s, i) {
        return '<button class="card row" style="width:100%;text-align:left" data-act="sample" data-i="' + i + '"><div style="flex:1"><b>' + esc(s.name) + '</b><div class="sm mut">' + esc(s.note) + "</div></div><span>›</span></button>";
      }).join(""));
  }

  function lineRow(l, i) {
    var types = [["parts", "Parts"], ["labor", "Labor"], ["combined", "Parts and labor"], ["fee", "Fee"], ["tax", "Tax"], ["discount", "Discount"], ["other", "Other"]];
    return '<div class="line" data-i="' + i + '"><input type="text" data-f="desc" value="' + esc(l.desc) + '" placeholder="What is it?"><input type="number" inputmode="decimal" data-f="amount" value="' + (l.amount === 0 || l.amount ? l.amount : "") + '" placeholder="$">' +
      '<div class="full"><select data-f="type">' + types.map(function (t) { return '<option value="' + t[0] + '"' + (l.type === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select>" +
      '<input type="number" inputmode="decimal" data-f="hours" value="' + (l.hours || "") + '" placeholder="hrs" style="max-width:76px"><input type="number" inputmode="decimal" data-f="rate" value="' + (l.rate || "") + '" placeholder="$/hr" style="max-width:84px">' +
      '<button class="x" data-act="delline" data-i="' + i + '" aria-label="Remove line">×</button></div></div>';
  }
  function checkReview() {
    var q = CHK.quote;
    shell("<h1>Check the lines</h1><p class=\"mut\">Fix anything the reader got wrong. Choose whether each line is parts, labor or both. Hours and rate are optional but help catch padded labor.</p>" +
      (CHK.img ? '<img class="thumb" src="' + CHK.img + '" alt="Your quote">' : "") +
      '<label class="f">Shop name (optional)</label><input type="text" id="shop" value="' + esc(q.shop || "") + '">' +
      '<div class="card" style="margin-top:12px" id="lines">' + q.lines.map(lineRow).join("") + '<button class="btn sm alt" style="margin-top:10px" data-act="addline">+ Add a line</button></div>' +
      '<button class="btn" data-act="runcheck">Check prices</button><div style="height:10px"></div><button class="btn ghost" data-act="restart">Start over</button>');
  }
  function syncLines() {
    var shop = document.getElementById("shop");
    if (shop) CHK.quote.shop = shop.value;
    document.querySelectorAll(".line").forEach(function (row) {
      var l = CHK.quote.lines[+row.dataset.i];
      if (!l) return;
      row.querySelectorAll("[data-f]").forEach(function (el) {
        var k = el.dataset.f;
        l[k] = (k === "desc" || k === "type") ? el.value : (el.value === "" ? "" : parseFloat(el.value));
      });
    });
  }

  function checkResult() {
    var v = CHK.veh || active();
    var r = CHK.result;
    var vd = { fair: ["Looks fair", "No line is meaningfully above the typical range."], slight: ["A bit high", "Some lines are above the typical range. Worth asking questions."], high: ["Higher than typical", "Several items are well above the typical range. Ask before you approve."] }[r.verdict];
    var itemsHtml = r.items.map(function (it, n) {
      var j = it.job;
      return '<details class="card item"' + (it.status !== "fair" ? " open" : "") + "><summary>" + pill(it.status) + '<div class="nm"><b>' + esc(j.name) + '</b><span class="sm mut">Typical ' + E.range(it.expect.total[0], it.expect.total[1]) + '</span></div><div class="amt">' + E.money(it.quoted) + "</div></summary><div class=\"body\">" +
        (it.parts || it.labor ? '<div class="kv"><span>Parts on quote</span><b>' + E.money(it.parts) + '</b></div><div class="kv"><span>Labor on quote</span><b>' + E.money(it.labor) + '</b></div><div class="kv"><span>Typical parts</span><b>' + E.range(it.expect.parts[0], it.expect.parts[1]) + '</b></div><div class="kv"><span>Typical labor</span><b>' + E.range(it.expect.labor[0], it.expect.labor[1]) + "</b></div>" : "") +
        it.notes.map(function (x) { return '<div class="note ' + (it.status === "high" ? "e" : it.status === "slight" || it.status === "low" ? "w" : "") + '">' + esc(x) + "</div>"; }).join("") +
        '<h3 style="margin-top:10px">Ask the shop</h3><ul class="q">' + j.q.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul>" +
        (j.diy ? '<h3 style="margin-top:12px">Do it yourself?</h3><div class="sm"><span class="dots">' + [1, 2, 3, 4, 5].map(function (d) { return '<i class="' + (d <= j.diy[0] ? "on" : "") + '"></i>'; }).join("") + "</span> difficulty " + j.diy[0] + " of 5 · about " + j.diy[1] + " hr first time<br><span class=\"mut\">Tools: " + esc(j.diy[2]) + "</span></div>" : "") +
        videoBlock(j, v) + (j.term ? '<h3 style="margin-top:12px">Find the parts</h3>' + partsLinks(j, v) : "") + "</div></details>";
    }).join("");
    var feeHtml = r.fees.map(function (f) {
      return '<div class="card"><div class="row"><div style="flex:1"><b>' + esc(f.line.desc) + "</b> " + pill(f.status) + '</div><b>' + E.money(f.line.amount) + "</b></div>" + f.notes.map(function (x) { return '<div class="note ' + (f.status === "fair" ? "" : "w") + '">' + esc(x) + "</div>"; }).join("") + "</div>";
    }).join("");
    var looseHtml = r.loose.map(function (f) {
      return '<div class="card"><div class="row"><div style="flex:1"><b>' + esc(f.line.desc || "Labor") + "</b> " + pill(f.status) + '</div><b>' + E.money(f.line.amount) + "</b></div>" + f.notes.map(function (x) { return '<div class="note">' + esc(x) + "</div>"; }).join("") + "</div>";
    }).join("");
    var unHtml = r.unmatched.length ? '<h2>Not checked yet</h2><div class="card"><p class="sm mut">FairQuote has no price range for these yet. Ask the shop for the part brand and number, and compare online.</p>' + r.unmatched.map(function (l) { return '<div class="kv"><span>' + esc(l.desc) + "</span><b>" + E.money(l.amount) + "</b></div>"; }).join("") + "</div>" : "";
    shell('<div class="verdict ' + r.verdict + '"><div class="t">' + vd[0] + '</div><div class="sm">' + vd[1] + "</div>" +
      '<div class="kv" style="margin-top:8px"><span>Quote total</span><b>' + E.money(r.total) + (r.tax ? " (+ " + E.money(r.tax) + " tax)" : "") + "</b></div>" +
      (r.items.length ? '<div class="kv"><span>Typical for checked work</span><b>' + E.range(r.range[0], r.range[1]) + "</b></div>" : "") +
      (r.over > 0 ? '<div class="kv"><span>Above the typical range</span><b>' + E.money(r.over) + "</b></div>" : "") + "</div>" +
      '<div class="sm mut" style="margin-bottom:10px">' + esc(vfull(v)) + " · " + Number(v.odo || 0).toLocaleString("en-US") + " mi · " + esc(D.STATES[v.state]) + " · " + esc(r.area.tier) + "</div>" +
      (r.items.length ? "<h2>Line by line</h2>" + itemsHtml : '<div class="note w">None of these lines matched a job FairQuote knows yet.</div>') + feeHtml + looseHtml + unHtml +
      '<h2>Next steps</h2><div class="stack"><button class="btn alt" data-act="shops">Find other shops nearby</button>' +
      '<button class="btn alt" data-act="sharepdf">Share PDF summary</button><button class="btn alt" data-act="share">Copy text summary</button><button class="btn alt" data-act="editquote">Edit the quote</button><button class="btn" data-act="restart">Check another quote</button></div>' +
      '<p class="sm mut" style="margin-top:14px">FairQuote gives typical price ranges from starter estimates and your state\'s typical labor rates. It is a guide to help you ask good questions, not a guarantee, and it does not say any shop is dishonest. Actual prices vary with part brand, vehicle details and the shop.</p>');
  }

  function summaryText(r, v) {
    var t = "FairQuote check for " + vfull(v) + ": " + (STATUS[r.verdict] || [""])[0] + ". Quote " + E.money(r.total) + ".";
    r.items.forEach(function (it) { t += "\n- " + it.job.name + ": " + E.money(it.quoted) + " (typical " + E.range(it.expect.total[0], it.expect.total[1]) + ", " + (STATUS[it.status] || [""])[0].toLowerCase() + ")"; });
    return t;
  }

  function runCheck() {
    syncLines();
    var q = CHK.quote;
    q.lines = q.lines.filter(function (l) { return (l.desc && String(l.desc).trim()) || l.amount; });
    if (!q.lines.length) { toast("Add at least one line first."); return; }
    var v = active();
    CHK.veh = JSON.parse(JSON.stringify(v));
    CHK.result = E.analyze(q, v);
    S.history.unshift({ id: uid(), ts: Date.now(), shop: q.shop || "", veh: vlabel(v), total: CHK.result.total, over: CHK.result.over, verdict: CHK.result.verdict, quote: q, vehSnap: CHK.veh });
    S.history = S.history.slice(0, 40);
    save();
    CHK.step = "result";
    render();
  }

  // ---------- reading a photo ----------
  function shrink(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1700, s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("That file is not a readable image.")); };
      img.src = url;
    });
  }
  function readPhoto(dataUrl) {
    var st = S.settings;
    if (!st.server) return Promise.reject(new Error("Add your FairQuote server address in Settings to read photos, or type the quote in."));
    var v = active();
    var body = {
      image: dataUrl.split(",")[1],
      vehicle: { year: v.year, make: v.make, model: v.model, body: v.body, fuel: v.fuel, odo: v.odo, state: v.state },
      catalog: D.JOBS.map(function (j) { return { id: j.id, name: j.name }; })
    };
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 45000);
    return fetch(st.server.replace(/\/+$/, "") + "/read", {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-fq-token": st.token || "" },
      body: JSON.stringify(body)
    }).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || "The reader could not process that photo (error " + r.status + ").");
        return j.quote;
      });
    }).catch(function (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error("Reading took too long. Check your connection and try again.");
      throw e;
    });
  }

  // ---------- settings ----------
  function settings() {
    var st = S.settings;
    shell('<h1>Settings</h1><div class="card"><h3>Quote reader</h3><p class="sm mut">Photo reading runs on your own FairQuote server so no secret keys are stored in the app. The setup steps are in the guide.</p>' +
      '<label class="f">Server address</label><input type="text" id="srv" value="' + esc(st.server) + '" placeholder="https://fairquote.yourname.workers.dev">' +
      '<label class="f">Access code</label><input type="text" id="tok" value="' + esc(st.token) + '" placeholder="the code you set on the server"></div>' +
      '<div class="card"><h3>Link on shared PDFs</h3><label class="f">Link for the QR code</label><input type="text" id="lnk" value="' + esc(st.link) + '" placeholder="' + esc(DEFAULT_LINK) + '"><p class="sm mut">Anyone who scans the QR code on a shared summary goes here. Leave blank for the default. Use your app download or website link.</p></div>' +
      '<div class="card"><h3>Parts links (optional)</h3><label class="f">Amazon Associates tag</label><input type="text" id="tag" value="' + esc(st.tag) + '" placeholder="yourtag-20"><p class="sm mut">If you join an affiliate program, your tag is added to Amazon links.</p></div>' +
      '<button class="btn" data-act="savesettings">Save settings</button><div style="height:10px"></div>' +
      '<div class="card"><h3>Your data</h3><p class="sm mut">Everything is stored on this phone only. Photos are not kept after reading.</p><div class="row"><button class="btn sm alt" data-act="export">Copy my data</button><button class="btn sm ghost" data-act="wipe" style="color:var(--r)">Delete all</button></div></div>' +
      '<p class="sm mut" style="text-align:center">FairQuote ' + APP_V + " · starter price data</p>" +
      '<button class="btn ghost" data-act="closeset">Back</button>');
  }

  // ---------- guide ----------
  function guide() {
    var legend = [["fair", "Within the typical range for your vehicle and area."], ["slight", "A little above the top of the range. Worth a question."], ["high", "Well above the range. Ask for the reason before you approve."], ["low", "Much lower than usual. Ask what parts and work are included."], ["none", "No price range for this yet. Compare online."]]
      .map(function (l) { return "<div>" + pill(l[0]) + ' <span class="sm">' + l[1] + "</span></div>"; }).join("");
    shell('<h1>Guide</h1><p class="mut">Everything you need, in a few taps.</p>' +
      '<details class="acc" open><summary>Quick start</summary><div class="in">' +
      '<div class="step"><div class="n">1</div><div><b>Set up your vehicle</b><br><span class="sm mut">Garage tab. Year, make, model, mileage and state. This is your profile and it sharpens every check.</span></div></div>' +
      '<div class="step"><div class="n">2</div><div><b>Check a quote</b><br><span class="sm mut">Take a photo of the quote, or type it in. Fix any line the reader got wrong.</span></div></div>' +
      '<div class="step"><div class="n">3</div><div><b>Read the result</b><br><span class="sm mut">Each line is rated against the typical range, with questions to ask and where to buy the parts.</span></div></div>' +
      '<div class="step"><div class="n">4</div><div><b>Decide</b><br><span class="sm mut">Ask the shop your questions, get a second quote, or do the easy ones yourself.</span></div></div></div></details>' +
      '<details class="acc"><summary>Try it live with a sample</summary><div class="in"><p class="sm mut">Runs the real check on a made-up quote. No photo needed.</p><div class="stack">' + SAMPLES.map(function (s, i) { return '<button class="btn sm alt" style="width:100%" data-act="sample" data-i="' + i + '">' + esc(s.name) + "</button>"; }).join("") + "</div></div></details>" +
      '<details class="acc"><summary>What do the ratings mean?</summary><div class="in legend">' + legend + "</div></details>" +
      '<details class="acc"><summary>How the price check works</summary><div class="in"><p class="sm">FairQuote compares each job to a typical range for your type of vehicle, built from typical parts prices and shop time, using your state\'s typical labor rate. Luxury and European cars, SUVs and trucks get higher ranges. Your mileage is used to spot work that is early or overdue, and electric vehicles are flagged for services that do not apply to them.</p><p class="sm">The ranges are starter estimates and will improve as more real quotes are added.</p></div></details>' +
      '<details class="acc"><summary>Set up photo reading</summary><div class="in"><p class="sm">Photo reading uses a small server you control, so no secret key lives in the app.</p><ol class="sm"><li>Follow SERVER-SETUP.md in the project to create the server (about 10 minutes).</li><li>In Settings, paste the server address and your access code.</li><li>Take a photo on the Check tab.</li></ol><p class="sm mut">Until then, you can type a quote in and use every other feature.</p></div></details>' +
      '<details class="acc"><summary>What FairQuote cannot do</summary><div class="in"><ul class="q sm"><li>It does not know your exact shop, parts brand or the condition of your car.</li><li>It cannot tell you a repair is unnecessary. It tells you what to ask.</li><li>It does not accuse any shop. A high rating means "ask questions", not "you are being cheated".</li><li>Prices are ranges. Dealers, specialty shops and rare vehicles can legitimately sit above them.</li></ul></div></details>' +
      '<details class="acc"><summary>Privacy</summary><div class="in"><p class="sm">Your vehicle details and history stay on this phone. When you read a photo, the image goes to your own FairQuote server, is sent to an AI service to read the text, and is not stored. Do not photograph anything with personal details you are not comfortable sending, such as your name, address or card numbers. Cover them first.</p></div></details>');
  }

  // ---------- events ----------
  function newForm(v) {
    var now = new Date().getFullYear();
    return v ? JSON.parse(JSON.stringify(v)) : { id: "", nick: "", year: String(now - 6), make: "", model: "", trim: "", body: "sedan", fuel: "gas", odo: "", zip: "", state: "TX" };
  }
  document.addEventListener("click", function (e) {
    var ext = e.target.closest("a[target=_blank]");
    if (ext && openOut(ext.href)) { e.preventDefault(); return; }
    var el = e.target.closest("[data-act]");
    if (!el) return;
    var a = el.dataset.act;
    if (a === "shops") return shopsMap(CHK.veh || active());
    if (a === "vids") return loadVideos(el);
    if (a === "playvid") return playVideo(el.dataset.id, el.dataset.t);
    if (a === "closevid") return closeVideo();
    if (a === "tab") { SET = false; FORM = null; tab = el.dataset.v; if (tab === "check" && CHK.step === "reading") CHK.step = "start"; return render(); }
    if (a === "settings") { SET = true; return render(); }
    if (a === "closeset") { SET = false; return render(); }
    if (a === "skip") { S.skipped = true; save(); S.vehicles.length || (S.vehicles = [{ id: uid(), nick: "Sample car", year: "2018", make: "Toyota", model: "Camry", trim: "", body: "sedan", fuel: "gas", odo: "62000", zip: "", state: "TX", sample: true }]); save(); tab = "check"; return render(); }
    if (a === "newveh") { FORM = newForm(); return render(); }
    if (a === "editveh") { FORM = newForm(S.vehicles.filter(function (v) { return v.id === el.dataset.id; })[0]); return render(); }
    if (a === "cancelform") { FORM = null; return render(); }
    if (a === "pick") { readForm(); FORM[el.dataset.n] = el.dataset.v; return vehicleForm(); }
    if (a === "saveveh") {
      readForm();
      if (!FORM.make || !FORM.model) return toast("Add the make and model.");
      if (!(+FORM.odo >= 0) || FORM.odo === "") return toast("Add the odometer reading (a rough number is fine).");
      if (FORM.id) S.vehicles = S.vehicles.map(function (v) { return v.id === FORM.id ? FORM : v; });
      else { FORM.id = uid(); S.vehicles = S.vehicles.filter(function (v) { return !v.sample; }); S.vehicles.push(FORM); }
      S.activeId = FORM.id; FORM = null; save(); toast("Vehicle saved."); return render();
    }
    if (a === "use") { S.activeId = el.dataset.id; save(); return render(); }
    if (a === "odo") {
      var v = S.vehicles.filter(function (x) { return x.id === el.dataset.id; })[0];
      var n = prompt("Current odometer reading (miles)", v.odo);
      if (n !== null && !isNaN(parseFloat(n))) { v.odo = String(parseFloat(n)); save(); render(); }
      return;
    }
    if (a === "startcheck") { tab = "check"; CHK = { step: "start", err: "" }; return render(); }
    if (a === "pickfile") { var f = document.getElementById("file"); if (f) f.click(); return; }
    if (a === "typeit") { CHK = { step: "review", quote: { shop: "", lines: [{ desc: "", type: "combined", amount: "" }] }, err: "" }; return render(); }
    if (a === "sample") { var s = SAMPLES[+el.dataset.i]; tab = "check"; CHK = { step: "review", quote: JSON.parse(JSON.stringify(s)), err: "" }; return render(); }
    if (a === "addline") { syncLines(); CHK.quote.lines.push({ desc: "", type: "combined", amount: "" }); return checkReview(); }
    if (a === "delline") { syncLines(); CHK.quote.lines.splice(+el.dataset.i, 1); if (!CHK.quote.lines.length) CHK.quote.lines.push({ desc: "", type: "combined", amount: "" }); return checkReview(); }
    if (a === "runcheck") return runCheck();
    if (a === "restart") { CHK = { step: "start", err: "" }; tab = "check"; return render(); }
    if (a === "editquote") { CHK.step = "review"; return render(); }
    if (a === "openhist") { var h = S.history.filter(function (x) { return x.id === el.dataset.id; })[0]; if (h) { CHK = { step: "result", quote: h.quote, veh: h.vehSnap, result: E.analyze(h.quote, h.vehSnap), img: "" }; tab = "check"; render(); } return; }
    if (a === "sharepdf") return sharePdf();
    if (a === "share") {
      var txt = summaryText(CHK.result, CHK.veh || active());
      if (navigator.share) navigator.share({ text: txt }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast("Summary copied."); });
      return;
    }
    if (a === "savesettings") {
      S.settings = { server: document.getElementById("srv").value.trim(), token: document.getElementById("tok").value.trim(), tag: document.getElementById("tag").value.trim(), link: document.getElementById("lnk").value.trim() };
      save(); toast("Saved."); return;
    }
    if (a === "export") { var t = JSON.stringify({ vehicles: S.vehicles, history: S.history }, null, 2); if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast("Copied."); }); return; }
    if (a === "wipe") { if (confirm("Delete all vehicles, history and settings from this phone?")) { localStorage.removeItem(KEY); S = load(); tab = "home"; SET = false; render(); } return; }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "jobsel") return showLookup(e.target.value);
    if (e.target.id === "file" && e.target.files && e.target.files[0]) {
      var file = e.target.files[0];
      CHK = { step: "reading", err: "" }; render();
      shrink(file).then(function (url) {
        CHK.img = url;
        return readPhoto(url);
      }).then(function (q) {
        CHK.quote = { shop: q.shop || "", lines: (q.lines || []).map(function (l) { return { desc: l.desc || "", type: l.type || "other", amount: l.amount, hours: l.hours, rate: l.rate, jobId: l.jobId }; }) };
        if (!CHK.quote.lines.length) throw new Error("No lines were found in that photo. Try a clearer, closer photo, or type the quote in.");
        CHK.step = "review"; CHK.err = ""; render();
      }).catch(function (err) {
        CHK = { step: "start", err: err.message || String(err) }; render();
      });
    }
  });

  render();
  window.__fq = { render: render, S: function () { return S; } };
})();
