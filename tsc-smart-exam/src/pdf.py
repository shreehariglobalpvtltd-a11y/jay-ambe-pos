import json,base64,html,os
R=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(R)
db=json.load(open(f"{R}/questions.json"))
b=lambda f:base64.b64encode(open(f"{ROOT}/fonts/{f}","rb").read()).decode()
N=lambda x:str(x).translate(str.maketrans("0123456789","०१२३४५६७८९"))
T={"const":"नेपालको संविधान","edu":"शिक्षा ऐन, नियमावली र नीति","psy":"शैक्षिक मनोविज्ञान","method":"शिक्षण विधि","eval":"पाठ्यक्रम तथा मूल्याङ्कन","gk":"सामान्य ज्ञान","iq":"बौद्धिक परीक्षण (IQ)","ict":"सूचना तथा सञ्चार प्रविधि"}
P={"H":"उच्च","M":"मध्यम","L":"सामान्य"};L="कखगघ";e=html.escape
def qhtml(q,i):
    return f'''<div class="q"><div class="qh"><b>{N(i)}.</b> {e(q["q"])} <span class="m">[{T[q["t"]]} • {P[q["p"]]} प्राथमिकता]</span></div>
<div class="op">{"".join(f'<span class="{"ok" if j==q["a"] else ""}">{L[j]}. {e(o)}</span>' for j,o in enumerate(q["o"]))}</div>
<div class="ex"><b>उत्तर: {L[q["a"]]}. {e(q["o"][q["a"]])}</b> — {e(q["why"])} <i>अन्य विकल्प:</i> {e(q["wrong"])} <i>सम्झने तरिका:</i> {e(q["tip"])} <span class="m">स्रोत: {e(q["src"])}</span></div></div>'''
import importlib
quick=[]
for s in "AB":
    seen=set();arr=[q for q in db if q["set"]==s and q["p"]=="H"];out=[]
    for q in arr:
        if q["t"] not in seen and len(out)<6: seen.add(q["t"]);out.append(q)
    for q in arr:
        if len(out)<6 and q not in out: out.append(q)
    quick+=out
years="२०७३ २०७४ २०७५ २०७६ २०७७ २०७८ २०७९ २०८० २०८१ २०८२".split()
h=f'''<html><head><meta charset="utf-8"><style>
@font-face{{font-family:M;font-weight:400;src:url(data:font/woff2;base64,{b("mukta-400.woff2")})}}@font-face{{font-family:M;font-weight:700;src:url(data:font/woff2;base64,{b("mukta-700.woff2")})}}
@font-face{{font-family:ML;font-weight:400;src:url(data:font/woff2;base64,{b("mukta-400-latin.woff2")})}}@font-face{{font-family:ML;font-weight:700;src:url(data:font/woff2;base64,{b("mukta-700-latin.woff2")})}}
@page{{size:A4;margin:14mm 13mm}}body{{font-family:ML,M,sans-serif;font-size:10.5pt;line-height:1.5;color:#1e1b4b}}
.cover{{height:265mm;background:linear-gradient(135deg,#4f46e5,#7c3aed 60%,#f97316);color:#fff;border-radius:16px;padding:30mm 18mm;box-sizing:border-box;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.cover h1{{font-size:40pt;margin:0;letter-spacing:.02em}}.cover h2{{font-size:20pt;margin:8mm 0 2mm}}.cover p{{font-size:14pt;margin:2mm 0}}.cover .g{{color:#fde68a;font-weight:700}}
h2.s{{background:linear-gradient(90deg,#4f46e5,#7c3aed);color:#fff;padding:3mm 5mm;border-radius:8px;font-size:14pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;page-break-after:avoid}}
.q{{border:1px solid #e4e2f5;border-radius:8px;padding:2.5mm 4mm;margin:2.5mm 0;page-break-inside:avoid}}.qh{{font-weight:700}}.m{{font-weight:400;color:#6b6a8a;font-size:8.5pt}}
.op{{display:grid;grid-template-columns:1fr 1fr;gap:0 6mm;margin:1mm 0}}.op .ok{{color:#15803d;font-weight:700}}.ex{{font-size:9.3pt;background:#f4f3ff;padding:1.5mm 3mm;border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #ddd;padding:1.5mm 3mm;text-align:left}}.warn{{background:#ffedd5;border-left:4px solid #f97316;padding:3mm 4mm;border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.pb{{page-break-before:always}}</style></head><body>
<div class="cover"><p class="g">TSC SMART EXAM PREPARATION</p><h1>SANGITA SUNAR</h1><p style="font-size:22pt;font-weight:700">संगीता सुनार</p>
<h2>शिक्षक सेवा आयोग २०८३</h2><p>निम्नमाध्यमिक तह — तृतीय श्रेणी</p><p>प्रथम पत्र — सामान्य परीक्षा</p><p>परीक्षा केन्द्र: पोखरा, गण्डकी प्रदेश</p>
<p style="margin-top:14mm" class="g">१० वर्षका पुराना प्रश्नपत्रको स्थिति तथा २ सम्भावित नमुना सेट</p><p style="font-size:11pt;margin-top:30mm;opacity:.9">यी नमुना सेटका प्रश्न सम्भावित अभ्यास प्रश्न हुन्; आगामी परीक्षामा यही प्रश्न आउने ग्यारेन्टी होइन।</p></div>
<h2 class="s">परीक्षा ढाँचा र अंक गणना</h2><table><tr><td>जम्मा प्रश्न</td><td>५० वस्तुगत</td><td>प्रतिप्रश्न अंक</td><td>२</td></tr><tr><td>पूर्णाङ्क</td><td>१००</td><td>उत्तीर्णाङ्क</td><td>५०</td></tr><tr><td>समय</td><td>१ घण्टा</td><td>गलत उत्तर</td><td>२०% = ०.४ अंक कट्टा</td></tr><tr><td>उत्तर नदिएमा</td><td colspan="3">अंक काटिँदैन</td></tr></table>
<p>प्राप्ताङ्क = (सही × २) − (गलत × ०.४)</p><p class="warn">यो ढाँचा सार्वजनिक समाचार र तयारी स्रोतमा आधारित छ। परीक्षाअघि tsc.gov.np को विज्ञापन/पाठ्यक्रममा अवश्य पुष्टि गर्नुहोस्।</p>
<h2 class="s">SET ०१–१० : वर्षअनुसार वास्तविक प्रश्नपत्रको स्थिति</h2><table><tr><th>सेट</th><th>साल</th><th>स्थिति</th></tr>{"".join(f"<tr><td>SET {N(str(i+1).zfill(2))}</td><td>{y}</td><td>प्रमाणित प्रश्नपत्र उपलब्ध छैन — दुई विश्वसनीय स्रोतबाट जाँच्न सकिएन, त्यसैले राखिएको छैन</td></tr>" for i,y in enumerate(years))}</table>
<p>काल्पनिक प्रश्नलाई वास्तविक पुरानो प्रश्न भनेर राखिएको छैन। प्रमाणित प्रश्नपत्र पाएपछि एपको “डाटा र प्रश्न थप” बाट थप्न सकिन्छ।</p>
<h2 class="s pb">SET ११ — २०८३ सम्भावित Model Set A (५० प्रश्न)</h2>{"".join(qhtml(q,i+1) for i,q in enumerate([q for q in db if q["set"]=="A"]))}
<h2 class="s pb">SET १२ — २०८३ सम्भावित Model Set B (५० प्रश्न)</h2>{"".join(qhtml(q,i+1) for i,q in enumerate([q for q in db if q["set"]=="B"]))}
<h2 class="s pb">Special Quick Test (१२ प्रश्न — A बाट ६, B बाट ६)</h2>{"".join(qhtml(q,i+1) for i,q in enumerate(quick))}
<h2 class="s pb">उत्तर कुञ्जी (छिटो जाँच)</h2><table><tr><th>Set A</th><td>{" ".join(f"{N(i+1)}-{L[q['a']]}" for i,q in enumerate([q for q in db if q['set']=='A']))}</td></tr><tr><th>Set B</th><td>{" ".join(f"{N(i+1)}-{L[q['a']]}" for i,q in enumerate([q for q in db if q['set']=='B']))}</td></tr></table>
</body></html>'''
open(f"{ROOT}/dist/print.html","w").write(h)
