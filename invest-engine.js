/* 墨尔本投资房回报测算引擎 (Victoria). Pure functions, no DOM.
 * All rates verified Nov 2026 against SRO Victoria, ATO, Treasury/FIRB published tables.
 * General information only — not tax or financial advice.
 */
(function (root) {
  const RULES = {
    asAt: "2026-11",
    // SRO VIC general land transfer duty (non-PPR), contracts from 1 Jul 2021
    duty(v) {
      if (v <= 25000) return v * 0.014;
      if (v <= 130000) return 350 + (v - 25000) * 0.024;
      if (v <= 960000) return 2870 + (v - 130000) * 0.06;
      if (v <= 2000000) return v * 0.055;
      return 110000 + (v - 2000000) * 0.065;
    },
    fpadRate: 0.08, // Foreign purchaser additional duty
    // SRO VIC general land tax 2024–2033 (incl. COVID debt temporary surcharge), individuals/companies
    landTax(v) {
      if (v < 50000) return 0;
      if (v < 100000) return 500;
      if (v < 300000) return 975;
      if (v < 600000) return 1350 + (v - 300000) * 0.003;
      if (v < 1000000) return 2250 + (v - 600000) * 0.006;
      if (v < 1800000) return 4650 + (v - 1000000) * 0.009;
      if (v < 3000000) return 11850 + (v - 1800000) * 0.0165;
      return 31650 + (v - 3000000) * 0.0265;
    },
    absenteeRate: 0.04, // Absentee owner surcharge on taxable land value
    vrltRate: 0.01, // Vacant residential land tax (first year vacant), on capital improved value
    // FIRB application fees 1 Jul 2026 – 30 Jun 2027 (ATO). new = Table 1, est = Table 2 (x3)
    firbFee(price, established) {
      let f;
      if (price < 75000) f = 4600;
      else if (price <= 1000000) f = 15600;
      else if (price > 40000000) f = 1245500;
      else f = 31300 * (Math.ceil(price / 1000000) - 1);
      return established ? f * 3 : f;
    },
    // ATO 2026-27 resident rates (excl. Medicare levy)
    taxResident(x) {
      if (x <= 18200) return 0;
      if (x <= 45000) return (x - 18200) * 0.15;
      if (x <= 135000) return 4020 + (x - 45000) * 0.30;
      if (x <= 190000) return 31020 + (x - 135000) * 0.37;
      return 51370 + (x - 190000) * 0.45;
    },
    taxForeign(x) {
      if (x <= 0) return 0;
      if (x <= 135000) return x * 0.30;
      if (x <= 190000) return 40500 + (x - 135000) * 0.37;
      return 60850 + (x - 190000) * 0.45;
    },
    // Working holiday maker (417/462) rates 2026-27
    taxWHM(x) {
      if (x <= 0) return 0;
      if (x <= 45000) return x * 0.15;
      if (x <= 135000) return 6750 + (x - 45000) * 0.30;
      if (x <= 190000) return 33750 + (x - 135000) * 0.37;
      return 54100 + (x - 190000) * 0.45;
    },
    // Low income tax offset (unchanged 2026-27), non-refundable
    lito(x) {
      if (x <= 37500) return 700;
      if (x <= 45000) return 700 - (x - 37500) * 0.05;
      if (x <= 66667) return 325 - (x - 45000) * 0.015;
      return 0;
    },
    medicare: 0.02,
    medicareLowThreshold: 28011, // singles 2026-27; levy phases in at 10c per $ above
    // Medicare levy surcharge (singles, no private hospital cover) 2026-27
    mlsRate(mlsIncome) {
      if (mlsIncome <= 105000) return 0;
      if (mlsIncome <= 123000) return 0.01;
      if (mlsIncome <= 164000) return 0.0125;
      return 0.015;
    },
    frcgw: 0.15, // Foreign resident CGT withholding (all values from 1 Jan 2025)
    div43: 0.025,
  };

  // Total personal tax for the year. nil = net investment loss (added back for MLS income)
  function incomeTax(x, buyer, nil) {
    x = Math.max(0, x);
    if (buyer.whm) return RULES.taxWHM(x);
    if (!buyer.taxResident) return RULES.taxForeign(x);
    const base = Math.max(0, RULES.taxResident(x) - RULES.lito(x));
    const ml = Math.min(x * RULES.medicare, Math.max(0, (x - RULES.medicareLowThreshold) * 0.10));
    const mls = buyer.privateCover ? 0 : (x + (nil || 0)) * RULES.mlsRate(x + (nil || 0)) * (x + (nil || 0) > 0 ? x / (x + (nil || 0)) : 0);
    return base + ml + mls;
  }

  // Monthly loan schedule for one year; interest-only for the first ioYears if io
  function loanYear(balance, rate, years, io, ioYears, yearIdx) {
    const r = rate / 12;
    const ioY = io ? ioYears : 0;
    const isIO = yearIdx <= ioY;
    let interest = 0, principal = 0, b = balance, pmt = 0;
    if (!isIO) {
      const n = Math.max(1, (years - ioY) * 12 - (yearIdx - 1 - ioY) * 12);
      pmt = r === 0 ? b / n : (b * r) / (1 - Math.pow(1 + r, -n));
    }
    for (let m = 0; m < 12 && b > 0.005; m++) {
      const i = b * r;
      interest += i;
      if (!isIO) { const p = Math.min(b, pmt - i); principal += p; b -= p; }
    }
    return { interest, principal, balance: b };
  }

  function irr(cfs) {
    let lo = -0.99, hi = 1.0;
    const npv = r => cfs.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
    if (npv(lo) * npv(hi) > 0) return null;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /* inp: see defaults in invest.html */
  function run(inp) {
    // resident = citizen/PR; tempResident = student (course >6m) or work visa living here >6m;
    // whm = working holiday / short-stay visa (foreign resident for tax, WHM rates); foreignAbroad = lives overseas
    const t = inp.buyerType;
    const buyer = {
      foreign: t !== "resident",                         // foreign person for FPAD/FIRB
      absentee: t === "foreignAbroad",                   // absentee owner surcharge
      taxResident: t === "resident" || t === "foreignHere",
      whm: t === "whm",
      cgtDiscount: t === "resident",                     // no 50% discount for foreign or temporary residents (post 8 May 2012)
      privateCover: inp.privateCover !== false,
    };
    const warnings = [];
    const P = inp.price;
    const established = inp.propType === "established";
    if (buyer.foreign && established)
      warnings.push("外国人（含临时签证）2025-4-1 至 2029-6-30 原则上禁止购买二手住宅，除非符合少数例外。本测算仅作对比参考。");
    if (buyer.foreign && inp.lvr > 0.7)
      warnings.push("海外买家在澳贷款通常最高只能借到房价的 60–70%，请确认贷款机构。");

    // ---------- Acquisition ----------
    let dutiable = P;
    let otpNote = "";
    if (inp.propType === "offplanStrata" && inp.otpRemainingBuild > 0) {
      dutiable = Math.max(0, P - inp.otpRemainingBuild);
      otpNote = "楼花印花税优惠：合同日之后的建造成本可从计税价值中扣除（2027-4-21 前签约，所有买家适用，FPAD 不享受）。";
    }
    const acq = [];
    const add = (arr, label, amt, note) => { if (amt) arr.push({ label, amt, note }); };
    const duty = RULES.duty(dutiable);
    add(acq, "印花税（land transfer duty）", duty, otpNote || "SRO 维州一般税率（投资房 / 非自住）");
    const fpad = buyer.foreign ? P * RULES.fpadRate : 0;
    add(acq, "海外买家附加印花税 FPAD 8%", fpad, "按全价计算，不享受任何优惠");
    const firb = buyer.foreign && inp.buyerType !== "resident" ? RULES.firbFee(P, established) : 0;
    add(acq, established ? "FIRB 申请费（二手房，3 倍）" : "FIRB 申请费（新房/楼花）", firb, "2026-27 年度收费表，不退款");
    add(acq, "律师 / 过户费", inp.legal, "");
    add(acq, "验房 / 白蚁检查", inp.inspection, "");
    add(acq, "贷款手续费、估价等", inp.loanSetup, "");
    add(acq, "家具家电 / 首次维修", inp.setup, "");
    const acqTotal = acq.reduce((s, a) => s + a.amt, 0);
    const loan0 = P * inp.lvr;
    const deposit = P - loan0;
    const upfrontCash = deposit + acqTotal;

    // ---------- Annual ----------
    const years = [];
    let bal = loan0, value = P, land = inp.landValue, rent = inp.weeklyRent * 52;
    let cumDiv43 = 0, carry = 0;
    const buildCost = inp.buildCost; // Div 43 base (0 if not eligible)
    const cfs = [-upfrontCash];
    for (let y = 1; y <= inp.hold; y++) {
      const infl = Math.pow(1 + inp.cpi, y - 1);
      const vacancyWeeks = inp.vacancyWeeks;
      const grossRent = rent * (52 - vacancyWeeks) / 52;
      const mgmt = grossRent * inp.mgmtPct * 1.1;            // + GST
      const letting = (inp.lettingWeeks * rent / 52) * 1.1 / inp.leaseYears;
      const conditionReports = inp.conditionReport / inp.leaseYears;
      const ln = loanYear(bal, inp.rate, inp.loanYears, inp.io, inp.ioYears, y);
      const lt = RULES.landTax(land + inp.otherVicLand) - RULES.landTax(inp.otherVicLand);
      const aos = buyer.absentee ? land * RULES.absenteeRate : 0;
      const vacantLong = vacancyWeeks >= 26;
      const vrlt = vacantLong ? value * RULES.vrltRate : 0;
      const vacancyFee = buyer.foreign && vacantLong ? firb * 2 : 0;
      const exp = [
        ["中介管理费（含 GST）", mgmt, true],
        ["出租佣金（含 GST，按租约摊）", letting, true],
        ["Condition report（入住/退租检查，按租约摊）", conditionReports, true],
        ["Council rates 地税", inp.council * infl, true],
        ["水费（固定部分）", inp.water * infl, true],
        ["物业费 OC", inp.oc * infl, true],
        ["房东保险", inp.insurance * infl, true],
        ["维修保养", inp.maintenance * infl, true],
        ["燃气/电器安全检查等合规", inp.compliance * infl, true],
        ["土地税（含 COVID 附加）", lt, true],
        ["海外业主附加土地税 4%", aos, true],
        ["空置住宅税 VRLT", vrlt, true],
        ["FIRB 空置费", vacancyFee, false], // not deductible
        ["记账/报税费", inp.accounting * infl, true],
      ].filter(e => e[1] > 0.5);
      const opex = exp.reduce((s, e) => s + e[1], 0);
      const deductibleOpex = exp.filter(e => e[2]).reduce((s, e) => s + e[1], 0);
      const div43 = buildCost > 0 && cumDiv43 + buildCost * RULES.div43 <= buildCost ? buildCost * RULES.div43 : 0;
      cumDiv43 += div43;
      const div40 = y <= 5 ? inp.div40 / 5 : 0;
      const taxableProperty = grossRent - deductibleOpex - ln.interest - div43 - div40;
      // Rental losses offset other Australian income; any unused loss is carried forward
      const other = inp.otherIncome * infl;
      const taxBefore = incomeTax(other, buyer, 0);
      const nil = Math.max(0, -taxableProperty);
      const carryIn = carry;
      let total = other + taxableProperty - carry;
      let taxAfter;
      if (total < 0) { carry = -total; taxAfter = 0; } else { carry = 0; taxAfter = incomeTax(total, buyer, nil); }
      const taxEffect = taxAfter - taxBefore;
      const preTaxCF = grossRent - opex - ln.interest - ln.principal;
      const afterTaxCF = preTaxCF - taxEffect;
      years.push({ y, grossRent, exp, opex, interest: ln.interest, principal: ln.principal, div43, div40,
        taxableProperty, carryIn, taxableIncome: Math.max(0, total), taxEffect, preTaxCF, afterTaxCF, value, land, balance: ln.balance, noi: grossRent - opex });
      cfs.push(afterTaxCF);
      bal = ln.balance;
      value *= 1 + inp.growth;
      land *= 1 + inp.landGrowth;
      rent *= 1 + inp.rentGrowth;
    }

    // ---------- Sale ----------
    const salePrice = P * Math.pow(1 + inp.growth, inp.hold);
    const sellCost = salePrice * inp.sellPct * 1.1 + inp.sellFixed;
    const costBase = P + duty + fpad + inp.legal + inp.inspection + firb * (inp.firbInCostBase ? 1 : 0) - cumDiv43;
    const gross = salePrice - sellCost - costBase;
    const discount = buyer.cgtDiscount && gross > 0 && inp.hold >= 1 ? 0.5 : 0;
    const assessable = Math.max(0, gross * (1 - discount));
    // Tax on the gain at marginal rates in the sale year, after any carried-forward rental losses.
    // Base = sale-year taxable income AFTER prior losses already used that year (not double-counted).
    const lastInc = years[years.length - 1].taxableIncome;
    const cgtTax = gross > 0 ? incomeTax(lastInc + Math.max(0, assessable - carry), buyer, 0) - incomeTax(lastInc, buyer, 0) : 0;
    const frcgw = buyer.taxResident ? 0 : salePrice * RULES.frcgw; // foreign residents for tax (incl. WHM)
    const netSale = salePrice - sellCost - bal - cgtTax;
    cfs[cfs.length - 1] += netSale;
    const totalIn = cfs.slice(1).reduce((s, c) => s + c, 0);

    const y1 = years[0];
    return {
      buyer, warnings, acq, acqTotal, loan0, deposit, upfrontCash, years,
      sale: { salePrice, sellCost, costBase, gross, discount, assessable, cgtTax, frcgw, loanPayout: bal, netSale },
      metrics: {
        grossYield: inp.weeklyRent * 52 / P,
        netYield: y1.noi / (P + acqTotal),
        cashOnCashY1: y1.afterTaxCF / upfrontCash,
        irr: irr(cfs),
        multiple: totalIn / upfrontCash,
        totalProfit: totalIn - upfrontCash,
      },
      cfs,
    };
  }

  root.InvestEngine = { RULES, run, irr, incomeTax };
  if (typeof module !== "undefined") module.exports = root.InvestEngine;
})(typeof window !== "undefined" ? window : globalThis);
