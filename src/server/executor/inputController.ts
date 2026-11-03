/**
 * Lớp trừu tượng chuột/bàn phím + lớp bọc có "đèn báo" (GĐ 5).
 *
 * Yêu cầu: "Lớp trừu tượng chuột/bàn phím, có overlay và nút hủy khẩn cấp."
 *
 * Thiết kế:
 *  - `InputController` là HỢP ĐỒNG (interface) — không phụ thuộc thư viện cụ thể.
 *    Muốn dùng thật thì cắm `nutjs` / `robotjs` / `powershell` vào.
 *  - `GuardedInputController` bọc controller thật:
 *      + Bật "đèn báo" (overlay) cho mọi thao tác nguy hiểm.
 *      + Cho phép ABORT ngay lập tức (đóng overlay / nhấn Esc).
 *      + Ghi nhật ký mọi thao tác.
 *  - `RecordingInputController` chỉ GHI lại (không thao tác thật) — dùng cho
 *    kiểm thử và để người dùng xem trước tác động.
 *
 * An toàn khi phát triển: controller mặc định là `RecordingInputController`
 * (KHÔNG đụng vào máy thật).
 */
import { EventEmitter } from "node:events";

/** Tọa độ màn hình. */
export interface Point {
  x: number;
  y: number;
}

/** Vùng chụp màn hình. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Kết quả chụp màn hình. */
export interface Screenshot {
  mimeType: string;
  base64: string;
}

/** Hợp đồng điều khiển thiết bị. */
export interface InputController {
  click(x: number, y: number, button: "left" | "right" | "middle", clicks: number): Promise<void>;
  moveTo(x: number, y: number): Promise<void>;
  typeText(text: string): Promise<void>;
  keyPress(key: string, modifiers: string[]): Promise<void>;
  screenshot(region?: Region): Promise<Screenshot>;
}

/** Một sự kiện đã ghi lại. */
export interface InputEvent {
  ts: string;
  kind: "click" | "move" | "type" | "key" | "screenshot";
  detail: Record<string, unknown>;
}

/**
 * Controller chỉ GHI lại — không điều khiển máy thật.
 *
 * Dùng mặc định trong môi trường phát triển / test.
 */
export class RecordingInputController implements InputController {
  readonly events: InputEvent[] = [];

  async click(x: number, y: number, button: string, clicks: number): Promise<void> {
    this.events.push({ ts: new Date().toISOString(), kind: "click", detail: { x, y, button, clicks } });
  }
  async moveTo(x: number, y: number): Promise<void> {
    this.events.push({ ts: new Date().toISOString(), kind: "move", detail: { x, y } });
  }
  async typeText(text: string): Promise<void> {
    // Không ghi nội dung (có thể chứa mật khẩu) — chỉ ghi độ dài.
    this.events.push({ ts: new Date().toISOString(), kind: "type", detail: { length: text.length } });
  }
  async keyPress(key: string, modifiers: string[]): Promise<void> {
    this.events.push({ ts: new Date().toISOString(), kind: "key", detail: { key, modifiers } });
  }
  async screenshot(region?: Region): Promise<Screenshot> {
    this.events.push({ ts: new Date().toISOString(), kind: "screenshot", detail: { region } });
    // 1x1 pixel PNG trong suốt.
    return {
      mimeType: "image/png",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    };
  }
}

/** Trạng thái overlay (đèn báo). */
export interface OverlayState {
  active: boolean;
  /** Mô tả thao tác đang chờ/thực hiện. */
  action: string | null;
  /** Vị trí con trỏ (nếu có). */
  point: Point | null;
  /** Đã hủy chưa. */
  aborted: boolean;
}

/**
 * Controller có đèn báo + nút hủy khẩn cấp.
 *
 * - Mỗi thao tác nguy hiểm sẽ bật overlay trước (UI hiển thị).
 * - `abort()` dừng ngay lập tức, các lệnh sau trả về `false`.
 */
export class GuardedInputController extends EventEmitter implements InputController {
  private overlay: OverlayState = { active: false, action: null, point: null, aborted: false };

  constructor(private readonly inner: InputController) {
    super();
  }

  /** Trạng thái overlay hiện tại. */
  get overlayState(): OverlayState {
    return { ...this.overlay };
  }

  /** Hủy khẩn cấp — dừng mọi thao tác tiếp theo. */
  abort(): void {
    this.overlay.aborted = true;
    this.overlay.active = false;
    this.emit("overlay", this.overlayState);
    this.emit("aborted");
  }

  /** Bỏ cờ hủy (để dùng lại). */
  reset(): void {
    this.overlay = { active: false, action: null, point: null, aborted: false };
    this.emit("overlay", this.overlayState);
  }

  /** Bật/tắt overlay thủ công. */
  setOverlay(active: boolean, action: string | null = null, point: Point | null = null): void {
    this.overlay.active = active;
    this.overlay.action = action;
    this.overlay.point = point;
    this.emit("overlay", this.overlayState);
  }

  /** Bọc một thao tác: bật overlay → chạy → tắt overlay. */
  private async withOverlay<T>(
    action: string,
    point: Point | null,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    if (this.overlay.aborted) return null;
    this.setOverlay(true, action, point);
    this.emit("input", { ts: new Date().toISOString(), kind: "action", detail: { action } });
    try {
      return await fn();
    } finally {
      this.setOverlay(false);
    }
  }

  async click(x: number, y: number, button: "left" | "right" | "middle", clicks: number): Promise<void> {
    await this.withOverlay(`Bấm chuột tại (${x}, ${y})`, { x, y }, () =>
      this.inner.click(x, y, button, clicks),
    );
  }

  async moveTo(x: number, y: number): Promise<void> {
    await this.withOverlay(`Di chuyển chuột tới (${x}, ${y})`, { x, y }, () => this.inner.moveTo(x, y));
  }

  async typeText(text: string): Promise<void> {
    await this.withOverlay(`Gõ ${text.length} ký tự`, null, () => this.inner.typeText(text));
  }

  async keyPress(key: string, modifiers: string[]): Promise<void> {
    await this.withOverlay(`Nhấn phím ${key}`, null, () => this.inner.keyPress(key, modifiers));
  }

  async screenshot(region?: Region): Promise<Screenshot> {
    const shot = await this.withOverlay("Chụp màn hình", null, () => this.inner.screenshot(region));
    return shot ?? { mimeType: "image/png", base64: "" };
  }
}

/**
 * Controller "ma" — chạy lệnh PowerShell để điều khiển chuột/bàn phím.
 *
 * CHƯA BẬT MẶC ĐỊNH (để an toàn khi phát triển). Khi bật:
 *  - Dùng `Add-Type` + `user32.dll` (SetCursorPos, mouse_event, keybd_event).
 *  - Chụp màn hình: `System.Drawing` + `CopyFromScreen`.
 *
 * Yêu cầu phải bật Cấp 3 (Toàn quyền) — Executor đã kiểm tra điều này.
 */
export class PowerShellInputController implements InputController {
  async click(x: number, y: number, button: "left" | "right" | "middle", clicks: number): Promise<void> {
    await this.ps(`
Add-Type -Namespace Win -Name Native -MemberDefinition '
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
'
$flags = switch ('${button}') { 'right' { 0x0008 } 'middle' { 0x0020 } default { 0x0002 } }
for ($i = 0; $i -lt ${clicks}; $i++) {
  [Win.Native]::SetCursorPos(${x}, ${y})
  Start-Sleep -Milliseconds 40
  [Win.Native]::mouse_event($flags, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 40
}`);
  }

  async moveTo(x: number, y: number): Promise<void> {
    await this.ps(`
Add-Type -Namespace Win -Name Native -MemberDefinition '
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
'
[Win.Native]::SetCursorPos(${x}, ${y})`);
  }

  async typeText(text: string): Promise<void> {
    // Gõ bằng SendKeys (ký tự đặc biệt phải escape cho SendKeys).
    const escaped = text.replace(/([+^%~(){}\[\]])/g, "{$1}");
    await this.ps(
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')`,
    );
  }

  async keyPress(key: string, modifiers: string[]): Promise<void> {
    const map: Record<string, string> = {
      enter: "{ENTER}",
      tab: "{TAB}",
      esc: "{ESC}",
      escape: "{ESC}",
      backspace: "{BACKSPACE}",
      delete: "{DELETE}",
      up: "{UP}",
      down: "{DOWN}",
      left: "{LEFT}",
      right: "{RIGHT}",
      space: "{SPACE}",
      ctrl: "^",
      alt: "%",
      shift: "+",
    };
    const base = map[key.toLowerCase()] ?? key;
    const prefix = modifiers
      .map((m) => map[m.toLowerCase()] ?? "")
      .join("");
    await this.ps(
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${prefix}${base}')`,
    );
  }

  async screenshot(region?: Region): Promise<Screenshot> {
    const r = region ?? { x: 0, y: 0, w: 1920, h: 1080 };
    const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(${r.w}, ${r.h})
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(${r.x}, ${r.y}, 0, 0, $bmp.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[Console]::Out.Write([Convert]::ToBase64String($ms.ToArray()))`;
    const out = await this.ps(ps);
    return { mimeType: "image/png", base64: out.trim() };
  }

  private async ps(script: string): Promise<string> {
    const { runPowerShell } = await import("./powerShell.js");
    const r = await runPowerShell(script, process.cwd(), 15_000);
    if (!r.ok) throw new Error(r.stderr || r.error || "Lệnh điều khiển thất bại.");
    return r.stdout;
  }
}
