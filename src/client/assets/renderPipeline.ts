/**
 * Hậu kỳ render (post-processing) + ánh sáng dựa trên ảnh (IBL).
 *
 * Port từ repo tham khảo `references/my-office` (MIT, © 2026 khanh020905):
 *   - Pipeline HDR: RenderPass → UnrealBloom → OutputPass (ACES tone mapping)
 *   - MSAA 4x trên desktop
 *   - Môi trường IBL từ `RoomEnvironment` (phòng studio sáng)
 *
 * Nếu máy không có GPU (SwiftShader/llvmpipe), bỏ qua hậu kỳ và giảm pixel
 * ratio — tránh mỗi khung hình mất vài giây.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export interface RenderPipeline {
  /** Composer dùng để vẽ khung hình (null nếu bỏ hậu kỳ). */
  composer: EffectComposer | null;
  /** Bloom để điều chỉnh cường độ theo trạng thái. */
  bloom: UnrealBloomPass | null;
  /** Môi trường IBL cho vật liệu kim loại/kính. */
  environment: THREE.Texture | null;
  /** Máy đang dùng phần mềm dựng hình (không có GPU). */
  softwareGL: boolean;
  /** Vẽ một khung hình. */
  render(dt?: number): void;
  /** Giải phóng tài nguyên GPU. */
  dispose(): void;
}

/** Máy có GPU thật không? (SwiftShader/llvmpipe = dựng bằng CPU, rất chậm) */
export function detectSoftwareGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(name);
  } catch {
    return false;
  }
}

/**
 * Dựng pipeline render.
 * @param scene cảnh
 * @param camera camera chính
 * @param renderer renderer đã tạo
 */
export function setupRenderPipeline(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
): RenderPipeline {
  const softwareGL = detectSoftwareGL(renderer);

  // Hậu kỳ + IBL chỉ khi có GPU thật.
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let environment: THREE.Texture | null = null;

  if (!softwareGL) {
    // Image-based light: một phòng studio sáng → kim loại và kính phản chiếu hợp lý.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    environment = pmrem.fromScene(env, 0.04).texture;
    env.dispose?.();
    scene.environment = environment;
    // Rất nhẹ: đèn sẵn có trong cảnh đã đủ sáng, IBL chỉ bổ sung phản chiếu cho
    // kim loại/kính. Giá trị cao sẽ cộng dồn với bloom và rửa trắng cảnh.
    scene.environmentIntensity = 0.1;
    pmrem.dispose();

    const size = new THREE.Vector2();
    renderer.getSize(size);

    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4, // MSAA 4x
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);

    composer.addPass(new RenderPass(scene, camera));
    // Bloom nhẹ: chỉ đèn/màn hình sáng nổi lên. Ngưỡng cao để nền sáng không bị cháy.
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.7, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  } else {
    // Không GPU: giảm tải — nửa pixel, không bóng, không hậu kỳ.
    renderer.setPixelRatio(0.6);
    renderer.shadowMap.enabled = false;
  }

  // Tone mapping ACES: màu vật liệu chân thực hơn, không cháy.
  // Exposure thấp vì cảnh đã có sẵn nhiều đèn (xem assets/lighting.ts).
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  return {
    composer,
    bloom,
    environment,
    softwareGL,
    render(dt?: number) {
      if (composer) composer.render(dt);
      else renderer.render(scene, camera);
    },
    dispose() {
      composer?.dispose();
      environment?.dispose();
    },
  };
}
