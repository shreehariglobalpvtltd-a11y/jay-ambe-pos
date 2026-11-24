import json, os, base64, io
from PIL import Image
R = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(os.path.dirname(R), "papers")
B = "https://blog.educatenepal.com/"
META = [
 dict(key="m83", year="२०८३", lv="माध्यमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा", short="माध्यमिक", mine=False, url=B+"2026/04/tsc-secondary-level-teacher-grade-3rd.html"),
 dict(key="y82", year="२०८२", lv="निम्नमाध्यमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा • सेट C", short="निमावि", mine=True, url=B+"2025/06/tsc-lower-secondary-level-teacher.html"),
 dict(key="l82", year="२०८२", lv="निम्नमाध्यमिक तह", sub="अध्यापन अनुमतिपत्र परीक्षा • सेट C", short="निमावि अनुमतिपत्र", mine=True, url=B+"2025/12/tsc-lower-secondary-level-mabi-teaching.html"),
 dict(key="y81", year="२०८१", lv="निम्नमाध्यमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा • सेट B", short="निमावि", mine=True, url=B+"2024/04/tsc-lower-secondary-level-3rd-teachers.html"),
 dict(key="u80", year="२०८०", lv="निम्नमाध्यमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा • सेट A (२०८०/०१/०९)", short="निमावि", mine=True, src="तपाईंले दिएको PDF (त्यसमा Notice Pati, BG Education स्रोत उल्लेख)", url=""),
 dict(key="p81", year="२०८१", lv="प्राथमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा • सेट C", short="प्रावि C", mine=False, url=B+"2024/07/tsc-primary-level-class-3rd-teacher.html"),
 dict(key="p81d", year="२०८१", lv="प्राथमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा • सेट D", short="प्रावि D", mine=False, url=B+"2024/07/shikshak-sewa-aayog-primary-level-class.html"),
 dict(key="p80", year="२०८०", lv="प्राथमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा • सेट A", short="प्रावि A", mine=False, url=B+"2023/06/teacher-service-commission-tsc-primary.html"),
 dict(key="p80b", year="२०८०", lv="प्राथमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा • सेट C", short="प्रावि C", mine=False, url=B+"2024/05/shikshak-sewa-aayog-tsc-primary-level.html"),
 dict(key="u78", year="२०७८", lv="निम्नमाध्यमिक तह", sub="सामान्य परीक्षा (२०७८/१२/१७) • ६ प्रश्न मात्र", short="निमावि ६ प्रश्न", mine=True, src="तपाईंले दिएको PDF", url=""),
 dict(key="pl78", year="२०७८", lv="प्राथमिक तह", sub="खुला प्रतियोगिता • सामान्य परीक्षा • सेट A", short="प्रावि", mine=False, url=B+"2023/07/tsc-primary-level-teaching-license.html"),
 dict(key="uA", year="२०८३", lv="अनुमानित सेट C", sub="तपाईंको PDF को Model Set A", short="अनुमानित C", mine=False, guess=True, src="तपाईंले दिएको PDF", url=""),
 dict(key="uB", year="२०८३", lv="अनुमानित सेट D", sub="तपाईंको PDF को Model Set B", short="अनुमानित D", mine=False, guess=True, src="तपाईंले दिएको PDF", url=""),
]
def load():
    papers, qs = [], []
    for m in META:
        f = os.path.join(P, "json", m["key"] + ".json")
        if not os.path.exists(f): continue
        d = json.load(open(f))
        m = dict({"src": "educatenepal.com (प्रश्नपत्रको फोटो)", "guess": False}, **m)
        papers.append({k: m[k] for k in ("key","year","lv","sub","short","mine","src","url","guess")})
        for q in d:
            o = {"id": f'{m["key"]}-{q["n"]}', "paper": m["key"], "n": q["n"], "t": q.get("t","gk"), "q": q["q"], "o": q["o"], "a": q["a"],
                 "conf": q.get("conf","high"), "why": q.get("why",""), "wrong": q.get("wrong",""), "tip": q.get("tip","")}
            fg = q.get("fig")
            if fg:
                im = Image.open(os.path.join(P, "img", fg["img"])).convert("RGB")
                y0, y1 = max(0, int(fg["y0"]) - 6), min(im.height, int(fg["y1"]) + 6)
                c = im.crop((0, y0, im.width, y1)); b = io.BytesIO(); c.save(b, "JPEG", quality=70)
                o["fig"] = "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
            qs.append(o)
    papers.sort(key=lambda p: (p["guess"], -int(p["year"].translate(str.maketrans("०१२३४५६७८९","0123456789"))), not p["mine"]))
    return papers, qs
if __name__ == "__main__":
    p, q = load(); print(len(p), "papers", len(q), "questions")
