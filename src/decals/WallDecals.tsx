import { Decal } from '@react-three/drei/core/Decal'
import { Image } from '@react-three/drei/core/Image'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { SRGBColorSpace, Texture } from 'three'
import { assertLocalDecalUrl, sceneBlocksDecal, type StickerView } from './stickers'

function ignoreRaycast() {
  // 贴花不参与拾取，点击继续落到工位和墙。
}

function useLocalMap(url: string): Texture | null {
  const safe = assertLocalDecalUrl(url)
  const [map, setMap] = useState<Texture | null>(null)
  useEffect(() => {
    let disposed = false
    const image = document.createElement('img')
    image.decoding = 'async'
    image.src = safe
    let texture: Texture | null = null
    const fail = () => {
      texture?.dispose()
    }
    image.onload = () => {
      if (disposed) return
      texture = new Texture(image)
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
      setMap(texture)
    }
    image.onerror = fail
    return () => {
      disposed = true
      image.onload = null
      image.onerror = null
      texture?.dispose()
    }
  }, [safe])
  return map
}

function DecalSticker({ sticker, map }: { sticker: StickerView; map: Texture }) {
  return (
    <mesh
      name={`DecalReceiver-${sticker.id}`}
      position={[sticker.x, sticker.y, sticker.z]}
      rotation={[0, sticker.rotY, 0]}
      renderOrder={3}
      raycast={ignoreRaycast}
    >
      <planeGeometry args={[sticker.width, sticker.height]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Decal
        position={[0, 0, 0]}
        rotation={0}
        scale={[sticker.width * 0.86, sticker.height * 0.86, 0.22]}
        map={map}
        polygonOffsetFactor={-10}
        depthTest
        raycast={ignoreRaycast}
      >
        <meshBasicMaterial
          map={map}
          transparent
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-10}
          depthTest
          side={2}
        />
      </Decal>
    </mesh>
  )
}

function ImageSticker({ sticker, map }: { sticker: StickerView; map: Texture }) {
  return (
    <Image
      name={`DecalImage-${sticker.id}`}
      texture={map}
      position={[sticker.x, sticker.y, sticker.z]}
      rotation={[0, sticker.rotY, 0]}
      scale={[sticker.width, sticker.height]}
      transparent
      opacity={0.94}
      renderOrder={3}
      raycast={ignoreRaycast}
    />
  )
}

function Sticker({ sticker, forceImage }: { sticker: StickerView; forceImage: boolean }) {
  const map = useLocalMap(sticker.texture)
  if (!map) return null
  if (forceImage || sticker.mode === 'image') return <ImageSticker sticker={sticker} map={map} />
  return <DecalSticker sticker={sticker} map={map} />
}

/**
 * drei Decal 只挂在这里新建的普通平面上。
 * 不把 InstancedMesh / BatchedMesh 传给 mesh prop。
 * 场景里扫到 Batched 墙时，全部改成 Image 平面。
 */
export function WallDecals({ stickers }: { stickers: readonly StickerView[] }) {
  const invalidate = useThree((state) => state.invalidate)
  const scene = useThree((state) => state.scene)
  const blocked = useMemo(() => sceneBlocksDecal(scene), [scene, stickers])
  useLayoutEffect(() => {
    const probe = window.__twinDecals
    if (probe) {
      const images = stickers.filter((item) => blocked || item.mode === 'image').length
      probe.mounted = stickers.length
      probe.decals = stickers.length - images
      probe.images = images
      probe.blocked = blocked
    }
    invalidate()
    return () => {
      const probe = window.__twinDecals
      if (probe) {
        probe.mounted = 0
        probe.decals = 0
        probe.images = 0
      }
      invalidate()
    }
  }, [blocked, invalidate, stickers])

  return (
    <group name="WallDecals">
      {stickers.map((sticker) => (
        <Sticker key={sticker.id} sticker={sticker} forceImage={blocked} />
      ))}
    </group>
  )
}
