// Сцена реального района: свет, туман, tilt-shift миниатюры, все слои диорамы.
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, TiltShift2, Vignette } from '@react-three/postprocessing'
import { advanceSim, useOps } from '../ops/store'
import { Trucks } from './Actors'
import { CameraRig } from './CameraRig'
import { Forest } from './Forest'
import { Buildings, Roads } from './Infra'
import { Labels } from './Labels'
import { Sites } from './Sites'
import { Terrain, Water } from './Terrain'

function SimClock() {
  useFrame(() => advanceSim())
  return null
}

export function Scene() {
  const area = useOps((s) => s.area)
  const version = useOps((s) => s.version)
  const r = area ? Math.max(area.W, area.D) / 2 + 12 : 120
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 30, position: [0, 132, 150], near: 1, far: 1500 }}
      gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: import.meta.env.DEV }}
      onPointerMissed={() => useOps.getState().select(null)}
    >
      <color attach="background" args={['#a7ae98']} />
      <fog attach="fog" args={['#a7ae98', r * 2.2, r * 4.5]} />
      <hemisphereLight args={['#eef4e6', '#5a5842', 1.05]} />
      <directionalLight
        position={[-r * 0.6, r * 1.1, r * 0.5]}
        intensity={2.5}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-r}
        shadow-camera-right={r}
        shadow-camera-top={r}
        shadow-camera-bottom={-r}
        shadow-camera-near={1}
        shadow-camera-far={r * 4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
      <SimClock />
      {area && (
        <group key={version}>
          <Terrain area={area} />
          <Water area={area} />
          <Roads area={area} />
          <Buildings area={area} />
          <Forest area={area} />
          <Sites area={area} />
          <Trucks area={area} />
          <Labels area={area} />
          <CameraRig area={area} />
        </group>
      )}
      <EffectComposer multisampling={4}>
        <Bloom luminanceThreshold={1} intensity={0.6} mipmapBlur />
        <TiltShift2 blur={0.1} />
        <Vignette offset={0.25} darkness={0.5} />
      </EffectComposer>
    </Canvas>
  )
}
