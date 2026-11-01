/**
 * Định nghĩa 9 phòng ban trong văn phòng 3D + nhân vật trực thuộc.
 *
 * Bố cục (nhìn từ trên xuống, trục X ngang, Z sâu):
 *
 *              ┌──────────────────────┐
 *              │  8. THƯ VIỆN        │
 *              └──────────────────────┘
 *   ┌──────────┐  ┌──────────────┐  ┌──────────┐
 *   │ 2. KHÁCH │  │              │  │ 3. BÁN   │
 *   │    HÀNG  │  │ 1. GIAO VIỆC │  │   HÀNG   │
 *   └──────────┘  │  (bàn của bạn)│  └──────────┘
 *                 └──────────────┘
 *   ┌──────────┐  ┌──────────────┐  ┌──────────┐
 *   │4.MARKETING│ │              │  │ 5. TÀI   │
 *   └──────────┘  └──────────────┘  │  CHÍNH   │
 *                                    └──────────┘
 *              ┌──────────────────────┐
 *              │ 7. LÀM VIỆC TỰ ĐỘNG│
 *              └──────────────────────┘
 *                    (6. ĐỘI AI ở giữa)
 */

export type DepartmentId =
  | "dispatch"
  | "support"
  | "sales"
  | "marketing"
  | "finance"
  | "ai-team"
  | "automation"
  | "library"
  | "project";

export interface DepartmentDef {
  id: DepartmentId;
  name: string;
  short: string;
  /** Nhân vật phụ trách. */
  leadId: string;
  /** Vị trí tâm phòng (toạ độ 3D). */
  center: { x: number; z: number };
  /** Kích thước phòng. */
  size: { w: number; d: number };
  /** Màu sàn. */
  floor: number;
  /** Trang trí đặc trưng. */
  props: RoomProp[];
}

export type RoomProp =
  | "desk"
  | "phone"
  | "funnel"
  | "content"
  | "chart"
  | "router"
  | "terminal"
  | "books"
  | "roadmap";

export const DEPARTMENTS: DepartmentDef[] = [
  {
    id: "dispatch",
    name: "Phòng Giao việc",
    short: "Giao việc",
    leadId: "you",
    center: { x: 0, z: 0 },
    size: { w: 9, d: 7 },
    floor: 0xd8cdb8,
    props: ["desk", "roadmap"],
  },
  {
    id: "support",
    name: "Phòng Khách hàng",
    short: "Khách hàng",
    leadId: "mai",
    center: { x: -13, z: -5 },
    size: { w: 7, d: 6 },
    floor: 0xcfd6d8,
    props: ["desk", "phone"],
  },
  {
    id: "sales",
    name: "Phòng Bán hàng",
    short: "Bán hàng",
    leadId: "long",
    center: { x: 13, z: -5 },
    size: { w: 7, d: 6 },
    floor: 0xd9cdb6,
    props: ["desk", "funnel"],
  },
  {
    id: "marketing",
    name: "Phòng Marketing",
    short: "Marketing",
    leadId: "huy",
    center: { x: -13, z: 6 },
    size: { w: 7, d: 6 },
    floor: 0xd8c7cd,
    props: ["desk", "content"],
  },
  {
    id: "finance",
    name: "Phòng Tài chính",
    short: "Tài chính",
    leadId: "thu",
    center: { x: 13, z: 6 },
    size: { w: 7, d: 6 },
    floor: 0xc8d3ca,
    props: ["desk", "chart"],
  },
  {
    id: "ai-team",
    name: "Phòng Đội AI",
    short: "Đội AI",
    leadId: "ban",
    center: { x: 0, z: 11 },
    size: { w: 9, d: 5.5 },
    floor: 0xc9cede,
    props: ["router", "desk"],
  },
  {
    id: "automation",
    name: "Phòng Làm việc tự động",
    short: "Tự động",
    leadId: "an",
    center: { x: 0, z: -12 },
    size: { w: 9, d: 5.5 },
    floor: 0xd2c6d6,
    props: ["terminal", "desk"],
  },
  {
    id: "library",
    name: "Phòng Thư viện",
    short: "Thư viện",
    leadId: "tri",
    center: { x: 0, z: -21 },
    size: { w: 9, d: 5.5 },
    floor: 0xd9d0b6,
    props: ["books", "desk"],
  },
  {
    id: "project",
    name: "Phòng Dự án mở rộng",
    short: "Dự án",
    leadId: "",
    center: { x: 20, z: -16 },
    size: { w: 6, d: 5.5 },
    floor: 0xd2d2d6,
    props: ["desk"],
  },
];

export function departmentById(id: string): DepartmentDef | undefined {
  return DEPARTMENTS.find((d) => d.id === id);
}
