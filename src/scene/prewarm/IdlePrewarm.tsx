import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { loadFloorPlan } from '../../floors/loadFloor'
import { useTwinStore } from '../../store/store'
import {
  collectDemoLabelCharacters,
  collectPrewarmCharacterChunks,
  collectPrewarmCharacters,
  demoPrewarmPlansReady,
  pendingDemoPrewarmFloors,
  uniqueCharacters,
} from './characters'
import { compilePeopleGroup, compileTroikaSample, peopleModelUrls } from './extraPrewarm'
import { preloadLabelFont, textRuntimePrefetchDone, waitTextRuntimePrefetch } from './fontPrewarm'
import { createYieldController, waitIdle, waitPrewarmTurn } from './idleYield'
import { programCount, snapshotPrograms } from './programSnapshot'
import { SHADER_PREWARM_ENABLED } from './shaderPrewarmFlag'

function markDone(stats: NonNullable<Window['__twinPrewarm']>) {
  const ended = performance.now()
  window.__twinPrewarmed = true
  window.__twinPrewarmedAt = ended
  window.__twinPrewarm = {
    ...stats,
    doneAt: ended,
    totalMs: ended - stats.startedAt,
  }
}

export function IdlePrewarm() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    let cancelled = false
    const yieldCtl = createYieldController()
    const compiled: string[] = []
    let yielded = 0

    async function waitTurn() {
      yielded += await waitPrewarmTurn(yieldCtl, scene, () => cancelled)
    }

    async function loadDemoPlans() {
      while (!cancelled) {
        const next = pendingDemoPrewarmFloors(useTwinStore.getState().selectedFloor)[0]
        if (!next) return
        await waitTurn()
        if (cancelled) return
        const prioritized = pendingDemoPrewarmFloors(useTwinStore.getState().selectedFloor)[0]
        if (!prioritized) return
        await loadFloorPlan(prioritized)
      }
    }

    async function run() {
      const quality = useTwinStore.getState().quality
      const startedAt = performance.now()
      window.__twinPrewarmStartedAt = startedAt
      const programsBefore = programCount(gl)
      const ext = gl.getContext().getExtension('KHR_parallel_shader_compile')

      if (quality !== 'perf') {
        const deadline = performance.now() + 12_000
        while (!cancelled && window.__twinComposerLive !== true && performance.now() < deadline) {
          await waitIdle(300)
        }
      }
      if (cancelled) return

      const shaderStarted = performance.now()
      if (SHADER_PREWARM_ENABLED) {
        const { compileMaterialGroup } = await import('./compileGroup')
        const { FLOOR_SHADER_GROUPS } = await import('./shaderGroups')
        for (const group of FLOOR_SHADER_GROUPS) {
          await waitTurn()
          if (cancelled) return
          try {
            const before = programCount(gl)
            await compileMaterialGroup(gl, scene, camera, group)
            compiled.push(`${group.id}:+${programCount(gl) - before}`)
          } catch {
            compiled.push(`${group.id}:error`)
          }
        }
      } else {
        compiled.push('shader-prewarm:off')
      }
      const shaderMs = performance.now() - shaderStarted

      await waitTurn()
      if (cancelled) return
      const fontStarted = performance.now()
      let fontMs = 0
      let glyphsPrewarmed = 0
      let glyphsRequired = 0
      let glyphsComplete = false
      try {
        const textReady = textRuntimePrefetchDone() || (await waitTextRuntimePrefetch())
        if (textReady && !cancelled) {
          await loadDemoPlans()
        }
        const characters = collectPrewarmCharacters()
        const chunks = collectPrewarmCharacterChunks()
        glyphsPrewarmed = uniqueCharacters(chunks.join('')).length
        glyphsRequired = collectDemoLabelCharacters().length
        if (textReady && !cancelled) {
          await waitTurn()
          if (cancelled) return
          // D235：一次把演示字形排进图集，避免飞入中途按 2048×32 逐行 readPixels 扩容。
          await preloadLabelFont(uniqueCharacters(chunks.join('')))
          await waitTurn()
          if (!cancelled) {
            const before = programCount(gl)
            await compileTroikaSample(gl, scene, camera, characters)
            compiled.push(`troika-text:+${programCount(gl) - before}`)
          }
        }
        glyphsComplete =
          demoPrewarmPlansReady() &&
          glyphsRequired > 0 &&
          glyphsPrewarmed >= glyphsRequired &&
          [...collectDemoLabelCharacters()].every((glyph) => characters.includes(glyph))
        fontMs = performance.now() - fontStarted
      } catch {
        fontMs = performance.now() - fontStarted
        glyphsComplete = false
      }
      if (cancelled) return
      if (!glyphsComplete) return

      if (SHADER_PREWARM_ENABLED) {
        for (const url of peopleModelUrls(quality !== 'perf')) {
          await waitTurn()
          if (cancelled) return
          try {
            const before = programCount(gl)
            await compilePeopleGroup(gl, scene, camera, url)
            compiled.push(`${url.split('/').pop() ?? url}:+${programCount(gl) - before}`)
          } catch {
            compiled.push(`${url}:error`)
          }
        }
      }

      snapshotPrograms(gl, 'prewarmed')
      // 字形和着色器已经在离屏编完。再要一帧只会在单层收拢后的停稳窗里多记一次提交。
      markDone({
        startedAt,
        doneAt: performance.now(),
        totalMs: 0,
        shaderMs,
        fontMs,
        groups: compiled,
        yielded,
        quality,
        parallelShaderCompile: Boolean(ext),
        programsBefore,
        programsAfter: programCount(gl),
        textRuntimeFirst: textRuntimePrefetchDone(),
        shaderEnabled: SHADER_PREWARM_ENABLED,
        glyphsRequired,
        glyphsPrewarmed,
      })
    }

    void run().catch(() => {
      // 字形没跑完就不置 __twinPrewarmed，避免 QA 在半成品 SDF 上进 F1。
    })

    return () => {
      cancelled = true
      yieldCtl.dispose()
    }
  }, [camera, gl, scene])

  return null
}
