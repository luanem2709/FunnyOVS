"""Sinh icon ứng dụng (assets/icon.png + assets/icon.ico). Chạy: python scripts/make-icon.py"""
from PIL import Image, ImageDraw
import math, os

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# Nền bo góc với gradient chéo tím -> xanh
bg = Image.new("RGBA", (S, S))
px = bg.load()
c1, c2 = (106, 63, 216), (31, 111, 235)
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=220, fill=255)
img.paste(bg, (0, 0), mask)

d = ImageDraw.Draw(img)
cx, cy, r = S // 2, S // 2 + 30, 300
# Khối lập phương isometric (văn phòng 3D)
def pt(a, rr=r):
    return (cx + rr * math.cos(math.radians(a)), cy + rr * math.sin(math.radians(a)))
top = [pt(-90), pt(-30), (cx, cy - r * 0.0 + 0), pt(-150)]
top = [(cx, cy - r), (cx + r * 0.866, cy - r * 0.5), (cx, cy), (cx - r * 0.866, cy - r * 0.5)]
left = [(cx - r * 0.866, cy - r * 0.5), (cx, cy), (cx, cy + r), (cx - r * 0.866, cy + r * 0.5)]
right = [(cx + r * 0.866, cy - r * 0.5), (cx, cy), (cx, cy + r), (cx + r * 0.866, cy + r * 0.5)]
d.polygon(top, fill=(255, 255, 255, 255))
d.polygon(left, fill=(214, 224, 250, 255))
d.polygon(right, fill=(170, 190, 245, 255))
# Cửa sổ trên mặt trái/phải
def quad(face, u0, u1, v0, v1):
    (ax, ay), (bx, by), (cx2, cy2), (dx, dy) = face
    def lerp(p, q, t): return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    def at(u, v):
        top_e = lerp((ax, ay), (bx, by), u)
        bot_e = lerp((dx, dy), (cx2, cy2), u)
        return lerp(top_e, bot_e, v)
    return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
for u in (0.15, 0.58):
    for v in (0.18, 0.58):
        d.polygon(quad(left, u, u + 0.27, v, v + 0.25), fill=(31, 111, 235, 255))
        d.polygon(quad(right, u, u + 0.27, v, v + 0.25), fill=(106, 63, 216, 255))

os.makedirs("assets", exist_ok=True)
img.resize((512, 512), Image.LANCZOS).save("assets/icon.png")
img.save("assets/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("ok")
