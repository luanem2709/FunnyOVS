#!/usr/bin/env python3
"""Cong cu cho kich ban What If (Shot Builder).
  python3 wi_tools.py check canh.json            kiem tra id, nhip canh, thong ke
  python3 wi_tools.py tts canh.json [out.txt]    xuat file TTS sach (moi cau mot dong)
  python3 wi_tools.py sync canh.json giong.srt [out.json]   khop canh voi SRT -> JSON dua vao tool
  python3 wi_tools.py chapters canh.json          moc chuong (timestamp) cho mo ta YouTube
  python3 wi_tools.py seocheck seo.txt            kiem tra do dai tieu de / mo ta / tag / hashtag
"""
import difflib, json, re, sys

FPS = 30
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()

def say(n):
    n = int(n)
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000: return ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + say(n % 100))
    if n < 1000000: return say(n // 1000) + " thousand" + ("" if n % 1000 == 0 else " " + say(n % 1000))
    return str(n)

def toks(text):
    t = text.lower().replace("’", "'")
    t = re.sub(r"(\d),(\d{3})", r"\1\2", t)
    t = re.sub(r"\d+", lambda m: " " + say(m.group(0)) + " ", t)
    t = t.replace("-", " ")
    return [w for w in re.sub(r"[^a-z0-9à-ỹ' ]+", " ", t).split() if w.strip("'")]

def tc2s(s):
    h, m, rest = s.strip().replace(".", ",").split(":")
    sec, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000

def read_srt(path):
    raw = open(path, encoding="utf-8-sig").read().replace("\r", "")
    cues = []
    for blk in re.split(r"\n\s*\n", raw.strip()):
        ls = [l for l in blk.split("\n") if l.strip()]
        k = next((i for i, l in enumerate(ls) if "-->" in l), None)
        if k is None: continue
        a, b = ls[k].split("-->")
        cues.append((tc2s(a), tc2s(b.split()[0]), " ".join(ls[k + 1:])))
    return cues

def word_times(cues):
    """Thoi diem bat dau tung tu trong SRT: chia thoi gian moi dong theo do dai tu (+ nghi o dau cau)."""
    words, times = [], []
    for a, b, text in cues:
        raw = text.split()
        ws, wt = [], []
        for r in raw:
            tk = toks(r)
            if not tk: continue
            pause = 3 if re.search(r"[.!?…]$", r) else 1.5 if re.search(r"[,;:]$", r) else 0
            for j, w in enumerate(tk):
                ws.append(w); wt.append(len(w) + 1 + (pause if j == len(tk) - 1 else 0))
        tot = sum(wt) or 1
        acc = 0
        for w, x in zip(ws, wt):
            words.append(w); times.append(a + (b - a) * acc / tot); acc += x
    return words, times

IDS = {
 "set": "street park office gym market hospital bus planet living diner classroom2 bedroom2 kitchen2 burst beach jungle camp sea cliff plane studio mall entrance foodcourt fountain store photobooth blackout car lake ward hallway cafeteria schoolhall dodgeball frontyard library cinema recital pillowfort mirror promnight jail checkpath cave cafe tatami paper noirstreet crt chalkboard oldtown schematic tabletop tabletop-top".split(),
 "cam": "wide medium close xclose insert".split(),
 "cast": "nam linh tuan khoa me bo em ba chi thay sep alien ong bacsi yta cogiao canhsat daubep congnhan vdv gamethu mai hung minh daigia embe robot zombie vua trom thungan phihanh tunhan quanguc tiensu tiensu2 barista samurai ninja lanhchua thamtu phatthanh binhsi hiepsi cuopbien caoboi phuthuy viking macarong sieunhan nongdan thamhiem qc1 qc2 qc3 qc4 qc5 qc6 qc7 qc8".split(),
 "facing": "right left front profile-right profile-left".split(),
 "pose": "stand relaxed talk point point_up reach catch hand_up arms_up think shrug hands_on_head facepalm hold hunched recoil tired lean_back wave cheer jump walk run panic dance clap nod shake_head fist_pump shiver spin fall faint float look_around stomp sneak dash typing laugh hands_hips arms_crossed flex phone_ear salute bow kneel sit cover_face shh wave_both bounce shake_fist sleep lie point_laugh scratch_head thumbs_up sob hug high_five push punch kick throw pray beg eat drink yawn stretch jumping_jacks victory hide wipe_sweat tap_foot check_watch peek fly moonwalk crawl".split(),
 "expr": "neutral happy smug shock worried oops cool dizzy tired angry love cry wow sad laugh grin wink shy embarrassed scared disgusted suspicious confused bored excited evil sleepy determined nervous proud crazy sick pout kiss rage relieved drool jealous surprised thinking".split(),
 "prop": "mug cat phone phone_call book books paper papers alarm laptop pizza pizzabox cookie cookies plate plate_top cookie_top calendar paperball coins coconut fish crab bottle banana shell spear sign cage bone campfire coffee notebook pen tablet katana play_button camera sleep_mask price_tag letter lamp chair dog box clapper bulb sticky_note gift basketball umbrella trophy ticket backpack flashlight key money cactus".split(),
 "ui": "title tag toast float sparkle rings dizzy dial gauge chip count label bubble thought question exclaim hearts speed pow zzz music money idea sweat anger".split(),
 "move": "none zoom_in zoom_out crash pan_left pan_right tilt_up tilt_down dutch handheld whip follow two".split(),
 "trans": "cut whip zoom spin flash fade glitch slide pushup wipe iris circle flip dipwhite blinds shake blur slideleft slidedown shrink swirl split diag pixel burn heart star comic".split(),
 "tod": "day sunset night dawn".split(),
 "weather": "none rain snow leaves confetti".split(),
 "crowdMood": "idle watch cheer clap laugh talk dance panic angry walk".split(),
}
LOCO = set("walk run dash sneak fly moonwalk crawl".split())

def load(p):
    d = json.load(open(p, encoding="utf-8"))
    return d, (d["shots"] if isinstance(d, dict) else d)

def check(jpath):
    d, shots = load(jpath)
    err, warn = [], []
    def bad(i, k, v, kind):
        if v is not None and v not in IDS[kind]:
            err.append("Canh %d: %s '%s' khong hop le" % (i, k, v))
    words = 0
    for i, s in enumerate(shots, 1):
        ln = (s.get("line") or "").strip()
        if not ln and i != len(shots):
            warn.append("Canh %d khong co loi doc (chi de canh cuoi khong loi)" % i)
        n = len(toks(ln)); words += n
        if n > 16: warn.append("Canh %d dai %d tu: tach thanh 2 canh" % (i, n))
        stage = s.get("set")
        if stage is not None and (not isinstance(stage, str) or not stage.strip()):
            err.append("Canh %d: set phai la ten boi canh" % i)
        elif stage and stage not in IDS["set"]:
            note = "Tu dung boi canh: " + stage
            if note not in warn:
                warn.append(note)
        bad(i, "cam", s.get("cam"), "cam")
        for k in ("move", "trans", "tod", "weather", "crowdMood"):
            bad(i, k, s.get(k), k)
        if s.get("set") not in ("schematic", "tabletop", "tabletop-top") and not s.get("actors"):
            warn.append("Canh %d khong co nhan vat" % i)
        for a in s.get("actors") or []:
            bad(i, "cast", a.get("cast"), "cast"); bad(i, "facing", a.get("facing"), "facing")
            for k in ("pose", "pose2"): bad(i, k, a.get(k), "pose")
            for k in ("expr", "expr2"): bad(i, k, a.get(k), "expr")
            if (a.get("pose") in LOCO or a.get("pose2") in LOCO) and a.get("to") is None:
                warn.append("Canh %d: di/chay ma khong co 'to' (dich den)" % i)
        for p in s.get("props") or []:
            pt = p.get("type")
            if isinstance(pt, str) and pt.startswith("x_"):  # do vat bo sung: can file CAI_BO_SUNG
                note = "Do vat bo sung (can cai file bo sung): " + pt
                if note not in warn:
                    warn.append(note)
            else:
                bad(i, "prop", pt, "prop")
        for u in s.get("ui") or []: bad(i, "ui", u.get("type"), "ui")
        dur = s.get("dur")
        if dur is not None and not (0.5 <= float(dur) <= 10): err.append("Canh %d: dur %s ngoai 0.5-10" % (i, dur))
    n = len(shots)
    tr = sum(1 for s in shots if s.get("trans") not in (None, "cut"))
    ui = sum(len(s.get("ui") or []) for s in shots)
    mv = sum(1 for s in shots if s.get("move") not in (None, "none"))
    cams = {}
    for s in shots: cams[s.get("cam")] = cams.get(s.get("cam"), 0) + 1
    sec = words / 145 * 60
    run = 1; mx = 1
    for a, b in zip(shots, shots[1:]):
        run = run + 1 if a.get("cam") == b.get("cam") and a.get("set") == b.get("set") else 1; mx = max(mx, run)
    print("%d canh, %d tu, uoc tinh %d:%02d o 145 tu/phut, trung binh %.1f giay/canh" % (n, words, sec // 60, sec % 60, sec / max(1, n)))
    print("Chuyen canh %d%%, chuyen dong may %d%%, chu/hieu ung tren man hinh %d, goc may %s" % (100 * tr // max(1, n), 100 * mv // max(1, n), ui, cams))
    if mx > 3: warn.append("Co %d canh lien tiep cung boi canh + goc may: doi goc" % mx)
    if not 15 <= 100 * tr // max(1, n) <= 40: warn.append("Ti le chuyen canh nen 15-40%")
    for e in err: print("LOI: " + e)
    for w in warn[:40]: print("CANH BAO: " + w)
    print("OK" if not err else "CON %d LOI" % len(err))
    return not err

def tts(jpath, out=None):
    d, shots = load(jpath)
    lines, cur, key = [], [], None
    for s in shots:
        ln = (s.get("line") or "").strip()
        if not ln: continue
        k = s.get("sent", id(s))
        if cur and k != key:
            lines.append(" ".join(cur)); cur = []
        cur.append(ln); key = k
    if cur: lines.append(" ".join(cur))
    out = out or re.sub(r"(\.json)?$", "_tts.txt", jpath, count=1)
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("%d dong TTS -> %s" % (len(lines), out))

def sync(jpath, spath, out=None):
    data = json.load(open(jpath, encoding="utf-8"))
    shots = data["shots"] if isinstance(data, dict) else data
    cues = read_srt(spath)
    sw, st = word_times(cues)
    end = cues[-1][1] + 0.5
    tw, owner = [], []
    for i, s in enumerate(shots):
        for w in toks(s.get("line") or ""):
            tw.append(w); owner.append(i)
    sm = difflib.SequenceMatcher(None, tw, sw, autojunk=False)
    hit = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            hit[blk.a + k] = blk.b + k
    first = {}
    for k, i in enumerate(owner):
        first.setdefault(i, []).append(k)
    starts, quality = [], []
    for i, s in enumerate(shots):
        ks = first.get(i, [])
        m = [k for k in ks if k in hit]
        quality.append(len(m) / len(ks) if ks else None)
        if m:
            k0 = m[0]
            t = st[hit[k0]] - 0.33 * (k0 - ks[0]) - 0.08   # tu dau khong khop: lui lai ~0.33 giay/tu
            starts.append(max(0.0, t))
        else:
            starts.append(None)   # canh im lang / khong khop: noi suy sau
    # noi suy canh khong co moc
    for i in range(len(starts)):
        if starts[i] is None:
            prv = next((j for j in range(i - 1, -1, -1) if starts[j] is not None), None)
            nxt = next((j for j in range(i + 1, len(starts)) if starts[j] is not None), None)
            a = starts[prv] if prv is not None else 0.0
            b = starts[nxt] if nxt is not None else end
            n0 = prv if prv is not None else -1
            n1 = nxt if nxt is not None else len(starts)
            starts[i] = a + (b - a) * (i - n0) / (n1 - n0)
    starts[0] = 0.0
    F = [int(round(x * FPS)) for x in starts] + [int(round(end * FPS))]
    for i in range(1, len(F)):          # moi canh it nhat 0,5 giay, khong lui thoi gian
        F[i] = max(F[i], F[i - 1] + 15)
    out_shots, split = [], 0
    for i, s in enumerate(shots):
        n = F[i + 1] - F[i]
        parts = max(1, -(-n // 270))     # canh > 9 giay: chia lam nhieu canh (tool gioi han 10 giay/canh)
        for p in range(parts):
            c = dict(s)
            fr = n // parts + (1 if p < n % parts else 0)
            c["dur"] = round(fr / FPS, 4)
            if p:
                c["cam"] = {"wide": "medium", "medium": "close", "close": "medium"}.get(s.get("cam"), "medium")
                c.pop("trans", None); split += 1
            out_shots.append(c)
    res = dict(data) if isinstance(data, dict) else {"shots": out_shots}
    res["shots"] = out_shots
    res["sync"] = {"srt": spath.split("/")[-1], "frames": F[-1], "seconds": round(F[-1] / FPS, 2)}
    out = out or re.sub(r"(\.json)?$", "_khop_srt.json", jpath, count=1)
    json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    bad = [(i + 1, q) for i, q in enumerate(quality) if q is not None and q < 0.6]
    silent = [i + 1 for i, q in enumerate(quality) if q is None]
    print("Da khop %d canh voi %d dong SRT. Video dai %.1f giay (giong %.1f giay)." % (len(shots), len(cues), F[-1] / FPS, cues[-1][1]))
    print("Canh khong co loi (noi suy): %s" % (silent or "khong"))
    print("Canh khop kem (<60%% tu): %s" % ([b[0] for b in bad] or "khong"))
    if split: print("Da chia them %d canh vi dai qua 9 giay." % split)
    print("File: " + out)
    return res


def _mmss(t):
    t = int(t); return "%d:%02d" % (t // 60, t % 60) if t < 3600 else "%d:%02d:%02d" % (t // 3600, t // 60 % 60, t % 60)

def chapters(jpath):
    """Moc chuong tu file canh (uu tien file da khop SRT/giong co 'dur'). Moc = canh co chu DAY.../tieu de/bang ngay."""
    d, shots = load(jpath)
    t, marks, est = 0.0, [], False
    for i, s in enumerate(shots):
        label = None
        for u in s.get("ui") or []:
            tx = (u.get("text") or "").strip()
            if u.get("type") == "title" and i > 0:
                label = "The big question"
            if u.get("type") in ("toast", "label") and re.match(r"(DAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|WEEK|MONTH|YEAR|\d+ (HOURS|DAYS|YEARS) LATER)", tx, re.I):
                label = re.sub(r"\s*\d+:\d+.*$", "", tx).split(":")[0].strip().title()
        if not label and s.get("board") and re.match(r"DAY", s["board"], re.I) and (not marks or marks[-1][1].upper() != s["board"].upper()):
            label = s["board"].title()
        if label and (not marks or marks[-1][1] != label):
            marks.append((t, label, (s.get("line") or "")[:60]))
        dur = s.get("dur")
        if dur is None:
            est = True; dur = max(1.2, len(toks(s.get("line") or "")) / 145 * 60)
        t += float(dur)
    out = [(0.0, "Intro", "")]
    for m in marks:
        if m[0] - out[-1][0] >= 10:
            out.append(m)
    if len(out) < 3:
        print("Can it nhat 3 moc cach nhau >= 10 giay; them moc tay.")
    if est:
        print("(Uoc tinh theo 145 tu/phut - chay lai voi file da khop SRT de co gio chinh xac)")
    for a, lab, ln in out:
        print("%s %s   <- %s" % (_mmss(a), lab, ln))
    print("Tong: %s" % _mmss(t))
    return out

def seocheck(path):
    """File SEO dang:  [TITLE] ... [DESCRIPTION] ... [TAGS] ... [HASHTAGS] ..."""
    raw = open(path, encoding="utf-8").read()
    sec = dict((k.upper(), v.strip()) for k, v in re.findall(r"\[([A-Z ]+)\]\s*\n(.*?)(?=\n\[[A-Z ]+\]|\Z)", raw, re.S))
    ok = True
    title = sec.get("TITLE", "").splitlines()[0] if sec.get("TITLE") else ""
    desc = sec.get("DESCRIPTION", "")
    tags = [x.strip() for x in sec.get("TAGS", "").replace("\n", ",").split(",") if x.strip()]
    tagchars = sum(len(x) + (2 if " " in x else 0) for x in tags) + max(0, len(tags) - 1)
    hashtags = re.findall(r"#[A-Za-z]\w*", sec.get("HASHTAGS", "") + " " + desc)
    def line(name, n, lim, good=None):
        nonlocal ok
        flag = "OK" if n <= lim else "QUA GIOI HAN"
        if n > lim: ok = False
        if good and n > good and n <= lim: flag = "OK (nen <= %d)" % good
        print("%-12s %5d / %d  %s" % (name, n, lim, flag))
    line("Tieu de", len(title), 100, 60)
    line("Mo ta", len(desc), 5000)
    line("Tag", tagchars, 500, 480)
    line("Hashtag", len(set(h.lower() for h in hashtags)), 60, 5)
    first = desc.split("\n")[0] if desc else ""
    print("Dong dau mo ta (%d ky tu, hien o ket qua tim kiem ~150): %s" % (len(first), first[:150]))
    ts = re.findall(r"^(\d+:\d{2}(?::\d{2})?)\s", desc, re.M)
    if ts:
        secs = [sum(int(x) * 60 ** k for k, x in enumerate(reversed(t.split(":")))) for t in ts]
        good = ts[0] in ("0:00", "00:00") and len(ts) >= 3 and all(b - a >= 10 for a, b in zip(secs, secs[1:]))
        print("Chuong: %d moc, %s" % (len(ts), "hop le" if good else "KHONG hop le (moc dau 0:00, >= 3 moc, cach nhau >= 10 giay)"))
        ok = ok and good
    if not title.lower().startswith("what if"):
        print("Goi y: tieu de nen bat dau bang 'What If'.")
    print("OK" if ok else "CAN SUA")
    return ok

if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    {"check": check, "tts": tts, "sync": sync, "chapters": chapters, "seocheck": seocheck}[cmd](*args)
