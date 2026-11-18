/**
 * Bubble simulator for the bubble weight ring.
 *
 * Mix is tracked in millilitres from dish to loop to bubble, using numbers
 * from real soap films:
 *   - a bubble wall is about 1.5 µm thick when it leaves the loop, so a 35 mm
 *     bubble carries ~0.006 ml; re-forming the film across the loop costs a
 *     film ~5 µm thick
 *   - a loop holds ~0.05 ml in its meniscus per 24 mm of diameter, about
 *     twice that with grooves round the inside
 *   - a dip also wets the outside of the tyre (~50 µm of mix), which drips
 *     and flings off rather than making bubbles
 *   - spinning flings mix off the loops once the outward pull passes ~0.6 g;
 *     that is where most of a real dip goes on a fast spinner
 *   - a film only blows out into a bubble once air goes through the loop
 *     faster than ~0.9 m/s; below that it just bellies and holds
 * The rest is look: bubbles leave the trailing side of each loop, drag slows
 * them within a fraction of a second, they sink slowly and pop after a few
 * seconds.
 */

import * as THREE from 'three'

const MM3_PER_ML = 1000
const G = 9810 // mm/s²

export class BubbleSim {
  constructor(scene, spinner) {
    this.scene = scene
    this.spinner = spinner
    this.info = null
    this.dishSize = 250 // ml
    this.dish = this.dishSize
    this.loops = [] // per loop: { mix (ml), film (bool), grow (0..1), size (mm) }
    this.stats = { bubbles: 0, flung: 0, used: 0, dips: 0, lastDip: 0 }
    this.bubbles = [] // world space: { p, v, r, age, life }
    this.drops = [] // flung droplets
    this.autoDip = false
    this.coat = 0
    this.enabled = false

    // A bubble is nearly clear face-on and bright at the edges, where the
    // light grazes the film; the thin-film colours shift with that angle.
    this.uniforms = { uTime: { value: 0 } }
    const bubbleMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          mat4 m = modelMatrix;
          #ifdef USE_INSTANCING
            m = modelMatrix * instanceMatrix;
          #endif
          vec4 wp = m * vec4(position, 1.0);
          vN = normalize(mat3(m) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime; varying vec3 vN; varying vec3 vV;
        vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main() {
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float a = 0.03 + 0.6 * pow(f, 2.6);
          vec3 c = mix(vec3(1.0), hue(f * 1.3 + uTime * 0.05 + vN.y * 0.25), 0.65);
          // a soft highlight, as from a light up and to the left
          float spec = pow(max(dot(reflect(-normalize(vV), normalize(vN)), normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 60.0);
          gl_FragColor = vec4(c + spec, a + spec * 0.8);
        }`,
    })
    const filmMat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    this.bubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 28, 18), bubbleMat, 400)
    this.growMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 12), bubbleMat, 64)
    this.filmMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 36), filmMat, 64)
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.1, transparent: true, opacity: 0.7 }),
      300
    )
    for (const m of [this.bubbleMesh, this.growMesh, this.filmMesh, this.dropMesh]) {
      m.count = 0
      m.frustumCulled = false
      m.renderOrder = 3
    }
    scene.add(this.bubbleMesh, this.dropMesh)
    spinner.add(this.growMesh, this.filmMesh) // these turn with the hub
    this.tmp = new THREE.Object3D()
  }

  /** Ring geometry from the build. Resets the loops if the ring changed. */
  setRing(info) {
    const same = this.info && info && info.loops === this.info.loops && info.loopR === this.info.loopR
    this.info = info
    if (!same) this.loops = info ? Array.from({ length: info.loops }, () => ({ mix: 0, film: false, grow: 0, size: 0 })) : []
  }

  /** ml one loop holds after a dip. */
  capacity() {
    const i = this.info
    return i ? 0.05 * ((2 * i.loopR) / 24) * (i.grooves ? 2 : 1) : 0
  }

  dip() {
    if (!this.info) return 'No bubble ring on this hub.'
    const coat = (this.info.tyreArea * 0.05) / MM3_PER_ML // the tyre gets wet too
    let need = coat
    for (const l of this.loops) need += this.capacity() - l.mix
    if (this.dish < need) return `Not enough mix in the dish (${this.dish.toFixed(1)} ml left, a dip takes ${need.toFixed(1)} ml). Refill it.`
    this.dish -= need
    this.stats.used += need
    this.stats.dips++
    this.stats.lastDip = 0
    for (const l of this.loops) Object.assign(l, { mix: this.capacity(), film: true, grow: 0 })
    // the coating flings off over the next second or two
    this.coat = coat
    return null
  }

  refill() {
    this.dish = this.dishSize
  }

  onLoops() {
    return this.loops.reduce((a, l) => a + l.mix, 0)
  }

  update(dt, revPerSec, spinning) {
    this.uniforms.uTime.value += dt
    const i = this.info
    if (!this.enabled || !i) {
      this.bubbleMesh.count = this.growMesh.count = this.filmMesh.count = this.dropMesh.count = 0
      return
    }
    const omega = spinning ? revPerSec * Math.PI * 2 : 0
    const rimSpeed = (omega * i.loopC) / 1000 // m/s at the loops
    // edge-on loops face the way they move; flat loops get no air from spinning
    const air = i.dir === 'flat' ? 0 : rimSpeed
    const pull = (omega * omega * i.loopC) / G // outward pull in g
    const cap = this.capacity()
    const filmCost = (Math.PI * i.loopR * i.loopR * 0.005) / MM3_PER_ML

    // the tyre coating flings off first
    if (this.coat > 0 && pull > 0.2) {
      const off = Math.min(this.coat, this.coat * 1.5 * dt * pull)
      this.coat -= off
      this.stats.flung += off
      this.spawnDrops(Math.ceil(off * 400), i, omega)
    }

    const sp = this.spinner.rotation.z
    let anyDry = this.loops.length > 0
    this.loops.forEach((l, n) => {
      // fling: mix leaves the loop faster the harder it spins
      if (pull > 0.6 && l.mix > 0) {
        const off = Math.min(l.mix, l.mix * 0.35 * (pull - 0.6) * dt)
        l.mix -= off
        this.stats.flung += off
        if (Math.random() < off * 600) this.spawnDrops(1, i, omega, n)
      }
      if (l.mix > cap * 0.12) anyDry = false
      if (!l.film) {
        // a film re-forms from the meniscus if there is enough mix left
        if (l.mix > filmCost * 2) (l.film = true), (l.mix -= filmCost)
        return
      }
      if (air < 0.9) { l.grow = Math.max(0, l.grow - dt * 2); return }
      // blowing out: faster air makes smaller bubbles, sooner
      if (l.grow === 0) l.size = 2 * i.loopR * (1.05 + 0.9 * Math.random()) * Math.min(1.3, Math.max(0.6, 1.6 / air))
      const tForm = 0.12 + (0.35 * ((2 * i.loopR) / 24)) / Math.max(0.05, air - 0.9)
      l.grow += dt / tForm
      if (l.grow >= 1) {
        // release: costs the bubble wall, and the film has to re-form
        const wall = (Math.PI * l.size * l.size * 0.0015) / MM3_PER_ML
        if (l.mix >= wall) {
          l.mix -= wall
          this.stats.bubbles++
          this.stats.lastDip++
          this.release(i, n, sp, omega, l.size)
        }
        l.grow = 0
        l.film = false
      }
    })
    if (this.autoDip && anyDry && this.dish > 1) this.dip()

    this.step(dt)
    this.draw(i, cap)
  }

  loopFrame(i, n, sp) {
    const a = ((i.phase + (360 * n) / i.loops) * Math.PI) / 180
    const c = new THREE.Vector3(i.loopC * Math.cos(a), i.loopC * Math.sin(a), i.zc)
    const t = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0) // direction of travel (anticlockwise)
    return { a, c, t }
  }

  release(i, n, sp, omega, size) {
    const { c, t } = this.loopFrame(i, n, sp)
    const r = size / 2
    // leaves from the trailing side of the loop
    const local = c.clone().addScaledVector(t, i.dir === 'flat' ? 0 : -r * 0.8)
    if (i.dir === 'flat') local.z += r
    const world = this.spinner.localToWorld(local.clone())
    const vLoop = t.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), sp).multiplyScalar(omega * i.loopC)
    if (this.bubbles.length > 380) this.bubbles.shift()
    this.bubbles.push({
      p: world, v: vLoop.multiplyScalar(0.25).add(new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60)),
      r, age: 0, life: 2 + Math.random() * 6,
    })
  }

  spawnDrops(k, i, omega, only = -1) {
    const sp = this.spinner.rotation.z
    for (let j = 0; j < k && this.drops.length < 290; j++) {
      const n = only >= 0 ? only : Math.floor(Math.random() * Math.max(1, i.loops))
      const { c, t } = this.loopFrame(i, n, sp)
      const world = this.spinner.localToWorld(c.clone().multiplyScalar(1.02))
      const v = t.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), sp).multiplyScalar(omega * i.loopC)
      this.drops.push({ p: world, v, age: 0, r: 0.8 + Math.random() * 1.2 })
    }
  }

  step(dt) {
    // bubbles: drag stops them fast, they sink slowly and wander
    for (const b of this.bubbles) {
      b.age += dt
      b.v.multiplyScalar(Math.exp(-dt / 0.25))
      b.v.y -= 40 * dt // settles towards a ~40 mm/s sink
      b.v.x += (Math.random() - 0.5) * 40 * dt
      b.p.addScaledVector(b.v, dt)
    }
    this.bubbles = this.bubbles.filter((b) => b.age < b.life)
    // droplets: real ballistics, gone after a second
    for (const d of this.drops) {
      d.age += dt
      d.v.y -= G * dt
      d.p.addScaledVector(d.v, dt)
    }
    this.drops = this.drops.filter((d) => d.age < 1)
  }

  draw(i, cap) {
    const o = this.tmp
    let k = 0
    for (const b of this.bubbles) {
      const wob = 1 + 0.03 * Math.sin(b.age * 9 + b.r)
      const end = b.life - b.age < 0.08 ? 1.15 : 1 // a little swell as it pops
      o.position.copy(b.p)
      o.scale.set(b.r * wob * end, b.r * end, b.r / wob)
      o.rotation.set(0, 0, 0)
      o.updateMatrix()
      this.bubbleMesh.setMatrixAt(k++, o.matrix)
    }
    this.bubbleMesh.count = k
    this.bubbleMesh.instanceMatrix.needsUpdate = true

    let f = 0, g = 0
    this.loops.forEach((l, n) => {
      const { a, c, t } = this.loopFrame(i, n, 0)
      if (l.film) {
        // the film across the loop, facing the direction of travel
        o.position.copy(c)
        o.scale.setScalar(i.loopR)
        if (i.dir === 'flat') o.rotation.set(0, 0, 0)
        else o.rotation.set(-Math.PI / 2, 0, a, 'ZYX') // tilt the circle up, then turn it to face along the tangent
        o.updateMatrix()
        this.filmMesh.setMatrixAt(f++, o.matrix)
        o.rotation.set(0, 0, 0, 'XYZ')
      }
      if (l.grow > 0.02) {
        const r = (l.size / 2) * l.grow
        o.position.copy(c).addScaledVector(t, i.dir === 'flat' ? 0 : -r * 0.8)
        if (i.dir === 'flat') o.position.z += r
        o.scale.setScalar(Math.max(r, 0.1))
        o.rotation.set(0, 0, 0)
        o.updateMatrix()
        this.growMesh.setMatrixAt(g++, o.matrix)
      }
    })
    this.filmMesh.count = f
    this.growMesh.count = g
    this.filmMesh.instanceMatrix.needsUpdate = true
    this.growMesh.instanceMatrix.needsUpdate = true

    let d = 0
    for (const q of this.drops) {
      o.position.copy(q.p)
      o.scale.setScalar(q.r)
      o.updateMatrix()
      this.dropMesh.setMatrixAt(d++, o.matrix)
    }
    this.dropMesh.count = d
    this.dropMesh.instanceMatrix.needsUpdate = true
  }
}
