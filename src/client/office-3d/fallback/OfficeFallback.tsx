/**
 * L6 — Dự phòng: bảng danh sách khi không có WebGL (hoặc WebGL mất ngữ cảnh / lỗi dựng / `?fallback=1`).
 * Dùng cùng store với cảnh 3D nên số liệu luôn khớp.
 */
import { useMemo } from "react";
import { deptName, useT } from "../i18n/index.js";
import { useOfficeStore, entitiesOfKind } from "../store/officeStore.js";
import { StatusDot } from "../ui/panels.js";

export function OfficeFallback({ reason }: { reason: string }) {
  const t = useT();
  const entities = useOfficeStore((s) => s.entities);
  const loaded = useOfficeStore((s) => s.loaded);
  const select = useOfficeStore((s) => s.select);
  const selectedId = useOfficeStore((s) => s.selectedId);

  const rows = useMemo(
    () =>
      [...entitiesOfKind(entities, "agent"), ...entitiesOfKind(entities, "machine"), ...entitiesOfKind(entities, "task")].map((e) => ({
        e,
        dept: e.department ? deptName(e.department) : t("common.none"),
      })),
    [entities, t],
  );

  return (
    <section className="fallback card" aria-label={t("fallback.title")}>
      <h2>{t("fallback.title")}</h2>
      <p className="muted small">{reason}</p>
      {!loaded ? (
        <p className="muted">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="muted">{t("fallback.empty")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th />
              <th>{t("fallback.name")}</th>
              <th>{t("fallback.type")}</th>
              <th>{t("fallback.room")}</th>
              <th>{t("fallback.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, dept }) => (
              <tr key={e.id} className={e.id === selectedId ? "sel" : ""} onClick={() => select(e.id)} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && select(e.id)}>
                <td>
                  <StatusDot status={e.status} />
                </td>
                <td>{e.name}</td>
                <td>{t(`kind.${e.kind}`)}</td>
                <td>{dept}</td>
                <td>{t(`status.${e.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
