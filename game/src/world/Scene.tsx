// Сцена-диорама: свет с мягкими тенями, туман, tilt-shift как у миниатюры, виньетка.
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, TiltShift2, Vignette } from '@react-three/postprocessing'
import { advanceClock, useGame } from '../game/store'
import { Fires, Trucks } from './Actors'
import { CameraRig } from './CameraRig'
import { Forest } from './Forest'
import { Pins } from './Pins'
import { Roads } from './Roads'
import { SiteLayers } from './SiteLayers'
import { Ground, Terrain, Water } from './Terrain'
import { Village } from './Village'

function GameClock() {
  useFrame(() => advanceClock())
  return null
}

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 30, position: [-8, 88, 98], near: 1, far: 900 }}
      // preserveDrawingBuffer в dev — чтобы снимки кадра для проверки визуала были стабильными
      gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: import.meta.env.DEV }}
      onPointerMissed={() => useGame.getState().selectSite(null)}
    >
      <color attach="background" args={['#a7b09a']} />
      <fog attach="fog" args={['#a7b09a', 190, 380]} />
      <hemisphereLight args={['#eef4e6', '#5a5842', 1.05]} />
      <directionalLight
        position={[-70, 110, 55]}
        intensity={2.5}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />

      <GameClock />
      <Ground />
      <Terrain />
      <Water />
      <Roads />
      <Village />
      <Forest />
      <SiteLayers />
      <Trucks />
      <Fires />
      <Pins />
      <CameraRig />

      <EffectComposer multisampling={4}>
        <Bloom luminanceThreshold={1} intensity={0.7} mipmapBlur />
        <TiltShift2 blur={0.14} />
        <Vignette offset={0.25} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  )
}
