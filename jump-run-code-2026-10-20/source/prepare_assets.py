"""Cut the supplied character into deterministic paper-rig layers."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
import json
from collections import deque

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
SOURCE = ASSETS / 'input-original.png'
ASSETS.mkdir(exist_ok=True)
source = Image.open(SOURCE).convert('RGBA')
source.putalpha(source.getchannel('A').point(lambda a: min(255, round(a * 255 / 254))))
source.save(ASSETS / 'character.png')
polygons = {
    'front-leg': [(130,182),(154,182),(174,194),(184,214),(196,234),(212,234),(228,230),(245,237),(257,250),(256,263),(241,276),(201,296),(182,290),(169,273),(156,252),(146,233),(132,220),(112,212)],
    'rear-leg': [(107,182),(134,193),(122,213),(94,233),(74,250),(75,261),(83,276),(77,291),(61,297),(29,295),(13,278),(9,251),(18,233),(40,224),(68,204),(88,189)],
    'front-arm': [(178,143),(199,146),(215,143),(226,132),(246,127),(261,136),(271,151),(265,169),(245,183),(219,190),(196,188),(180,176)],
    'rear-arm': [(26,136),(51,107),(79,98),(107,102),(124,115),(119,132),(101,140),(85,136),(69,147),(67,162),(56,176),(32,175),(24,161)],
}
remaining = Image.new('L', source.size, 255)
manifest = {}
for name, points in polygons.items():
    mask = Image.new('L', source.size)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    mask = ImageChops.multiply(mask, remaining)
    layer = source.copy()
    layer.putalpha(ImageChops.multiply(source.getchannel('A'), mask))
    layer.save(ASSETS / (name + '.png'))
    remaining = ImageChops.subtract(remaining, mask)
    manifest[name] = {'bbox': layer.getbbox(), 'polygon': points}
body = source.copy()
body_mask = Image.new('L', source.size)
ImageDraw.Draw(body_mask).polygon([
    (100,98),(98,0),(282,0),(282,129),(236,139),(211,136),
    (193,140),(181,150),(179,181),(165,193),(163,209),
    (142,216),(116,209),(101,205),(90,194),(78,182),
    (70,170),(75,153),(95,134)
], fill=255)
body.putalpha(ImageChops.multiply(source.getchannel('A'), body_mask))
# Remove disconnected leftovers of the original forward fist without changing
# the head/neck contour. The head, coat and waist are one connected component.
alpha = body.getchannel('A')
seen = set()
components = []
for y in range(body.height):
    for x in range(body.width):
        if (x,y) in seen or alpha.getpixel((x,y)) < 8:
            continue
        q = deque([(x,y)]); seen.add((x,y)); component = []
        while q:
            px,py = q.popleft(); component.append((px,py))
            for nx,ny in [(px-1,py),(px+1,py),(px,py-1),(px,py+1)]:
                if 0 <= nx < body.width and 0 <= ny < body.height and (nx,ny) not in seen and alpha.getpixel((nx,ny)) >= 8:
                    seen.add((nx,ny)); q.append((nx,ny))
        components.append(component)
keep = Image.new('L', body.size)
for xy in max(components,key=len):
    keep.putpixel(xy,255)
body.putalpha(ImageChops.multiply(alpha,keep))
body.save(ASSETS / 'body.png')
manifest['body'] = {'bbox': body.getbbox()}
(ASSETS / 'rig.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('Prepared original texture and 5 rig layers.')
