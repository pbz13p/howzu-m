"""Fee bot: finds each Melbourne school's latest published fee schedule and extracts annual fees.

Uses Claude (API key in ANTHROPIC_API_KEY) with server-side web search + web fetch.
Results go to data/fees.json (resumable); token use and estimated cost to data/fees_usage.json.

Usage: python scripts/fee_bot.py --tier private_sec --limit 5
Tiers: private_sec, public_sec, private_pri, public_pri, all
"""
import argparse, json, os, re, sys, time, datetime, pathlib, concurrent.futures as cf, threading
import pandas as pd
import anthropic

ROOT = pathlib.Path(__file__).resolve().parent.parent
FEES = ROOT / "data" / "fees.json"
USAGE = ROOT / "data" / "fees_usage.json"
MODEL = os.environ.get("FEE_MODEL", "claude-sonnet-5-5")
# Estimated prices (USD) for the cost report; adjust if pricing changes
PRICE_IN, PRICE_OUT, PRICE_SEARCH = 3 / 1e6, 15 / 1e6, 10 / 1000
TARGET_YEAR = int(os.environ.get("FEE_YEAR", datetime.date.today().year + (1 if datetime.date.today().month >= 10 else 0)))

lock = threading.Lock()

PROMPT = """You are collecting school fees for a Melbourne school-information website for parents.

School: {name}
Address: {addr}
Sector: {sector}   Type: {stype}

Task:
1. Find this school's official website and its most recent published fee information. Prefer the {year} schedule; if not published yet use {prev}. Use only the school's own site or its system's official site (e.g. Melbourne Archdiocese Catholic Schools). Never use third-party fee comparison sites.
2. {what}
3. Fetch the page or PDF and read the actual numbers. Do not guess or estimate. If you cannot find official figures, say so.

Reply with ONLY a JSON object in a ```json block, no other text after it:
{{
  "found": true/false,
  "year": 2026,
  "source_url": "https://...",
  "kind": "tuition" | "parent_payment",
  "levels": [{{"label": "Prep" | "Year 1" ... "Year 12" | "Years 7-9" etc, "annual_aud": 12345}}],
  "min_annual_aud": 0, "max_annual_aud": 0,
  "includes": "what the figure covers, e.g. tuition only / tuition + levies / curriculum contribution",
  "international_annual_aud_min": null, "international_annual_aud_max": null,
  "note_zh": "one short sentence in Simplified Chinese for parents, e.g. 另有建校费 $X、入学费 $Y"
}}
Annual amounts are per student per year in AUD, for domestic students (before sibling discounts). For a range per level, use the full-year total."""

WHAT_PRIVATE = ("Extract annual tuition fees for each year level (plus compulsory levies if listed separately — report the "
                "total compulsory annual amount). Also note one-off enrolment/building fees in note_zh, and international "
                "student fees if listed.")
WHAT_PUBLIC = ("This is a Victorian government (public) school: tuition is free for local students. Find its published "
               "'parent payments' / 'school charges' / 'curriculum contributions' for the year (kind=parent_payment). "
               "Report the annual curriculum contribution per student by year level if available.")


def load_targets(tier):
    loc = pd.read_csv(ROOT / "raw" / "school_locations.csv", encoding="latin-1")
    loc = loc[(loc.LGA_TYPE == "Metro") & (loc.School_Status.astype(str) == "O")]
    priv = loc.Education_Sector.isin(["Independent", "Catholic"])
    sec = loc.School_Type.isin(["Secondary", "Pri/Sec"])
    pri = loc.School_Type.eq("Primary")
    sel = {
        "private_sec": priv & sec, "public_sec": ~priv & sec,
        "private_pri": priv & pri, "public_pri": ~priv & pri,
        "all": (sec | pri),
    }[tier]
    return loc[sel]


def cost(u):
    return u["in"] * PRICE_IN + u["out"] * PRICE_OUT + u["searches"] * PRICE_SEARCH


def ask(client, row):
    is_priv = row.Education_Sector in ("Independent", "Catholic")
    prompt = PROMPT.format(name=row.School_Name, addr=f"{row.Address_Line_1}, {row.Address_Town} VIC {row.Address_Postcode}",
                           sector=row.Education_Sector, stype=row.School_Type, year=TARGET_YEAR, prev=TARGET_YEAR - 1,
                           what=WHAT_PRIVATE if is_priv else WHAT_PUBLIC)
    tools = [
        {"type": "web_search_20260318", "name": "web_search", "max_uses": 3,
         "user_location": {"type": "approximate", "country": "AU", "region": "Victoria", "city": "Melbourne"}},
        {"type": "web_fetch_20260318", "name": "web_fetch", "max_uses": 4, "max_content_tokens": 30000},
    ]
    messages = [{"role": "user", "content": prompt}]
    usage = {"in": 0, "out": 0, "searches": 0, "fetches": 0}
    text = ""
    for _ in range(4):  # continue if the server pauses a long tool turn
        resp = client.messages.create(model=MODEL, max_tokens=4000, messages=messages, tools=tools)
        u = resp.usage
        usage["in"] += (u.input_tokens or 0) + (getattr(u, "cache_read_input_tokens", 0) or 0) + (getattr(u, "cache_creation_input_tokens", 0) or 0)
        usage["out"] += u.output_tokens or 0
        stu = getattr(u, "server_tool_use", None)
        if stu:
            usage["searches"] += getattr(stu, "web_search_requests", 0) or 0
            usage["fetches"] += getattr(stu, "web_fetch_requests", 0) or 0
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        if resp.stop_reason == "pause_turn":
            messages = [messages[0], {"role": "assistant", "content": resp.content}]
            continue
        break
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.S) or re.search(r"(\{.*\})", text, re.S)
    data = json.loads(m.group(1)) if m else {"found": False, "error": "no json"}
    return data, usage


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", default="private_sec")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--refresh", action="store_true", help="re-check schools that already have the target year")
    a = ap.parse_args()

    fees = json.load(open(FEES)) if FEES.exists() else {}
    totals = json.load(open(USAGE)) if USAGE.exists() else {"in": 0, "out": 0, "searches": 0, "fetches": 0, "schools": 0, "runs": []}
    rows = [r for r in load_targets(a.tier).itertuples()
            if a.refresh or fees.get(str(int(r.School_No)), {}).get("year", 0) < TARGET_YEAR
            and fees.get(str(int(r.School_No)), {}).get("checked_for") != TARGET_YEAR]
    if a.limit:
        rows = rows[: a.limit]
    print(f"model={MODEL} target_year={TARGET_YEAR} tier={a.tier} schools={len(rows)}", flush=True)
    client = anthropic.Anthropic(max_retries=4)
    run = {"in": 0, "out": 0, "searches": 0, "fetches": 0, "schools": 0}

    def work(r):
        try:
            data, u = ask(client, r)
        except Exception as e:  # keep going on single-school failures
            return r, {"found": False, "error": str(e)[:200]}, {"in": 0, "out": 0, "searches": 0, "fetches": 0}
        return r, data, u

    done = 0
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for r, data, u in ex.map(work, rows):
            data.update({"name": r.School_Name, "checked": datetime.date.today().isoformat(), "checked_for": TARGET_YEAR})
            with lock:
                fees[str(int(r.School_No))] = data
                for k in u:
                    run[k] += u[k]
                run["schools"] += 1
                done += 1
                print(f"[{done}/{len(rows)}] {r.School_Name}: found={data.get('found')} year={data.get('year')} "
                      f"range={data.get('min_annual_aud')}-{data.get('max_annual_aud')} cost=${cost(u):.3f}", flush=True)
                if done % 10 == 0:
                    json.dump(fees, open(FEES, "w"), ensure_ascii=False, indent=0)
    json.dump(fees, open(FEES, "w"), ensure_ascii=False, indent=0)
    for k in ("in", "out", "searches", "fetches", "schools"):
        totals[k] = totals.get(k, 0) + run[k]
    run.update({"date": datetime.date.today().isoformat(), "tier": a.tier, "model": MODEL, "est_cost_usd": round(cost(run), 2)})
    totals["runs"].append(run)
    totals["est_cost_usd"] = round(cost(totals), 2)
    json.dump(totals, open(USAGE, "w"), indent=1)
    print("RUN", json.dumps(run), flush=True)


if __name__ == "__main__":
    main()
