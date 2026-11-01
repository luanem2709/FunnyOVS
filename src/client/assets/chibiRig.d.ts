/**
 * Kiểu dữ liệu cho chibiRig.js (file JS port từ repo tham khảo MIT).
 */
import type * as THREE from "three";

export interface ChibiConfig {
  name?: string;
  shirt?: string;
  hair?: string;
  skin?: string;
  pants?: string;
  shoes?: string;
  iris?: string;
  tie?: string;
  look?: "toy" | "pixar";
  style?: "bob" | "plain" | "spiky" | "ponytail" | "bun" | "curly";
  outfit?: "hoodie" | "shirt" | "suit";
  acc?: "cap" | "beanie" | "glasses" | "headphones";
}

export interface ChibiRig {
  D: Record<string, number | number[]>;
  look: string;
  blink: Array<{ ball: THREE.Object3D; lash: THREE.Object3D | null }>;
  [key: string]: unknown;
}

export interface ChibiPose {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  armL: [number, number, number];
  armR: [number, number, number];
  lean: number;
  head: [number, number, number];
  y: number;
  tilt: number;
  lid: number;
  mouth: string;
  breathe: number;
  [key: string]: unknown;
}

export interface PoseOptions {
  sit?: boolean;
  look?: number;
  wave?: boolean;
  blink?: boolean;
  scale?: number;
  carry?: string;
  doze?: boolean;
}

export declare function makeChibi(
  cfg?: ChibiConfig,
  scale?: number,
): { root: THREE.Group; P: ChibiRig };

export declare function chibiPose(
  P: ChibiRig,
  anim: string,
  ph: number,
  o?: PoseOptions,
): ChibiPose;

export declare function applyChibiPose(P: ChibiRig, p: ChibiPose, dt: number): number;

export declare function disposeChibi(P: ChibiRig): void;

export declare const LOOKS: Record<string, string>;
