// The simulation has no platform dependencies. Distances are in track units;
// rendering and collision detection share the same continuous lane position.
const JUMP_TIME = 0.95
const SLIDE_TIME = 0.85
const MAX_STEP = 1 / 60

function createRun() {
  return {
    status: 'ready', lane: 1, lanePosition: 1, action: '', actionTime: 0,
    elapsed: 0, distance: 0, speed: 17, stars: 0, score: 0, lives: 3,
    immune: 0, feedback: '', feedbackTime: 0, spawnDistance: 0, nextID: 7,
    objects: [
      { id: 1, kind: 'star', lane: 1, z: 10 },
      { id: 2, kind: 'star', lane: 1, z: 17 },
      { id: 3, kind: 'barrier', lane: 1, z: 38 },
      { id: 4, kind: 'train', lane: 0, z: 73 },
      { id: 5, kind: 'star', lane: 2, z: 82 },
      { id: 6, kind: 'sign', lane: 1, z: 108 }
    ]
  }
}

function jumpHeight(run) {
  return run.action === 'jump' ? Math.sin(Math.PI * (1 - run.actionTime / JUMP_TIME)) : 0
}

function controlRun(run, command) {
  if (command === 'start' && run.status === 'ready') { run.status = 'running'; return }
  if (command === 'pause' && run.status === 'running') { run.status = 'paused'; return }
  if (command === 'resume' && run.status === 'paused') { run.status = 'running'; return }
  if (run.status !== 'running') return
  if (command === 'left') run.lane = Math.max(0, run.lane - 1)
  if (command === 'right') run.lane = Math.min(2, run.lane + 1)
  if (!run.action && (command === 'jump' || command === 'slide')) {
    run.action = command
    run.actionTime = command === 'jump' ? JUMP_TIME : SLIDE_TIME
  }
}

function addRow(run, random) {
  const safeLane = Math.min(2, Math.floor(random() * 3))
  const blocked = [0, 1, 2].filter(lane => lane !== safeLane)
  if (random() < 0.5) blocked.reverse()
  const count = run.distance > 160 && random() > 0.4 ? 2 : 1
  for (let i = 0; i < count; i++) {
    const kind = ['barrier', 'sign', 'train'][Math.min(2, Math.floor(random() * 3))]
    run.objects.push({ id: run.nextID++, kind, lane: blocked[i], z: 112 })
  }
  // The star trail marks an unobstructed route through every generated row.
  for (let i = 0; i < 3; i++) run.objects.push({ id: run.nextID++, kind: 'star', lane: safeLane, z: 106 + i * 6 })
}

function tick(run, seconds, random) {
  run.elapsed += seconds
  run.speed = Math.min(31, 17 + run.distance / 220)
  const travel = run.speed * seconds
  run.distance += travel
  run.spawnDistance += travel
  run.immune = Math.max(0, run.immune - seconds)
  run.feedbackTime = Math.max(0, run.feedbackTime - seconds)
  run.lanePosition += (run.lane - run.lanePosition) * Math.min(1, seconds * 18)
  if (run.action) {
    run.actionTime = Math.max(0, run.actionTime - seconds)
    if (!run.actionTime) run.action = ''
  }
  for (const item of run.objects) {
    const previous = item.z
    item.z -= travel
    if (item.passed || previous < 0 || item.z > 0) continue
    item.passed = true
    if (Math.abs(run.lanePosition - item.lane) > 0.44) continue
    if (item.kind === 'star') {
      run.stars++
      continue
    }
    const cleared = item.kind === 'barrier' && jumpHeight(run) > 0.48 || item.kind === 'sign' && run.action === 'slide'
    if (cleared || run.immune > 0) continue
    run.lives--
    run.immune = 1.65
    run.feedbackTime = 1.65
    run.feedback = item.kind === 'train' ? '遇到列车，向旁边换道' : item.kind === 'barrier' ? '遇到路障，向上跳跃' : '遇到横杆，向下滑行'
    if (!run.lives) { run.status = 'over'; break }
  }
  run.objects = run.objects.filter(item => item.z > -10)
  if (run.spawnDistance >= 34) {
    run.spawnDistance -= 34
    addRow(run, random)
  }
  run.score = Math.floor(run.distance) + run.stars * 25
}

function stepRun(run, seconds, random = Math.random) {
  if (run.status !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return run
  // A stalled frame never teleports the player through several rows. A page
  // returning from the background must explicitly resume its stopped clock.
  let remaining = Math.min(seconds, 0.12)
  while (remaining > 0.000001 && run.status === 'running') {
    const delta = Math.min(remaining, MAX_STEP)
    tick(run, delta, random)
    remaining -= delta
  }
  return run
}

function runView(run) {
  return {
    phase: run.status, score: run.score, distance: Math.floor(run.distance), stars: run.stars,
    hearts: '♥'.repeat(run.lives) + '♡'.repeat(3 - run.lives),
    pace: run.speed < 21 ? '轻快出发' : run.speed < 26 ? '渐入佳境' : '全速向前',
    hint: run.feedbackTime > 0 ? run.feedback : '左右换道 · 上跳下滑 · 列车要绕开'
  }
}

module.exports = { createRun, controlRun, stepRun, jumpHeight, runView }
