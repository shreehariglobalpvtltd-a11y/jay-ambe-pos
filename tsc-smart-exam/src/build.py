import json, base64, os, zipfile, shutil
R = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(R); D = os.path.join(ROOT, "dist")
os.makedirs(D, exist_ok=True)
b64 = lambda f: base64.b64encode(open(os.path.join(ROOT, "fonts", f), "rb").read()).decode()
db = json.load(open(os.path.join(R, "questions.json")))
tpl = open(os.path.join(R, "app.html")).read()
tpl = (tpl.replace("__F400__", b64("mukta-400.woff2")).replace("__F700__", b64("mukta-700.woff2"))
          .replace("__F400L__", b64("mukta-400-latin.woff2")).replace("__F700L__", b64("mukta-700-latin.woff2"))
          .replace("__DB__", json.dumps(db, ensure_ascii=False))
          .replace("__ICON180__", base64.b64encode(open(os.path.join(R, "icon-180.png"), "rb").read()).decode()))
pwa_head = '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">'
pwa_sw = "if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){navigator.serviceWorker.register('sw.js').catch(function(){})}"
open(os.path.join(D, "artifact.html"), "w").write(tpl)
open(os.path.join(D, "Sangita-TSC-Smart-Exam-offline.html"), "w").write(tpl)
sd = os.path.join(D, "single"); os.makedirs(sd, exist_ok=True)
open(os.path.join(sd, "index.html"), "w").write(tpl.replace("<!--PWA_HEAD-->", "").replace("/*PWA_SW*/", pwa_sw))
pw = os.path.join(D, "pwa"); os.makedirs(pw, exist_ok=True)
open(os.path.join(pw, "index.html"), "w").write(tpl.replace("<!--PWA_HEAD-->", pwa_head).replace("/*PWA_SW*/", pwa_sw))
json.dump({"name": "संगीता TSC स्मार्ट परीक्षा २०८३", "short_name": "TSC संगीता", "start_url": "./index.html", "scope": "./",
           "display": "standalone", "background_color": "#f4f3ff", "theme_color": "#4f46e5", "lang": "ne",
           "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
                     {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]},
          open(os.path.join(pw, "manifest.webmanifest"), "w"), ensure_ascii=False, indent=1)
open(os.path.join(pw, "sw.js"), "w").write("""const C='sangita-tsc-v1';const F=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./questions.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(n=>{const cp=n.clone();caches.open(C).then(c=>c.put(e.request,cp));return n}).catch(()=>caches.match('./index.html'))))});
""")
json.dump(db, open(os.path.join(pw, "questions.json"), "w"), ensure_ascii=False, indent=1)
json.dump(db, open(os.path.join(D, "questions-database.json"), "w"), ensure_ascii=False, indent=1)
for s in ("192", "512"):
    src = os.path.join(R, f"icon-{s}.png")
    if os.path.exists(src): shutil.copy(src, os.path.join(pw, f"icon-{s}.png"))
z = zipfile.ZipFile(os.path.join(D, "Sangita-TSC-PWA.zip"), "w", zipfile.ZIP_DEFLATED)
for f in sorted(os.listdir(pw)): z.write(os.path.join(pw, f), f)
z.close()
print("built", len(db), "questions;", os.path.getsize(os.path.join(D, "artifact.html")) // 1024, "KB")
import re
a = open(os.path.join(D, "artifact.html")).read()
a = a.replace('<!doctype html>\n<html lang="ne">\n<head>\n', '').replace('</head>\n<body>\n', '').replace('</body>\n</html>\n', '')
a = re.sub(r'<meta charset="utf-8">\n<meta name="viewport"[^>]*>\n', '', a)
a = a.replace('<title>संगीता TSC स्मार्ट परीक्षा</title>', '<title>संगीता TSC स्मार्ट परीक्षा</title>\n<meta name="claude:viewport-fit-sides" content="cover">')
open(os.path.join(D, "artifact.html"), "w").write(a)
