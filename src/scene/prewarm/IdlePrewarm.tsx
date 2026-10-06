import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { useTwinStore } from '../../store/store'
import { collectPrewarmCharacters } from './characters'
import { compileMaterialGroup, programCount } from './compileGroup'
import { preloadLabelFont, textRuntimePrefetchDone, waitTextRuntimePrefetch } from './fontPrewarm'
import { createYieldController, waitIdle } from './idleYield'
import { FLOOR_SHADER_GROUPS } from './shaderGroups'

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
      for (const group of FLOOR_SHADER_GROUPS) {
        await waitTurn()
        if (cancelled) return
        try {
          await compileMaterialGroup(gl, scene, camera, group)
          compiled.push(group.id)
        } catch {
          compiled.push(`${group.id}:error`)
        }
      }
      const shaderMs = performance.now() - shaderStarted

      await waitTurn()
      if (cancelled) return
      const fontStarted = performance.now()
      let fontMs = 0
      try {
        const textReady = textRuntimePrefetchDone() || (await waitTextRuntimePrefetch())
        if (textReady && !cancelled) {
          await waitTurn()
          if (!cancelled) await preloadLabelFont(collectPrewarmCharacters())
        }
        fontMs = performance.now() - fontStarted
      } catch {
        fontMs = performance.now() - fontStarted
      }
      if (cancelled) return

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
      })
    }

    void run().catch(() => {
      if (cancelled) return
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
      })
    })

    return () => {
      cancelled = true
      yieldCtl.dispose()
    }
  }, [camera, gl, scene])

  return null
}
