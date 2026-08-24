#!/usr/bin/env python3
"""Fluxentiq 4-dimension license/auth audit — trial signup, trial sign-in,
PRO license, ENTERPRISE license. Exercises the real app + live Supabase."""
import base64, json, os, time, urllib.request, urllib.error

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REF = "zeroaswkxyvcsoxtiyqs"
APP = "http://localhost:3000"
COOKIE = f"sb-{REF}-auth-token"

PRO_KEY = os.environ["PRO_KEY"]
ENT_KEY = os.environ["ENT_KEY"]

RESULTS = []

def check(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))

def http(method, url, body=None, headers=None, cookie=None, raw=False):
    h = {"apikey": ANON, "Content-Type": "application/json"}
    if headers:
        h.update(headers)
    if cookie:
        h["Cookie"] = cookie
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

def sign_in_session_cookie(email, password):
    """Sign in via GoTrue and build the @supabase/ssr-style session cookie."""
    st, hd, body = http("POST", f"{URL}/auth/v1/token?grant_type=password",
                        {"email": email, "password": password})
    if st != 200:
        return None, f"sign-in failed HTTP {st}: {body.decode()[:200]}"
    tok = json.loads(body)
    session = {
        "access_token": tok["access_token"],
        "token_type": "bearer",
        "expires_in": tok.get("expires_in", 3600),
        "expires_at": tok.get("expires_at"),
        "refresh_token": tok["refresh_token"],
        "user": tok["user"],
    }
    val = "base64-" + base64.b64encode(json.dumps(session).encode()).decode()
    return f"{COOKIE}={val}", None

def get_dashboard(cookie, trial=False):
    c = cookie
    if trial:
        c = f"{cookie}; fluxentiq.trial=valid"
    st, hd, body = http("GET", f"{APP}/dashboard", cookie=c)
    return st, body.decode(errors="replace")

def bar(title):
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)

# ── Dimension 1: CREATE ACCOUNT (trial signup) ─────────────────────────────
bar("DIMENSION 1 — CREATE ACCOUNT (15-day trial signup)")
ts = int(time.time())
email1 = f"matrix.trial.{ts}@gmail.com"
st, hd, body = http("POST", f"{APP}/api/auth/signup",
                    {"username": f"Trial User {ts}", "email": email1, "password": "matrix-pass-123"})
ok = st == 200 and json.loads(body).get("ok") is True
trial_cookie = any("fluxentiq.trial=valid" in c for c in hd.get("Set-Cookie", "").split("\n"))
sess_cookie = any("auth-token" in c for c in hd.get("Set-Cookie", "").split("\n"))
check("signup endpoint returns ok:true", ok, f"HTTP {st}")
check("trial cookie set on signup", trial_cookie)
check("session cookie set on signup", sess_cookie)

# build a real session cookie via sign-in and confirm dashboard resolves live
sess, err = sign_in_session_cookie(email1, "matrix-pass-123")
check("sign-in (password grant) for new trial user", sess is not None, err or "")
if sess:
    st, html = get_dashboard(sess, trial=True)
    check("dashboard HTTP 200 (trial)", st == 200, f"HTTP {st}")
    check("dashboard shows live user (no demo fallback)", email1 in html)

# ── Dimension 2: SIGN IN (existing trial account) ──────────────────────────
bar("DIMENSION 2 — SIGN IN (existing trial account)")
sess, err = sign_in_session_cookie(email1, "matrix-pass-123")
check("sign-in succeeds", sess is not None, err or "")
if sess:
    st, hd, body = http("POST", f"{APP}/api/license/sync", cookie=sess)
    sd = json.loads(body) if st == 200 else {}
    sync_cookie = any("fluxentiq.trial=valid" in c or "fluxentiq.license=valid" in c
                      for c in hd.get("Set-Cookie", "").split("\n"))
    check("license/sync returns tier", sd.get("ok") is True, f"tier={sd.get('tier')}")
    check("license/sync sets a gate cookie", sync_cookie)
    st, html = get_dashboard(sess, trial=True)
    check("dashboard HTTP 200 after sync", st == 200, f"HTTP {st}")

# ── Dimension 3: PRO LICENSE (activate + sign in) ──────────────────────────
bar("DIMENSION 3 — PRO LICENSE (activate key + sign in)")
st, hd, body = http("POST", f"{APP}/api/license/activate", {"licenseKey": PRO_KEY})
lic = json.loads(body) if st == 200 else {}
check("PRO activation ok", st == 200 and lic.get("ok") is True, f"HTTP {st}: {lic.get('message','')}")
check("PRO tier resolved", lic.get("license", {}).get("tier") == "PRO", lic.get("license", {}).get("tier"))
lic_cookie = any("fluxentiq.license=valid" in c for c in hd.get("Set-Cookie", "").split("\n"))
check("license cookie set (PRO)", lic_cookie)

# sign up a fresh user while PRO is active — must NOT downgrade to trial
email3 = f"matrix.pro.{ts}@gmail.com"
st, hd, body = http("POST", f"{APP}/api/auth/signup",
                    {"username": f"Pro User {ts}", "email": email3, "password": "matrix-pass-123"})
j3 = json.loads(body) if st == 200 else {}
check("signup under PRO license ok", st == 200 and j3.get("ok") is True, f"HTTP {st}")
sess3, err = sign_in_session_cookie(email3, "matrix-pass-123")
check("PRO user sign-in succeeds", sess3 is not None, err or "")
if sess3:
    st, html = get_dashboard(sess3)
    check("PRO dashboard HTTP 200", st == 200, f"HTTP {st}")
    check("PRO dashboard live user", email3 in html)

# confirm license is still PRO (not downgraded by the signup)
st, hd, body = http("POST", f"{APP}/api/license/sync", cookie=sess3)
sd3 = json.loads(body) if st == 200 else {}
check("license still PRO after signup (no downgrade)", sd3.get("tier") == "PRO", sd3.get("tier"))

# ── Dimension 4: ENTERPRISE LICENSE (activate + sign in) ───────────────────
bar("DIMENSION 4 — ENTERPRISE LICENSE (activate key + sign in)")
st, hd, body = http("POST", f"{APP}/api/license/activate", {"licenseKey": ENT_KEY})
lic4 = json.loads(body) if st == 200 else {}
check("ENT activation ok", st == 200 and lic4.get("ok") is True, f"HTTP {st}: {lic4.get('message','')}")
check("ENT tier resolved", lic4.get("license", {}).get("tier") == "ENTERPRISE", lic4.get("license", {}).get("tier"))
check("ENT perpetual", lic4.get("license", {}).get("perpetual") is True)

email4 = f"matrix.ent.{ts}@gmail.com"
st, hd, body = http("POST", f"{APP}/api/auth/signup",
                    {"username": f"Ent User {ts}", "email": email4, "password": "matrix-pass-123"})
j4 = json.loads(body) if st == 200 else {}
check("signup under ENT license ok", st == 200 and j4.get("ok") is True, f"HTTP {st}")
sess4, err = sign_in_session_cookie(email4, "matrix-pass-123")
check("ENT user sign-in succeeds", sess4 is not None, err or "")
if sess4:
    st, html = get_dashboard(sess4)
    check("ENT dashboard HTTP 200", st == 200, f"HTTP {st}")
    check("ENT dashboard live user", email4 in html)
    st, hd, body = http("POST", f"{APP}/api/license/sync", cookie=sess4)
    sd4 = json.loads(body) if st == 200 else {}
    check("license stays ENTERPRISE after signup", sd4.get("tier") == "ENTERPRISE", sd4.get("tier"))

# ── Summary ────────────────────────────────────────────────────────────────
bar("SUMMARY")
passed = sum(1 for _, ok, _ in RESULTS if ok)
total = len(RESULTS)
print(f"{passed}/{total} checks passed")
print("\nTest accounts created (delete if you want a clean slate):")
print(f"  trial : {email1}")
print(f"  pro   : {email3}")
print(f"  ent   : {email4}")
