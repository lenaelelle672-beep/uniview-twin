import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

export function installMeshopt(loader: GLTFLoader) {
  loader.setMeshoptDecoder(MeshoptDecoder)
}
