import json, math
from PIL import Image, ImageDraw

SCRATCH = r'C:\Users\ADMINI~1\AppData\Local\Temp\2\claude\C--Users-Administrator-Projects-Fakieh\b985d623-3ce9-4e1a-adf8-474a82f5c077\scratchpad'
IMG = r'C:\Users\Administrator\Documents\Fakieh_SCADA_img\aerial\site_esri_z19_site_grid10m.png'
d = json.load(open(SCRATCH + r'\site.json'))
B = math.radians(d['AXIS']['B'])
AX = (math.sin(B), math.cos(B))
AZ = (math.sin(B + math.pi / 2), math.cos(B + math.pi / 2))
PX_PER_M = 7.2
OX, OY = 1872.5, 1871.5

def to_px(x, z):
    e = x * AX[0] + z * AZ[0]
    n = x * AX[1] + z * AZ[1]
    return (OX + e * PX_PER_M, OY - n * PX_PER_M)

def rect(x, z, length, width):
    hx, hz = length / 2, width / 2
    return [to_px(x - hx, z - hz), to_px(x + hx, z - hz), to_px(x + hx, z + hz), to_px(x - hx, z + hz)]

im = Image.open(IMG).convert('RGB')
dr = ImageDraw.Draw(im, 'RGBA')

def poly(pts, col, w=3):
    dr.polygon(pts, outline=col, width=w) if hasattr(dr, 'polygon') else None
    dr.line(pts + [pts[0]], fill=col, width=w)

# fence
wl = d['SITE']['wall']; poly(rect(wl['x'], wl['z'], wl['length'], wl['width']), (255, 255, 0, 255), 4)
# yard
y = d['SITE']['yard']; poly(rect(y['x'], y['z'], y['length'], y['width']), (0, 255, 255, 255), 3)
# buildings
for b in d['BUILDINGS']:
    poly(rect(b['x'], b['z'], b['length'], b['width']), (255, 40, 40, 255), 4)
# silos
for s in d['SILOS']:
    cx, cy = to_px(s['x'], s['z']); r = s['r'] * PX_PER_M
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 120, 0, 255), width=2)
# neighbours
for b in d['NEIGHBOURS']:
    poly(rect(b['x'], b['z'], b['length'], b['width']), (40, 255, 40, 255), 4)
# streets
for s in d['STREETS']:
    if s['axis'] == 'x': poly(rect(s['x'], s['z'], s['length'], s['width']), (200, 0, 255, 255), 3)
    else: poly(rect(s['x'], s['z'], s['width'], s['length']), (200, 0, 255, 255), 3)
# trees
for t in d['TREE_LINES']:
    (x0, z0), (x1, z1) = t['from'], t['to']; n = int(math.hypot(x1 - x0, z1 - z0) / t['spacing'])
    for i in range(n + 1):
        f = i / max(n, 1); cx, cy = to_px(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)
        dr.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(0, 200, 0, 200))
# tanks
for t in d['TANK_FARM']:
    cx, cy = to_px(t['x'], t['z']); r = t['diameter'] / 2 * PX_PER_M
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 255), width=3)
# containers
c = d['CONTAINER_ROWS'][0]
for rrow in range(c['rows']):
    for i in range(c['perRow']):
        x = c['originX'] + i * c['itemSpacing']; z = c['originZ'] + rrow * c['rowSpacing']
        poly(rect(x, z, 12, 2.4), (255, 140, 0, 255), 2)
# stockpiles
for s in d['STOCKPILES']:
    cx, cy = to_px(s['x'], s['z']); r = s['diameter'] / 2 * PX_PER_M
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(230, 200, 120, 255), width=3)
# vehicles
for v in d['PARKED_VEHICLES']:
    (x0, z0), (x1, z1) = v['from'], v['to']; n = int(math.hypot(x1 - x0, z1 - z0) / v['spacing'])
    for i in range(n + 1):
        f = i / max(n, 1); cx, cy = to_px(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)
        s = 12 if v['kind'] == 'truck' else 6
        dr.rectangle([cx - s, cy - s / 2, cx + s, cy + s / 2], outline=(255, 255, 255, 255) if v['kind'] == 'truck' else (180, 180, 255, 255), width=2)
# roads (ground shader)
for r_ in d['ROADS']:
    poly(rect(r_['x'], r_['z'], r_['length'], r_['width']), (120, 200, 255, 255), 3)
# axis
dr.line([to_px(-150, 0), to_px(150, 0)], fill=(255, 255, 0, 255), width=2)
im.save(SCRATCH + r'\dressing_overlay.png')
im.resize((1871, 1871)).save(SCRATCH + r'\dressing_overlay_small.png')
print('written')
