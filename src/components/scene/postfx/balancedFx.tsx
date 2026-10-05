import { ContactShadows } from '@react-three/drei/core/ContactShadows'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import {
  CONTACT_SHADOW_FAR,
  CONTACT_SHADOW_POSITION,
  CONTACT_SHADOW_RESOLUTION,
  CONTACT_SHADOW_SCALE,
  SHELL_VERSION,
} from '../../../scene/shellVersion'

/**
 * 只在模型所在的 Suspense 里、排在楼和场地后面挂。
 * frames={1}：楼加载完后的第一帧烘一次，之后不再每帧重画场景深度。
 */
export function ContactGround() {
  return (
    <ContactShadows
      key={SHELL_VERSION}
      frames={1}
      position={CONTACT_SHADOW_POSITION}
      scale={CONTACT_SHADOW_SCALE}
      far={CONTACT_SHADOW_FAR}
      opacity={0.5}
      blur={2.1}
      smooth
      resolution={CONTACT_SHADOW_RESOLUTION}
      color="#2c261c"
    />
  )
}

/**
 * 只在非性能档挂载。合成器会把 gl.toneMapping 强制成 NoToneMapping，
 * 所以 AgX 必须写在合成器末尾，不能只靠 Canvas 上的设置。
 */
export function PostFX() {
  return (
    <EffectComposer multisampling={4} enableNormalPass={false} stencilBuffer={false} renderPriority={1}>
      <N8AO
        quality="performance"
        halfRes
        screenSpaceRadius
        aoRadius={2.2}
        intensity={1.05}
        distanceFalloff={1.1}
        denoiseSamples={4}
        denoiseRadius={2}
      />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  )
}
