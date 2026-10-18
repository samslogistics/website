#!/usr/bin/env python3
"""Builds the site's own small Font Awesome files from the full free set.

Why: the full set from a CDN is about 290 KB. The site only uses a few dozen icons, so this script cuts
the stylesheet and the two icon fonts down to just those icons (about 12 KB in total) and writes them to
  frontend/styles/fontawesome-subset.css
  frontend/webfonts/fa-solid-subset.woff2
  frontend/webfonts/fa-brands-subset.woff2

Run it again whenever you add an icon to a page or script:
  1. npm pack @fortawesome/fontawesome-free@6.4.0   (then unpack the .tgz; it makes a folder called "package")
  2. pip install fonttools brotli
  3. python3 scripts/build-icons.py path/to/package
Brand icons (WhatsApp, Instagram, ...) must be listed in BRANDS below.
"""
import re, sys, glob, os
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FA = sys.argv[1] if len(sys.argv) > 1 else 'package'
BRANDS = {'whatsapp', 'instagram', 'facebook-f'}      # icons that live in the Brands font
NOT_ICONS = {'solid', 'brands', 'regular', 'spin', 'ready'}   # style and helper classes, handled separately

# 1. Which icons do the pages and scripts use?
files = glob.glob(ROOT + '/*.html') + glob.glob(ROOT + '/frontend/partials/*.html') + glob.glob(ROOT + '/frontend/scripts/*.js')
used = set()
for f in files:
    used |= set(re.findall(r'\bfa-([a-z0-9-]+)', open(f, encoding='utf-8').read()))
used -= NOT_ICONS
print(len(used), 'icons in use')

# 2. Split the full stylesheet into rules
css = open(FA + '/css/all.min.css', encoding='utf-8').read()
css = re.sub(r'/\*!.*?\*/', '', css, flags=re.S)
rules, i, depth, start = [], 0, 0, 0
for i, ch in enumerate(css):
    if ch == '{': depth += 1
    elif ch == '}':
        depth -= 1
        if depth == 0:
            rules.append(css[start:i + 1]); start = i + 1

icon_rule = re.compile(r'^((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"(\\[0-9a-f]+)"\}$')
kept, code, found = [], {}, set()
for r in rules:
    m = icon_rule.match(r)
    if m:
        sels = [s[:-len(':before')] for s in m.group(1).rstrip(',').split(',')]
        names = [s[4:] for s in sels]
        hit = [n for n in names if n in used]
        if hit:
            kept.append(','.join('.fa-%s:before' % n for n in hit) + '{content:"%s"}' % m.group(2))
            for n in hit:
                code[n] = int(m.group(2)[1:], 16); found.add(n)
        continue
    if r.startswith('@font-face'): continue          # replaced below
    kept.append(r)
missing = used - found
if missing: sys.exit('Icons not found in Font Awesome 6.4.0: %s' % sorted(missing))

# 3. Cut the two fonts down to the icons in use
def cut(src, dst, cps):
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = []; opts.name_IDs = []
    opts.notdef_outline = True; opts.glyph_names = False; opts.hinting = True; opts.recalc_bounds = False
    f = TTFont(src); s = subset.Subsetter(opts); s.populate(unicodes=cps); s.subset(f)
    cmap = f.getBestCmap()
    bad = [hex(c) for c in cps if c not in cmap]
    if bad: sys.exit('Glyphs missing from %s: %s' % (dst, bad))
    f.flavor = 'woff2'; f.save(dst); print(os.path.basename(dst), os.path.getsize(dst), 'bytes')

brand_cps = sorted(code[n] for n in found if n in BRANDS)
solid_cps = sorted(code[n] for n in found if n not in BRANDS)
cut(FA + '/webfonts/fa-solid-900.woff2', ROOT + '/frontend/webfonts/fa-solid-subset.woff2', solid_cps)
cut(FA + '/webfonts/fa-brands-400.woff2', ROOT + '/frontend/webfonts/fa-brands-subset.woff2', brand_cps)

faces = ('@font-face{font-family:"Font Awesome 6 Brands";font-style:normal;font-weight:400;font-display:block;src:url(../webfonts/fa-brands-subset.woff2) format("woff2")}'
         '@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:block;src:url(../webfonts/fa-solid-subset.woff2) format("woff2")}')
header = '/* Font Awesome Free 6.4.0 (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT) - only the icons this site uses. Rebuild with scripts/build-icons.py */\n'
open(ROOT + '/frontend/styles/fontawesome-subset.css', 'w', encoding='utf-8').write(header + faces + ''.join(kept) + '\n')
print('css', os.path.getsize(ROOT + '/frontend/styles/fontawesome-subset.css'), 'bytes;', len(found), 'icons kept')
