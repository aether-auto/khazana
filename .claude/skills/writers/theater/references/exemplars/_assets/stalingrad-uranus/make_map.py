#!/usr/bin/env python3
"""Generate the stylized operational base map for the Stalingrad / Operation Uranus
theater exemplar. Pure-PIL, no network, deterministic. ~1200x800.

Geometry is schematic, NOT georeferenced — it is a legible operational canvas for
BattleMap unit/movement/front overlays (coords 0..1 over this image). North is up.
Layout: the great Don bend sweeps down the left and across the top; the Volga runs
down the right edge; Stalingrad city sits on the west bank of the Volga (right);
Kalach-on-the-Don sits at the neck of the Don bend (center); the northern flank
(Romanian 3rd Army sector, Kletskaya/Serafimovich bridgeheads) runs along the upper
Don; the southern flank (Romanian 4th Army sector) lies below the city.
"""
from PIL import Image, ImageDraw, ImageFont
import math

W, H = 1200, 800

# Palette — muted operational-map tones (steppe ochre, river blue, ink)
STEPPE      = (214, 205, 179)   # open steppe / land
STEPPE_HI   = (223, 216, 193)   # lighter relief patches
STEPPE_LO   = (201, 191, 162)   # lower / marshy ground
RIVER       = (120, 150, 168)   # water
RIVER_EDGE  = (92, 122, 140)
CITY        = (150, 128, 110)   # built-up Stalingrad
CITY_EDGE   = (110, 92, 78)
INK         = (58, 52, 44)
INK_SOFT    = (96, 88, 76)
GRID        = (196, 187, 160)

img = Image.new("RGB", (W, H), STEPPE)
d = ImageDraw.Draw(img, "RGBA")

def font(sz, bold=False):
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            continue
    return ImageFont.load_default()

# --- subtle relief patches on the steppe -------------------------------------
import random
random.seed(1942)
for _ in range(140):
    x = random.randint(0, W); y = random.randint(0, H)
    r = random.randint(30, 120)
    col = random.choice([STEPPE_HI, STEPPE_LO])
    d.ellipse([x-r, y-r, x+r, y+r], fill=col + (28,))

# --- faint grid (operational-map feel) ---------------------------------------
for gx in range(0, W, 100):
    d.line([(gx, 0), (gx, H)], fill=GRID + (60,), width=1)
for gy in range(0, H, 100):
    d.line([(0, gy), (W, gy)], fill=GRID + (60,), width=1)

def river(points, width_outer=26, width_inner=16):
    d.line(points, fill=RIVER_EDGE, width=width_outer, joint="curve")
    d.line(points, fill=RIVER, width=width_inner, joint="curve")

# --- The Don (Дон): enters top-left, sweeps the great bend across the upper
#     third, drops south at Kalach, then runs SW off the bottom-left. ----------
don = [
    (-20, 250), (120, 235), (250, 210), (380, 175),   # upper Don, NW flank sector
    (500, 165), (600, 175), (690, 210),               # apex of the bend
    (720, 300), (700, 400),                            # neck near Kalach
    (640, 500), (540, 590), (430, 660), (300, 720),   # runs SW
    (170, 780),
]
river(don, 30, 20)

# tributary: the Chir / lower Don feeder from the west (schematic)
river([(-20, 560), (120, 560), (240, 585), (330, 640)], 16, 10)

# --- The Volga (Волга): down the right edge, Stalingrad on its west bank ------
volga = [
    (1000, -20), (1010, 120), (1000, 260), (985, 400),
    (995, 540), (1015, 680), (1005, 820),
]
river(volga, 34, 24)

# --- The Myshkova river (small, S of the pocket — Wintergewitter high-water) --
river([(560, 690), (680, 665), (800, 655), (900, 665)], 12, 7)

# --- Stalingrad city: a built-up ribbon on the west bank of the Volga ---------
city_poly = [(905, 300), (975, 300), (975, 520), (905, 520)]
d.polygon(city_poly, fill=CITY + (235,), outline=CITY_EDGE)
# hatch the city block to read as "built-up"
for hy in range(310, 520, 12):
    d.line([(905, hy), (975, hy)], fill=CITY_EDGE + (90,), width=1)
# industrial districts (north) — a few darker blocks
for by in (300, 330, 360):
    d.rectangle([912, by, 968, by+16], fill=CITY_EDGE + (120,))

# --- key place markers -------------------------------------------------------
def place(x, y, label, sub=None, big=False, align="left"):
    r = 7 if big else 5
    d.ellipse([x-r, y-r, x+r, y+r], fill=INK, outline=(245,242,232), width=2)
    f = font(19 if big else 16, bold=big)
    tx = x + 12 if align == "left" else x - 12
    anchor = "lm" if align == "left" else "rm"
    # halo for legibility
    for ox, oy in [(-1,-1),(1,-1),(-1,1),(1,1)]:
        d.text((tx+ox, y+oy), label, font=f, fill=(245,242,232,220), anchor=anchor)
    d.text((tx, y), label, font=f, fill=INK, anchor=anchor)
    if sub:
        fs = font(12)
        d.text((tx, y+16), sub, font=fs, fill=INK_SOFT, anchor=anchor.replace("m","m") if anchor[0]!='r' else 'rm')

place(945, 410, "STALINGRAD", "6th Army fixed in the city", big=True, align="right")
place(700, 360, "Kalach", "on-the-Don — the neck", big=True)
place(300, 200, "Serafimovich", "bridgehead", align="left")
place(470, 185, "Kletskaya", "bridgehead", align="left")
place(430, 650, "Kotelnikovo", "(SW) relief start", align="right")
place(560, 690, "Myshkova R.", None, align="left")

# --- sector labels (faint, large, italic-feel) -------------------------------
def sector(x, y, text, color=INK_SOFT, sz=22):
    f = font(sz, bold=True)
    for ox, oy in [(-1,-1),(1,-1),(-1,1),(1,1)]:
        d.text((x+ox, y+oy), text, font=f, fill=(245,242,232,150), anchor="mm")
    d.text((x, y), text, font=f, fill=color + (150,), anchor="mm")

sector(360, 120, "ROMANIAN  3rd  ARMY  SECTOR  (Don flank)")
sector(350, 730, "ROMANIAN  4th  ARMY  SECTOR")
sector(1035, 200, "VOLGA", sz=18)

# --- river name labels tucked on the water -----------------------------------
fr = font(15, bold=True)
d.text((150, 232), "D O N", font=fr, fill=(245,242,232,210), anchor="mm")

# --- compass rose (top-right) ------------------------------------------------
cx, cy = 1120, 90
d.line([(cx, cy-38), (cx, cy+30)], fill=INK, width=3)
d.polygon([(cx, cy-46), (cx-8, cy-30), (cx+8, cy-30)], fill=INK)
d.text((cx, cy-58), "N", font=font(18, bold=True), fill=INK, anchor="mm")

# --- scale bar (bottom-left) -------------------------------------------------
sx, sy = 60, 760
d.line([(sx, sy), (sx+160, sy)], fill=INK, width=3)
for t in (0, 80, 160):
    d.line([(sx+t, sy-6), (sx+t, sy+6)], fill=INK, width=3)
d.text((sx+80, sy-18), "0        40       80 km (approx.)", font=font(12), fill=INK_SOFT, anchor="mm")

# --- title block (bottom-right) ----------------------------------------------
tb = font(14, bold=True)
d.text((W-20, H-30), "STALINGRAD SECTOR — OPERATIONAL SCHEMATIC", font=tb, fill=INK_SOFT, anchor="rm")
d.text((W-20, H-14), "Don bend · Volga · Nov 1942 – Feb 1943 · schematic, not to scale", font=font(11), fill=INK_SOFT, anchor="rm")

# vignette border
d.rectangle([2, 2, W-3, H-3], outline=INK_SOFT + (120,), width=2)

img.save("/Users/arnavmarda/Desktop/Dev/khazana/.claude/skills/writers/theater/references/exemplars/_assets/stalingrad-uranus/stalingrad-terrain.png", optimize=True)
print("wrote stalingrad-terrain.png", img.size)
