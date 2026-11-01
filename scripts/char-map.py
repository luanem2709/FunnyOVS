"""
Kiểm tra nhân vật trong ảnh cảnh 3D bằng bản đồ vùng màu (vì không xem được
ảnh trực tiếp trong một số phiên làm việc).

Dùng: python scripts/char-map.py docs/shots/closeup-minh.png [cropX cropY cropW cropH]
"""
import sys
from PIL import Image

# (ký hiệu, test(r,g,b))
PALETTE = [
    (" ", lambda r, g, b: r > 195 and g > 205 and b > 215),        # nền
    (".", lambda r, g, b: r > 215 and g > 208 and b > 195 and r - b < 26),  # bàn/tường sáng
    ("H", lambda r, g, b: r < 95 and g < 78 and b < 68 and r > 18),  # tóc
    ("S", lambda r, g, b: r > 195 and 140 < g < 225 and 110 < b < 205 and r - b > 38),  # da
    ("E", lambda r, g, b: r < 70 and g < 60 and b < 60),            # mắt/tối
    ("A", lambda r, g, b: r > 130 and 60 < g < 150 and 130 < b < 240 and r - g > 40),  # áo magenta
    ("P", lambda r, g, b: r < 105 and g < 110 and 90 < b < 140),    # quần xanh đen
    ("M", lambda r, g, b: b > 120 and b - r > 45 and g < b),       # màn hình
    ("O", lambda r, g, b: r > 140 and 100 < g < 185 and b < 135),   # gỗ
    ("?", lambda r, g, b: True),
]


def classify(r, g, b):
    for ch, test in PALETTE:
        if test(r, g, b):
            return ch
    return "?"


def main():
    path = sys.argv[1]
    im = Image.open(path).convert("RGB")
    if len(sys.argv) > 5:
        x0, y0, cw, chh = (int(v) for v in sys.argv[2:6])
        im = im.crop((x0, y0, x0 + cw, y0 + chh))
    w = 110
    ratio = im.height / im.width
    height = max(1, int(w * ratio * 0.5))
    small = im.resize((w, height), Image.LANCZOS)
    px = list(small.getdata())
    counts = {}
    for y in range(height):
        row = ""
        for x in range(w):
            ch = classify(*px[y * w + x])
            counts[ch] = counts.get(ch, 0) + 1
            row += ch
        print(row)
    print()
    print(" | ".join(f"{k}={v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
