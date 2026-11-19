/* FairQuote reference data.
 *
 * These are STARTER ESTIMATES: typical ranges for a common vehicle, written from general industry
 * knowledge. They are not licensed labor-guide data and not a quote. Every figure is a range so the
 * app never claims a single "correct" price. Replace this file with licensed or crowd-sourced data
 * when it is available (see the data roadmap in the business plan). */
(function (root) {
  "use strict";

  // Typical independent-shop labor rate ($/hour) by cost tier. Dealers and specialty shops often
  // charge 20-40% more, which the engine allows for.
  var TIERS = {
    L: { name: "lower-cost area", lo: 90, hi: 125 },
    M: { name: "mid-cost area", lo: 110, hi: 150 },
    H: { name: "higher-cost area", lo: 135, hi: 180 },
    X: { name: "highest-cost area", lo: 160, hi: 220 }
  };

  var STATE_TIER = {
    AL: "L", AK: "H", AZ: "H", AR: "L", CA: "X", CO: "H", CT: "X", DE: "H", DC: "X", FL: "H",
    GA: "M", HI: "X", ID: "M", IL: "H", IN: "L", IA: "L", KS: "L", KY: "L", LA: "L", ME: "M",
    MD: "H", MA: "X", MI: "M", MN: "H", MS: "L", MO: "L", MT: "M", NE: "L", NV: "H", NH: "H",
    NJ: "X", NM: "M", NY: "X", NC: "M", ND: "L", OH: "M", OK: "L", OR: "H", PA: "M", RI: "H",
    SC: "M", SD: "L", TN: "M", TX: "M", UT: "H", VT: "H", VA: "H", WA: "X", WV: "L", WI: "M", WY: "M"
  };

  var STATES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
    KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
    MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
    NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
    NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
  };

  var LUXURY = [
    "bmw", "mercedes", "mercedes-benz", "audi", "lexus", "porsche", "land rover", "range rover",
    "jaguar", "volvo", "cadillac", "infiniti", "acura", "genesis", "tesla", "maserati", "alfa romeo",
    "lincoln", "mini"
  ];

  var MAKES = [
    "Acura", "Alfa Romeo", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge",
    "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia",
    "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "Mini", "Mitsubishi", "Nissan",
    "Porsche", "Ram", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo"
  ];

  // Vehicle classes: multipliers on parts price and labor hours against a common sedan.
  var CLASSES = {
    econ: { name: "Standard car", pm: 1.0, lm: 1.0 },
    suv: { name: "SUV / truck / van", pm: 1.2, lm: 1.12 },
    lux: { name: "Luxury / European", pm: 1.9, lm: 1.3 }
  };

  // Jobs. parts and hrs are [low, high] for a common 4-cylinder sedan with aftermarket-to-OEM parts.
  //  fam/scope: lines that belong to one family (e.g. front brakes) are judged together, using the
  //             widest scope the quote mentions.
  //  ev: false = a job that does not exist on an electric vehicle.
  //  due: typical service interval in miles [low, high], used to sanity-check against the odometer.
  //  diy: [difficulty 1-5, hours for a first-timer, tools note].
  var JOBS = [
    { id: "oil", name: "Oil and filter change", fam: "oil", scope: 1, re: /oil (and|&|\+)? ?filter|oil change|lube.{0,6}oil|synthetic oil|engine oil/i, parts: [35, 80], hrs: [0.3, 0.6], ev: false, due: [3000, 10000], diy: [1, 0.5, "Wrench, drain pan, filter wrench"], term: "engine oil filter", q: ["Which oil grade and brand are you using?", "Is the filter and a new drain plug washer included?"] },
    { id: "rotate", name: "Tire rotation", fam: "rotate", scope: 1, re: /rotat/i, parts: [0, 0], hrs: [0.3, 0.6], due: [5000, 8000], diy: [2, 0.5, "Jack, jack stands, torque wrench"], q: ["Is this included free with your tire purchase?"] },
    { id: "brakes_f", name: "Front brake pads", fam: "brakes_f", scope: 1, re: /(front).{0,20}(brake|pad)|brake pad/i, parts: [40, 150], hrs: [1.0, 1.8], due: [30000, 70000], diy: [3, 2, "Jack, stands, C-clamp, torque wrench"], term: "front brake pads", q: ["Are the rotors actually below minimum thickness, or can they be reused?", "What brand and warranty are the pads?"] },
    { id: "rotors_f", name: "Front pads and rotors", fam: "brakes_f", scope: 2, re: /(front).{0,25}rotor|rotor.{0,25}(front)|pads? (and|&|\+) ?rotors?|rotors?/i, parts: [120, 350], hrs: [1.5, 2.6], due: [50000, 90000], diy: [3, 2.5, "Jack, stands, torque wrench, brake cleaner"], term: "front brake pads and rotors kit", q: ["Can you show me the rotor thickness measurement?", "Are rotors resurfaced or replaced, and why?"] },
    { id: "brakes_r", name: "Rear brake pads", fam: "brakes_r", scope: 1, re: /(rear).{0,20}(brake|pad)/i, parts: [40, 140], hrs: [1.0, 1.9], due: [40000, 90000], diy: [3, 2, "Jack, stands, caliper tool (some models)"], term: "rear brake pads", q: ["Does this car have an electronic parking brake that needs a scan tool to service?"] },
    { id: "rotors_r", name: "Rear pads and rotors", fam: "brakes_r", scope: 2, re: /(rear).{0,25}rotor|rotor.{0,25}(rear)/i, parts: [110, 320], hrs: [1.5, 2.6], due: [60000, 100000], diy: [3, 2.5, "Jack, stands, torque wrench"], term: "rear brake pads and rotors kit", q: ["Why do the rear rotors need replacing rather than reusing?"] },
    { id: "caliper", name: "Brake caliper", fam: "caliper", scope: 1, re: /caliper/i, parts: [60, 240], hrs: [1.0, 2.0], diy: [3, 2, "Jack, stands, bleeder kit"], term: "brake caliper", q: ["Is the caliper seized or leaking, and can you show me?"] },
    { id: "brakefluid", name: "Brake fluid flush", fam: "brakefluid", scope: 1, re: /brake fluid|brake flush|brake bleed/i, parts: [12, 35], hrs: [0.5, 0.9], due: [25000, 60000], diy: [3, 1, "Bleeder wrench, helper or vacuum bleeder"], term: "DOT 3 DOT 4 brake fluid", q: ["What does the fluid test say, or is this by the calendar?"] },
    { id: "battery", name: "Battery replacement", fam: "battery", scope: 1, re: /battery(?! terminal)/i, parts: [120, 280], hrs: [0.3, 0.8], diy: [1, 0.4, "Wrench set (and a memory saver on some cars)"], term: "car battery group size", q: ["Did you load-test the old battery?", "What is the warranty on the new one?"] },
    { id: "alternator", name: "Alternator", fam: "alternator", scope: 1, re: /alternator/i, parts: [180, 560], hrs: [1.3, 3.0], ev: false, diy: [3, 2.5, "Socket set, belt tool"], term: "alternator", q: ["Did the charging test show the alternator failing?", "New or remanufactured?"] },
    { id: "starter", name: "Starter motor", fam: "starter", scope: 1, re: /starter/i, parts: [120, 420], hrs: [1.0, 2.5], ev: false, diy: [3, 2.5, "Socket set, jack stands"], term: "starter motor", q: ["Was the battery tested first?"] },
    { id: "waterpump", name: "Water pump", fam: "waterpump", scope: 1, re: /water pump/i, parts: [60, 300], hrs: [2.0, 4.6], ev: false, due: [60000, 120000], diy: [4, 4, "Socket set, torque wrench, coolant"], term: "water pump", q: ["Is the pump leaking, or is this done with the timing belt?"] },
    { id: "thermostat", name: "Thermostat", fam: "thermostat", scope: 1, re: /thermostat/i, parts: [20, 100], hrs: [0.9, 2.0], ev: false, diy: [3, 1.5, "Socket set, coolant"], term: "thermostat with housing", q: ["What temperature readings showed it was stuck?"] },
    { id: "radiator", name: "Radiator", fam: "radiator", scope: 1, re: /radiator/i, parts: [150, 480], hrs: [1.5, 3.2], ev: false, diy: [3, 3, "Socket set, coolant, drain pan"], term: "radiator", q: ["Was a pressure test done to confirm the leak?"] },
    { id: "coolant", name: "Coolant flush", fam: "coolant", scope: 1, re: /coolant|antifreeze|cooling system (flush|service)/i, parts: [25, 70], hrs: [0.6, 1.1], ev: false, due: [60000, 100000], diy: [3, 1.5, "Funnel, drain pan, correct coolant type"], term: "engine coolant antifreeze", q: ["Which coolant type is used? It must match the car."] },
    { id: "serpentine", name: "Serpentine belt", fam: "serpentine", scope: 1, re: /serpentine|drive belt|accessory belt|fan belt/i, parts: [25, 80], hrs: [0.5, 1.3], ev: false, due: [60000, 100000], diy: [2, 1, "Belt tool or wrench"], term: "serpentine belt", q: ["Does the belt show cracks, or is this by mileage?"] },
    { id: "timingbelt", name: "Timing belt kit", fam: "timing", scope: 1, re: /timing (belt|chain|kit)/i, parts: [150, 520], hrs: [3.0, 6.5], ev: false, due: [60000, 105000], diy: [5, 8, "Specialty tools, engine knowledge"], term: "timing belt kit with water pump", q: ["Does this engine use a belt or a chain?", "Is the water pump and tensioner included?"] },
    { id: "plugs", name: "Spark plugs", fam: "plugs", scope: 1, re: /spark plug|plugs?\b(?!.*coil)/i, parts: [20, 130], hrs: [0.7, 3.0], ev: false, due: [30000, 100000], diy: [2, 1.5, "Socket, extension, gap tool, torque wrench"], term: "spark plugs", q: ["Which plug type and brand are being used?"] },
    { id: "coil", name: "Ignition coil", fam: "coil", scope: 1, re: /ignition coil|coil pack|coil on plug/i, parts: [25, 110], hrs: [0.3, 0.9], ev: false, diy: [2, 0.5, "Socket set"], term: "ignition coil", q: ["Which cylinder misfire code led to this?"] },
    { id: "o2", name: "Oxygen sensor", fam: "o2", scope: 1, re: /o2 sensor|oxygen sensor|air.?fuel sensor|lambda/i, parts: [50, 240], hrs: [0.5, 1.4], ev: false, diy: [3, 1, "O2 sensor socket, penetrating oil"], term: "oxygen sensor", q: ["Which sensor (upstream or downstream) and what code?"] },
    { id: "cat", name: "Catalytic converter", fam: "cat", scope: 1, re: /catalytic|cat converter/i, parts: [260, 1500], hrs: [1.0, 2.8], ev: false, diy: [4, 3, "Torch or saw, penetrating oil"], term: "catalytic converter", q: ["Was the diagnosis a failed converter or another cause such as a misfire?", "Is it covered by the federal emissions warranty?"] },
    { id: "ac_charge", name: "A/C recharge", fam: "ac_charge", scope: 1, re: /a\/?c (re)?charge|refrigerant|freon|evacuate/i, parts: [40, 180], hrs: [0.6, 1.2], diy: [2, 1, "Gauges, correct refrigerant"], term: "A/C refrigerant recharge kit", q: ["Did you leak-test it, or is this just a top-up that may leak out again?"] },
    { id: "ac_comp", name: "A/C compressor", fam: "ac_comp", scope: 1, re: /compressor/i, parts: [230, 760], hrs: [2.0, 4.2], diy: [5, 5, "Recovery machine, vacuum pump"], term: "A/C compressor", q: ["Is the whole system being flushed, and is the condenser being replaced if needed?"] },
    { id: "cabin", name: "Cabin air filter", fam: "cabin", scope: 1, re: /cabin (air )?filter|pollen filter/i, parts: [12, 45], hrs: [0.2, 0.5], due: [15000, 30000], diy: [1, 0.2, "Often none"], term: "cabin air filter", q: ["Can you show me the old filter?"] },
    { id: "airfilter", name: "Engine air filter", fam: "airfilter", scope: 1, re: /engine air filter|air filter(?!.*cabin)/i, parts: [15, 50], hrs: [0.1, 0.3], ev: false, due: [15000, 30000], diy: [1, 0.2, "Often none"], term: "engine air filter", q: ["Can you show me the old filter?"] },
    { id: "wipers", name: "Wiper blades", fam: "wipers", scope: 1, re: /wiper/i, parts: [15, 60], hrs: [0.1, 0.3], diy: [1, 0.1, "None"], term: "wiper blades", q: ["Many stores fit these free when you buy them."] },
    { id: "tires", name: "Tires (each) with mount and balance", fam: "tires", scope: 1, re: /\btires?\b|mount (and|&) balance|mounting/i, parts: [90, 280], hrs: [0.2, 0.4], due: [40000, 65000], diy: [5, 3, "Mounting machine, balancer"], term: "tires for my car", q: ["Is that price per tire, installed, with balancing, valve stems and disposal?"] },
    { id: "align", name: "Wheel alignment", fam: "align", scope: 1, re: /alignment/i, parts: [0, 0], hrs: [0.9, 1.6], diy: [5, 2, "Alignment rack"], q: ["Do I get a printout of the before and after numbers?"] },
    { id: "struts", name: "Shocks or struts (pair)", fam: "struts", scope: 1, re: /strut|shock/i, parts: [150, 580], hrs: [1.8, 3.6], due: [50000, 100000], diy: [4, 4, "Spring compressor, torque wrench"], term: "struts pair", q: ["Is the price for a pair or all four?", "Are mounts and an alignment included?"] },
    { id: "controlarm", name: "Control arm", fam: "controlarm", scope: 1, re: /control arm|a-arm/i, parts: [60, 320], hrs: [1.2, 2.6], diy: [4, 3, "Pry bar, torque wrench"], term: "control arm with ball joint", q: ["Which side and what play did you measure?"] },
    { id: "bearing", name: "Wheel bearing", fam: "bearing", scope: 1, re: /wheel bearing|hub assembly|hub bearing/i, parts: [60, 280], hrs: [1.4, 2.9], due: [85000, 150000], diy: [4, 3, "Press or hub puller"], term: "wheel hub bearing assembly", q: ["Which wheel and how did you confirm the bearing?"] },
    { id: "cv", name: "CV axle", fam: "cv", scope: 1, re: /cv axle|axle shaft|cv joint|half.?shaft/i, parts: [80, 330], hrs: [1.2, 2.6], diy: [4, 3, "Pry bar, big socket"], term: "CV axle shaft", q: ["Is the boot torn or is the joint clicking?"] },
    { id: "tierod", name: "Tie rod end", fam: "tierod", scope: 1, re: /tie rod/i, parts: [30, 130], hrs: [1.0, 1.9], diy: [3, 1.5, "Tie rod puller, wrench"], term: "tie rod end", q: ["Does it need an alignment afterward (it usually does)?"] },
    { id: "balljoint", name: "Ball joint", fam: "balljoint", scope: 1, re: /ball joint/i, parts: [30, 160], hrs: [1.0, 2.6], diy: [4, 3, "Ball joint press"], term: "ball joint", q: ["How much play did you measure?"] },
    { id: "fuelpump", name: "Fuel pump", fam: "fuelpump", scope: 1, re: /fuel pump/i, parts: [150, 640], hrs: [2.0, 4.2], ev: false, diy: [4, 4, "Fuel line tools, safety care"], term: "fuel pump assembly", q: ["What pressure test showed it failing?"] },
    { id: "fuelfilter", name: "Fuel filter", fam: "fuelfilter", scope: 1, re: /fuel filter/i, parts: [15, 90], hrs: [0.5, 1.6], ev: false, diy: [3, 1, "Line disconnect tools"], term: "fuel filter", q: ["Many modern cars have the filter inside the tank. Is that the case here?"] },
    { id: "transfluid", name: "Transmission fluid service", fam: "transfluid", scope: 1, re: /trans(mission)? (fluid|service|flush)|atf/i, parts: [60, 200], hrs: [0.8, 1.9], ev: false, due: [30000, 100000], diy: [3, 1.5, "Funnel, correct ATF type"], term: "automatic transmission fluid", q: ["Which fluid specification does my car require?", "Is this a drain-and-fill or a machine flush?"] },
    { id: "psflush", name: "Power steering flush", fam: "psflush", scope: 1, re: /power steering (fluid|flush|service)/i, parts: [15, 45], hrs: [0.5, 1.0], diy: [2, 0.7, "Turkey baster, fluid"], term: "power steering fluid", q: ["Does my car use hydraulic power steering at all? Many are electric."] },
    { id: "headlight", name: "Headlight bulb", fam: "headlight", scope: 1, re: /headlight|head lamp|headlamp bulb/i, parts: [15, 110], hrs: [0.2, 0.8], diy: [2, 0.4, "Usually none"], term: "headlight bulb", q: ["Is it a plain halogen bulb or a full assembly?"] },
    { id: "motormount", name: "Engine mount", fam: "motormount", scope: 1, re: /motor mount|engine mount/i, parts: [40, 260], hrs: [1.4, 3.0], diy: [4, 3, "Engine support, socket set"], term: "engine mount", q: ["Which mount and how did you confirm it is torn?"] },
    { id: "valvecover", name: "Valve cover gasket", fam: "valvecover", scope: 1, re: /valve cover/i, parts: [25, 160], hrs: [1.4, 3.6], ev: false, diy: [3, 2.5, "Socket set, torque wrench"], term: "valve cover gasket set", q: ["Where exactly is the oil leaking from?"] },
    { id: "diag", name: "Diagnostic fee", fam: "diag", scope: 1, re: /diagnos|check engine|scan|inspection fee|code read/i, parts: [0, 0], flat: [0, 0], flatDollars: [60, 190], hrs: [0, 0], diy: [2, 0.3, "OBD-II scanner (about $25 to $60)"], term: "OBD2 scanner", q: ["Is the diagnostic fee credited if I have the repair done here?"] }
  ];

  var FEE_RE = {
    supplies: /shop suppl|miscellaneous|misc\.?|sundry|hardware|environmental|haz.?mat|disposal|waste|eco fee|tire disposal/i,
    tax: /\btax\b|vat|gst/i,
    discount: /discount|coupon|promo|courtesy|credit/i,
    total: /^\s*(grand\s+)?(sub)?total|amount due|balance due/i
  };

  root.FQDATA = { TIERS: TIERS, STATE_TIER: STATE_TIER, STATES: STATES, LUXURY: LUXURY, MAKES: MAKES, CLASSES: CLASSES, JOBS: JOBS, FEE_RE: FEE_RE };
})(typeof window !== "undefined" ? window : globalThis);
