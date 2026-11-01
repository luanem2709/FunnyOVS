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
    size: { w: 12, d: 9 },
    floor: 0x2b3340,
    props: ["desk", "roadmap"],
  },
  {
    id: "support",
    name: "Phòng Khách hàng",
    short: "Khách hàng",
    leadId: "mai",
    center: { x: -13, z: -5 },
    size: { w: 9, d: 8 },
    floor: 0x2f3a44,
    props: ["desk", "phone"],
  },
  {
    id: "sales",
    name: "Phòng Bán hàng",
    short: "Bán hàng",
    leadId: "long",
    center: { x: 13, z: -5 },
    size: { w: 9, d: 8 },
    floor: 0x3a332c,
    props: ["desk", "funnel"],
  },
  {
    id: "marketing",
    name: "Phòng Marketing",
    short: "Marketing",
    leadId: "huy",
    center: { x: -13, z: 6 },
    size: { w: 9, d: 8 },
    floor: 0x3a2f36,
    props: ["desk", "content"],
  },
  {
    id: "finance",
    name: "Phòng Tài chính",
    short: "Tài chính",
    leadId: "thu",
    center: { x: 13, z: 6 },
    size: { w: 9, d: 8 },
    floor: 0x2c3a33,
    props: ["desk", "chart"],
  },
  {
    id: "ai-team",
    name: "Phòng Đội AI",
    short: "Đội AI",
    leadId: "ban",
    center: { x: 0, z: 11 },
    size: { w: 12, d: 7 },
    floor: 0x2d3346,
    props: ["router", "desk"],
  },
  {
    id: "automation",
    name: "Phòng Làm việc tự động",
    short: "Tự động",
    leadId: "an",
    center: { x: 0, z: -12 },
    size: { w: 12, d: 7 },
    floor: 0x332b3d,
    props: ["terminal", "desk"],
  },
  {
    id: "library",
    name: "Phòng Thư viện",
    short: "Thư viện",
    leadId: "tri",
    center: { x: 0, z: -21 },
    size: { w: 12, d: 7 },
    floor: 0x3b3323,
    props: ["books", "desk"],
  },
  {
    id: "project",
    name: "Phòng Dự án mở rộng",
    short: "Dự án",
    leadId: "",
    center: { x: 20, z: -16 },
    size: { w: 8, d: 7 },
    floor: 0x2f2f36,
    props: ["desk"],
  },
];

export function departmentById(id: string): DepartmentDef | undefined {
  return DEPARTMENTS.find((d) => d.id === id);
}
