/**
 * Cầu nối giao diện → vỏ Electron: số việc chờ duyệt hiện trên khay hệ thống, và thông báo Windows khi có yêu cầu duyệt MỚI
 * (vỏ chỉ hiện thông báo khi cửa sổ không đang được nhìn). Trong trình duyệt thường thì không làm gì.
 *
 * Yêu cầu đã có sẵn lúc mở ứng dụng được tính vào số đếm nhưng chỉ thông báo một lần cho mỗi yêu cầu, kể cả khi kết nối lại.
 */
import { useEffect, useRef } from "react";
import { messageText, tr } from "../i18n/index.js";
import { desktop } from "../lib/desktop.js";
import { useOfficeStore } from "../store/officeStore.js";

export function useDesktopAlerts(): void {
  const approvals = useOfficeStore((s) => s.approvals);
  const notified = useRef(new Set<string>());
  const lastCount = useRef(-1);

  useEffect(() => {
    const d = desktop();
    if (!d) return;
    const ids = Object.keys(approvals);
    if (ids.length !== lastCount.current) {
      lastCount.current = ids.length;
      d.setPending?.(ids.length);
    }
    for (const id of ids) {
      if (notified.current.has(id)) continue;
      notified.current.add(id);
      const a = approvals[id];
      d.notify?.(tr("alert.approval.title"), messageText(tr, { key: a.key, vars: a.vars, text: a.summary }));
    }
  }, [approvals]);
}
