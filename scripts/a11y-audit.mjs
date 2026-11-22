/**
 * Kiểm tra tiếp cận (a11y) đơn giản bằng DOM — chạy trong trang bằng Playwright (không cần thư viện ngoài).
 * Bắt các lỗi hay gặp nhất, và cho kết quả ổn định để dùng làm tiêu chí tự động (docs/07-diem-so.md, nhóm J):
 *
 *  - nút / liên kết / tab / ô nhập / ô chọn / vùng nhập không có TÊN truy cập được;
 *  - `lang` của trang không khớp ngôn ngữ giao diện (truyền `expectLang`);
 *  - hộp thoại không có role="dialog" + aria-modal + tên;
 *  - phần tử tương tác có tabindex dương (phá thứ tự bàn phím);
 *  - id trùng lặp; hình ảnh thiếu alt; canvas không có mô tả;
 *  - thiếu vùng aria-live (luôn có mặt trong DOM) để đọc yêu cầu duyệt mới; tablist/tab/tabpanel thiếu liên kết.
 *
 * Trả về mảng chuỗi mô tả lỗi (rỗng = sạch).
 */
export async function auditPage(page, { expectLang } = {}) {
  return page.evaluate(({ expectLang }) => {
    const issues = [];
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const textOf = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const labelledBy = (el) =>
      (el.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .map((id) => (id ? textOf(document.getElementById(id) ?? document.body) : ""))
        .join("")
        .trim();
    const describe = (el) => `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""}> "${textOf(el).slice(0, 30)}"`;

    // 1) Tên truy cập được
    for (const el of document.querySelectorAll("button, a[href], [role=tab], [role=button]")) {
      if (!visible(el) && !el.hasAttribute("hidden")) continue;
      const name = el.getAttribute("aria-label") || labelledBy(el) || textOf(el) || el.getAttribute("title") || "";
      if (!name.trim()) issues.push(`không có tên: ${describe(el)}`);
    }
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (el.type === "hidden" || !visible(el)) continue;
      const wrapped = el.closest("label");
      const labelFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      const name = el.getAttribute("aria-label") || labelledBy(el) || (labelFor && textOf(labelFor)) || (wrapped && textOf(wrapped)) || el.getAttribute("title") || "";
      if (!name.trim()) issues.push(`ô nhập không có nhãn: ${describe(el)} (${el.type || el.tagName.toLowerCase()})`);
    }
    // 2) lang
    if (expectLang && document.documentElement.lang !== expectLang) issues.push(`html lang="${document.documentElement.lang}" ≠ "${expectLang}"`);
    // 3) hộp thoại
    for (const el of document.querySelectorAll(".modal")) {
      if (el.getAttribute("role") !== "dialog" || el.getAttribute("aria-modal") !== "true" || !(el.getAttribute("aria-label") || labelledBy(el))) {
        issues.push(`hộp thoại thiếu role/aria-modal/tên: ${describe(el)}`);
      }
    }
    // 4) tabindex dương
    for (const el of document.querySelectorAll("[tabindex]")) if (Number(el.getAttribute("tabindex")) > 0) issues.push(`tabindex dương: ${describe(el)}`);
    // 5) id trùng
    const ids = new Map();
    for (const el of document.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) issues.push(`id trùng (${n}): ${id}`);
    // 6) hình ảnh / canvas
    for (const el of document.querySelectorAll("img")) if (!el.hasAttribute("alt")) issues.push(`img thiếu alt: ${el.src.slice(0, 40)}`);
    for (const el of document.querySelectorAll("canvas")) {
      const host = el.closest("[aria-label], [role=img]");
      if (!el.getAttribute("aria-label") && !host) issues.push("canvas 3D không có mô tả (aria-label)");
    }
    // 7) vùng thông báo quan trọng
    const announcer = document.querySelector('[data-announcer="approvals"]');
    if (!announcer || announcer.getAttribute("aria-live") !== "assertive") issues.push("thiếu vùng aria-live assertive cho yêu cầu duyệt");
    const flows = document.querySelector('[data-announcer="flows"]');
    if (!flows || flows.getAttribute("aria-live") !== "polite") issues.push("thiếu vùng aria-live polite báo luồng việc kết thúc");
    // 8) từng tablist: có tên, mỗi tab trỏ tới tabpanel có thật, đúng một tab nằm trong thứ tự Tab
    for (const list of document.querySelectorAll('[role="tablist"]')) {
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      if (!(list.getAttribute("aria-label") || labelledBy(list))) issues.push(`tablist không có tên: ${describe(list)}`);
      if (tabs.some((t) => !document.getElementById(t.getAttribute("aria-controls") ?? ""))) issues.push(`tab trỏ tới tabpanel không tồn tại: ${describe(list)}`);
      const inOrder = tabs.filter((t) => t.tabIndex === 0).length;
      if (inOrder !== 1) issues.push(`tablist có ${inOrder} tab trong thứ tự Tab (cần đúng 1): ${describe(list)}`);
    }
    return issues;
  }, { expectLang });
}

/**
 * Tương phản chữ (WCAG 2.x AA): chữ thường ≥ 4,5:1, chữ lớn (≥ 24 px, hoặc ≥ 18,66 px và đậm) ≥ 3:1.
 * Màu nền thật được tính bằng cách chồng các lớp nền trong suốt từ phần tử lên tới lớp đặc đầu tiên. Bỏ qua (không phán đoán) chữ nằm trên
 * canvas 3D hoặc nền gradient/ảnh, nút bị vô hiệu hoá (WCAG miễn), phần tử ẩn hay chỉ dành cho trình đọc màn hình.
 * `auditContrast` trả về mảng mô tả lỗi (đã gộp những chỗ giống nhau: cùng màu chữ/nền/cỡ).
 */
export async function auditContrast(page, options = {}) {
  return (await auditContrastDetailed(page, options)).issues;
}

/** Như `auditContrast` nhưng kèm số liệu: `checked` = số chữ đã đo, `unknown` = số chữ bỏ qua vì không biết nền (canvas/gradient/ảnh). */
export async function auditContrastDetailed(page, { aa = 4.5, large = 3 } = {}) {
  return page.evaluate(({ aa, large }) => {
    const parse = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const lin = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

    /** Nền thật phía sau phần tử, hoặc null nếu không xác định (canvas/gradient/ảnh). */
    const backdrop = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        if (n.tagName === "CANVAS") return null;
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
        const bg = parse(cs.backgroundColor);
        if (bg && bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 0.999) break;
        }
      }
      if (layers.length === 0) return null;
      let acc = layers[layers.length - 1].a >= 0.999 ? layers[layers.length - 1] : over(layers[layers.length - 1], { r: 255, g: 255, b: 255, a: 1 });
      for (let i = layers.length - 2; i >= 0; i--) acc = over(layers[i], acc);
      return acc;
    };
    const opacityOf = (el) => {
      let o = 1;
      for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o;
    };

    const found = new Map();
    let checked = 0;
    let unknown = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || el.closest("[aria-hidden='true'], .sr-only, script, style, canvas, :disabled, [aria-disabled='true']")) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      const bg = backdrop(el);
      if (!bg) {
        unknown++;
        continue;
      }
      const fg0 = parse(cs.color);
      if (!fg0) continue;
      checked++;
      const fg = over({ ...fg0, a: fg0.a * opacityOf(el) }, bg);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const isLarge = size >= 24 || (size >= 18.66 && bold);
      const need = isLarge ? large : aa;
      const got = ratio(fg, bg);
      if (got + 1e-9 >= need) continue;
      const key = `${hex(fg)}|${hex(bg)}|${Math.round(size)}`;
      if (!found.has(key)) found.set(key, { got, need, fg: hex(fg), bg: hex(bg), size: Math.round(size), sample: text.slice(0, 40), count: 0 });
      found.get(key).count++;
    }
    // Chữ gợi ý (placeholder) của ô nhập cũng phải đủ tương phản so với nền ô.
    for (const el of document.querySelectorAll("input[placeholder], textarea[placeholder]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.disabled || getComputedStyle(el).visibility === "hidden") continue;
      const bg = backdrop(el);
      const ph = parse(getComputedStyle(el, "::placeholder").color);
      if (!bg || !ph) continue;
      checked++;
      const got = ratio(over(ph, bg), bg);
      if (got + 1e-9 >= aa) continue;
      const key = `placeholder|${hex(over(ph, bg))}|${hex(bg)}`;
      if (!found.has(key)) found.set(key, { got, need: aa, fg: hex(over(ph, bg)), bg: hex(bg), size: Math.round(parseFloat(getComputedStyle(el).fontSize)), sample: `(gợi ý) ${el.getAttribute("placeholder").slice(0, 30)}`, count: 0 });
      found.get(key).count++;
    }
    const issues = [...found.values()].sort((a, b) => a.got - b.got).map((f) => `tương phản ${f.got.toFixed(2)}:1 < ${f.need}:1 (chữ ${f.fg} trên ${f.bg}, ${f.size}px, ${f.count} chỗ) vd. "${f.sample}"`);
    return { issues, checked, unknown };
  }, { aa, large });
}
