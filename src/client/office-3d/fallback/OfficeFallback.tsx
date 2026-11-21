/**
 * L6 — Dự phòng: bảng danh sách khi không có WebGL (hoặc WebGL mất ngữ cảnh / `?fallback=1`).
 * Dùng cùng store với cảnh 3D nên số liệu luôn khớp.
 */
import { useMemo } from "react";
import { useOfficeStore, entitiesOfKind } from "../store/officeStore.js";
import { StatusDot, statusLabel } from "../ui/panels.js";

export function OfficeFallback({ reason }: { reason: string }) {
  const entities = useOfficeStore((s) => s.entities);
  const departments = useOfficeStore((s) => s.departments);
  const loaded = useOfficeStore((s) => s.loaded);
  const select = useOfficeStore((s) => s.select);
  const selectedId = useOfficeStore((s) => s.selectedId);

  const rows = useMemo(() => {
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    return [...entitiesOfKind(entities, "agent"), ...entitiesOfKind(entities, "machine"), ...entitiesOfKind(entities, "task")].map(
      (e) => ({ e, dept: e.department ? (deptName.get(e.department) ?? e.department) : "—" }),
    );
  }, [entities, departments]);

  return (
    <section className="fallback card" aria-label="Danh sách văn phòng (không dùng 3D)">
      <h2>Văn phòng — chế độ danh sách</h2>
      <p className="muted small">{reason}</p>
      {!loaded ? (
        <p className="muted">Đang tải dữ liệu…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Văn phòng đang trống.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th />
              <th>Tên</th>
              <th>Loại</th>
              <th>Phòng</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, dept }) => (
              <tr key={e.id} className={e.id === selectedId ? "sel" : ""} onClick={() => select(e.id)} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && select(e.id)}>
                <td>
                  <StatusDot status={e.status} />
                </td>
                <td>{e.name}</td>
                <td>{e.kind}</td>
                <td>{dept}</td>
                <td>{statusLabel(e.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
