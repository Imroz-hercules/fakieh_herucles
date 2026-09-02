/**
 * Alarm beacons — a small camera-facing marker above the roof of any bin that
 * is HL-alarming or locked. One `InstancedMesh` of billboarded quads per
 * group, screen-size-clamped so a beacon reads the same whether the camera
 * is 20 m away or 300 m away, which a world-space sprite cannot do.
 *
 * The billboard and the size clamp both happen in the VERTEX shader: the
 * quad's corners are offset in VIEW space (not object space), so they face
 * the camera by construction, and the offset is sized from the desired pixel
 * height divided by the projection's pixels-per-world-unit at that depth —
 * the standard constant-screen-size sprite trick — rather than from the
 * instance's own (drawScale-compressed) model matrix, which would make a
 * micro-hopper's beacon eight times smaller than a bulk silo's for no reason
 * that has anything to do with an alarm's importance.
 *
 * Plain `THREE.ShaderMaterial`, GLSL built by string concatenation — never a
 * backtick in a GLSL template literal, and never a bash heredoc touching this
 * file.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { SiloPlacement } from './silos';

/** Above the roof, in the same real-metre object space as everything else —
    the scene's own vertical exaggeration and per-instance drawScale apply to
    `topY` already; this stays an object-space offset like the rest of the
    silo mesh, not a re-derived world offset. */
const BEACON_LIFT = 0.8;
/** Target rendered size, clamped to the plan's 6-14 px band. */
const BEACON_PX = 10;

const VERT = [
  'attribute vec2 aBeacon;',
  'varying vec2 vUv;',
  'varying vec2 vBeacon;',
  'uniform float uViewportHeight;',
  'uniform float uPixelSize;',
  'void main() {',
  '  vUv = uv;',
  '  vBeacon = aBeacon;',
  '  vec4 worldPos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
  '  vec4 viewPos = viewMatrix * worldPos;',
  '  float pixelsPerUnit = (projectionMatrix[1][1] * uViewportHeight * 0.5) / max(-viewPos.z, 0.001);',
  '  float sizeWorld = uPixelSize / max(pixelsPerUnit, 0.0001);',
  '  viewPos.xy += position.xy * sizeWorld;',
  '  gl_Position = projectionMatrix * viewPos;',
  '}',
].join('\n');

const FRAG = [
  'varying vec2 vUv;',
  'varying vec2 vBeacon;',
  'uniform float uTime;',
  'void main() {',
  '  float hl = vBeacon.x;',
  '  float lock = vBeacon.y;',
  '  if (hl < 0.5 && lock < 0.5) discard;',
  '  vec2 c = vUv - 0.5;',
  '  float d = length(c) * 2.0;',
  '  if (d > 1.0) discard;',
  '  vec3 red = vec3(0.937, 0.267, 0.267);',
  '  vec3 slate = vec3(0.392, 0.455, 0.545);',
  '  vec3 slateDark = vec3(0.20, 0.24, 0.30);',
  '  float pulse = 0.6 + 0.4 * sin(uTime * 5.2);',
  '  vec3 col = red * pulse;',
  '  float alpha = 0.9;',
  '  if (lock > 0.5 && hl < 0.5) {',
  '    float ring = smoothstep(0.62, 0.72, d) * (1.0 - smoothstep(0.85, 0.95, d));',
  '    col = mix(slate, slateDark, ring);',
  '    alpha = 0.95;',
  '  }',
  '  gl_FragColor = vec4(col, alpha * (1.0 - smoothstep(0.9, 1.0, d)));',
  '}',
].join('\n');

export interface BeaconState {
  hl: number;
  lock: number;
}

export function SiloBeacons({
  placements,
  states,
}: {
  placements: SiloPlacement[];
  states: BeaconState[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { size, viewport } = useThree();
  const count = placements.length;

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aBeacon', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2));
    return geo;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uViewportHeight: { value: 720 },
          uPixelSize: { value: BEACON_PX },
          uTime: { value: 0 },
        },
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    let anyActive = false;
    const aBeacon = geometry.getAttribute('aBeacon') as THREE.InstancedBufferAttribute;
    placements.forEach((p, i) => {
      m.makeTranslation(p.x, p.topY + BEACON_LIFT, p.z);
      mesh.setMatrixAt(i, m);
      const s = states[i];
      const hl = s?.hl ?? 0;
      const lock = s?.lock ?? 0;
      if (hl || lock) anyActive = true;
      aBeacon.setXY(i, hl, lock);
    });
    aBeacon.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.visible = anyActive;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, states, geometry]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uViewportHeight.value = size.height * (viewport.dpr || 1);
  });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      name={`beacon:${placements[0]?.group.id ?? 'unknown'}`}
      args={[geometry, material, count]}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
