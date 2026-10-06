import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { useTwinStore } from '../../store/store'
import { collectPrewarmCharacterChunks, collectPrewarmCharacters } from './characters'
import { compilePeopleGroup, compileTroikaSample, peopleModelUrls } from './extraPrewarm'
import { preloadLabelFont, textRuntimePrefetchDone, waitTextRuntimePrefetch } from './fontPrewarm'
import { createYieldController, waitIdle } from './idleYield'
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
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    let cancelled = false
    const yieldCtl = createYieldController()
    const compiled: string[] = []
    let yielded = 0

    async function waitTurn() {
      while (!cancelled) {
        await waitIdle()
        if (cancelled) return
        if (yieldCtl.consumeInterrupt() || yieldCtl.shouldPause(scene)) {
          yielded += 1
          continue
        }
        return
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
      try {
        const textReady = textRuntimePrefetchDone() || (await waitTextRuntimePrefetch())
        const characters = collectPrewarmCharacters()
        const chunks = collectPrewarmCharacterChunks()
        if (textReady && !cancelled) {
          for (const chunk of chunks) {
            await waitTurn()
            if (cancelled) return
            await preloadLabelFont(chunk)
          }
          await waitTurn()
          if (!cancelled) {
            const before = programCount(gl)
            await compileTroikaSample(gl, scene, camera, characters)
            compiled.push(`troika-text:+${programCount(gl) - before}`)
          }
        }
        fontMs = performance.now() - fontStarted
      } catch {
        fontMs = performance.now() - fontStarted
      }
      if (cancelled) return

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
      invalidate()
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
      })
    }

    void run().catch(() => {
      if (cancelled) return
      invalidate()
      markDone({
        startedAt: window.__twinPrewarmStartedAt ?? performance.now(),
        doneAt: performance.now(),
        totalMs: 0,
        shaderMs: 0,
        fontMs: 0,
        groups: compiled,
        yielded,
        quality: useTwinStore.getState().quality,
        parallelShaderCompile: false,
        programsBefore: programCount(gl),
        programsAfter: programCount(gl),
        textRuntimeFirst: textRuntimePrefetchDone(),
        shaderEnabled: SHADER_PREWARM_ENABLED,
      })
    })

    return () => {
      cancelled = true
      yieldCtl.dispose()
    }
  }, [camera, gl, invalidate, scene])

  return null
}
