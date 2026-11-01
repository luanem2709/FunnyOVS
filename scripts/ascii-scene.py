"""
Render ảnh cảnh 3D thành ASCII art theo phân loại màu, để kiểm tra hình dạng
nhân vật khi không xem được ảnh.

Dùng: python scripts/ascii-scene.py docs/shots/closeup-minh.png [width]
"""
import sys
from PIL import Image

PALETTE = [
    (" ", lambda r, g, b: r > 200 and g > 210 and b > 220),           # nền trời
    (".", lambda r, g, b: abs(r - 240) < 14 and abs(g - 236) < 14 and abs(b - 226) < 16),  # trắng/bàn
    ("h", lambda r, g, b: r < 90 and g < 75 and b < 65),             # tóc
    ("s", lambda r, g, b: r > 190 and 140 < g < 230 and 120 < b < 210 and r > b + 30),  # da
    ("A", lambda r, g, b: r > 120 and g < 140 and b > 130),           # áo màu
    ("p", lambda r, g, b: r < 110 and g < 110 and b < 120),          # quần/giày tối
    ("m", lambda r, g, b: b > 130 and b - r > 40),                   # màn hình xanh
    ("o", lambda r, g, b: r > 150 and g > 120 and b < 130),           # gỗ/sàn ấm
]


def classify(r, g, b):
    for ch, test in PALETTE:
        if test(r, g, b):
            return ch
    return "?"


def main():
    path = sys.argv[1]
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    im = Image.open(path).convert("RGB")
    ratio = im.height / im.width
    height = max(1, int(width * ratio * 0.5))
    small = im.resize((width, height), Image.LANCZOS)
    px = list(small.getdata())
    for y in range(height):
        print("".join(classify(*px[y * width + x]) for x in range(width)))


if __name__ == "__main__":
    main()
