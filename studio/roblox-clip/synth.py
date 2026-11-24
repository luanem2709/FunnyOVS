"""Tổng hợp giọng đọc bằng edge-tts (dịch vụ online của Microsoft: văn bản trong loi-doc.json được GỬI RA ngoài — app chỉ gọi sau khi người dùng duyệt).

  python synth.py <thư-mục-dự-án> [giọng]

 - Đọc <dự án>/loi-doc.json, ghi <dự án>/voice/v<i>.mp3.
 - Bộ nhớ đệm theo NỘI DUNG: câu nào không đổi (cùng văn bản + cùng giọng) thì không gọi lại dịch vụ; sửa một câu chỉ tổng hợp lại đúng câu đó.
 - Dịch vụ thỉnh thoảng trả "NoAudioReceived" ngẫu nhiên hoặc treo kết nối: mỗi lần thử có hạn 25 giây, tối đa 12 lần.
"""
import asyncio
import hashlib
import json
import os
import sys

import edge_tts

PROJECT = os.path.abspath(sys.argv[1])
VOICE = sys.argv[2] if len(sys.argv) > 2 else "vi-VN-NamMinhNeural"
OUT = os.path.join(PROJECT, "voice")
os.makedirs(OUT, exist_ok=True)
lines = json.load(open(os.path.join(PROJECT, "loi-doc.json"), encoding="utf-8"))
index_path = os.path.join(OUT, "index.json")
try:
    index = json.load(open(index_path, encoding="utf-8"))
except Exception:  # noqa: BLE001
    index = {}


def digest(text):
    return hashlib.sha1(f"{VOICE}|{text}".encode("utf-8")).hexdigest()


async def synth(i, text):
    path = os.path.join(OUT, f"v{i}.mp3")
    h = digest(text)
    if index.get(str(i)) == h and os.path.exists(path) and os.path.getsize(path) > 2000:
        print(f"#{i} đã có", flush=True)
        return True
    last = "?"
    for attempt in range(1, 13):
        try:
            data = bytearray()

            async def pull():
                async for chunk in edge_tts.Communicate(text, VOICE).stream():
                    if chunk["type"] == "audio":
                        data.extend(chunk["data"])

            await asyncio.wait_for(pull(), timeout=25)
            if data:
                with open(path, "wb") as f:
                    f.write(data)
                index[str(i)] = h
                with open(index_path, "w", encoding="utf-8") as f:
                    json.dump(index, f)
                print(f"#{i} ok sau {attempt} lần thử", flush=True)
                return True
        except Exception as e:  # noqa: BLE001
            last = type(e).__name__
        await asyncio.sleep(1.2)
    print(f"#{i} THẤT BẠI ({last}): {text[:50]}", flush=True)
    return False


async def main():
    ok = True
    for i, line in enumerate(lines):
        ok = (await synth(i, line["text"])) and ok
    sys.exit(0 if ok else 1)


asyncio.run(main())
