// Track units and lane positions are shared by simulation and drawing.
const JUMP_TIME = 0.95, SPRING_TIME = 2.1, SLIDE_TIME = 0.85
const CHASE_TIME = 8, CAPTURE_TIME = 2.2, MAX_STEP = 1 / 60
function createRun() {
  return {
    status: 'ready', lane: 1, lanePosition: 1, action: '', actionTime: 0,
    elapsed: 0, distance: 0, speed: 18, stars: 0, coins: 0, score: 0,
    chase: 0, stun: 0, immune: 0, boardTime: 0, boards: 1, magnet: 0,
    captureTime: 0, caughtBy: '', skin: 'mint', pickupFlash: 0,
    feedback: '', feedbackTime: 0, spawnDistance: 0, nextID: 20,
    objects: [
      ...[10, 15, 20, 25, 30].map((z, i) => ({ id: i + 1, kind: 'coin', lane: 1, z })),
      { id: 6, kind: 'barrier', lane: 1, z: 48 },
      { id: 7, kind: 'spring', lane: 2, z: 68 },
      { id: 8, kind: 'star', lane: 2, z: 85, height: 1.3 },
      { id: 9, kind: 'train', lane: 0, z: 95 },
      { id: 10, kind: 'board', lane: 1, z: 105 }
    ]
  }
}
function jumpHeight(run) {
  if (run.action === 'spring') return 2 * Math.sin(Math.PI * (1 - run.actionTime / SPRING_TIME))
  return run.action === 'jump' ? Math.sin(Math.PI * (1 - run.actionTime / JUMP_TIME)) : 0
}
function controlRun(run, command) {
  if (command === 'start' && run.status === 'ready') { run.status = 'running'; return }
  if (command === 'pause' && ['running', 'caught'].includes(run.status)) { run.pausedFrom = run.status; run.status = 'paused'; return }
  if (command === 'resume' && run.status === 'paused') { run.status = run.pausedFrom || 'running'; return }
  if (run.status !== 'running') return
  if (command === 'left') run.lane = Math.max(0, run.lane - 1)
  if (command === 'right') run.lane = Math.min(2, run.lane + 1)
  if (command === 'board' && !run.boardTime && run.boards > 0) { run.boards--; run.boardTime = 12; feedback(run, '滑板启动！可以抵挡一次碰撞') }
  if (!run.action && (command === 'jump' || command === 'slide')) {
    run.action = command; run.actionTime = command === 'jump' ? JUMP_TIME : SLIDE_TIME
  }
}
function feedback(run, text) { run.feedback = text; run.feedbackTime = 2 }
function capture(run, kind) {
  run.status = 'caught'; run.caughtBy = kind; run.captureTime = 0; run.action = ''; run.actionTime = 0
  feedback(run, kind === 'train' || kind === 'truck' ? '撞到车辆了，巡逻员追上来了！' : '又绊了一下，被巡逻员追上了！')
}
function addRow(run, random) {
  const safe = Math.min(2, Math.floor(random() * 3)), blocked = [0, 1, 2].filter(lane => lane !== safe)
  if (random() < 0.5) blocked.reverse()
  const count = run.distance > 180 && random() > 0.4 ? 2 : 1
  for (let i = 0; i < count; i++) {
    const kind = ['barrier', 'sign', 'train', 'truck'][Math.min(3, Math.floor(random() * 4))]
    run.objects.push({ id: run.nextID++, kind, lane: blocked[i], z: 120 })
  }
  for (let i = 0; i < 5; i++) run.objects.push({ id: run.nextID++, kind: 'coin', lane: safe, z: 110 + i * 4 })
  const bonus = random()
  if (bonus < 0.16) {
    run.objects.push({ id: run.nextID++, kind: 'spring', lane: safe, z: 108 })
    run.objects.push({ id: run.nextID++, kind: 'star', lane: safe, z: 129, height: 1.3 })
  } else if (bonus < 0.29) run.objects.push({ id: run.nextID++, kind: 'board', lane: safe, z: 132 })
  else if (bonus < 0.39) run.objects.push({ id: run.nextID++, kind: 'magnet', lane: safe, z: 132 })
  else if (bonus < 0.58) run.objects.push({ id: run.nextID++, kind: 'star', lane: safe, z: 132 })
}
function collect(run, item) {
  item.passed = true; item.collected = true; run.pickupFlash = 0.2
  if (item.kind === 'coin') run.coins++
  if (item.kind === 'star') { run.stars++; feedback(run, '星星 +1 · 额外获得 5 星光币') }
  if (item.kind === 'board') { run.boards = Math.min(3, run.boards + 1); feedback(run, '拾到滑板！点右下角装备') }
  if (item.kind === 'magnet') { run.magnet = 8; feedback(run, '磁铁启动！自动吸收附近金币') }
}
function tick(run, dt, random) {
  run.elapsed += dt
  run.speed = Math.min(32, 18 + run.distance / 200)
  const travel = run.speed * dt * (run.stun > 0 ? 0.65 : 1)
  run.distance += travel; run.spawnDistance += travel
  for (const key of ['immune', 'chase', 'stun', 'boardTime', 'magnet', 'feedbackTime', 'pickupFlash']) run[key] = Math.max(0, run[key] - dt)
  run.lanePosition += (run.lane - run.lanePosition) * Math.min(1, dt * 18)
  if (run.action) { run.actionTime = Math.max(0, run.actionTime - dt); if (!run.actionTime) run.action = '' }
  for (const item of run.objects) {
    const previous = item.z; item.z -= travel
    if (item.passed) continue
    if (item.kind === 'coin' && run.magnet > 0 && item.z < 19 && item.z > -1) { collect(run, item); continue }
    if (previous < 0 || item.z > 0) continue
    item.passed = true
    if (Math.abs(run.lanePosition - item.lane) > 0.44) continue
    const height = jumpHeight(run)
    if (['coin', 'star', 'board', 'magnet'].includes(item.kind)) {
      if ((item.height || 0) > 0.7 ? height > 0.6 : height < 1.15) collect(run, item)
      continue
    }
    if (item.kind === 'spring') {
      if (height < 0.3) { run.action = 'spring'; run.actionTime = SPRING_TIME; feedback(run, '弹跳板！跃过列车，追上空中的星星') }
      continue
    }
    const cleared = height > 1.2 || item.kind === 'barrier' && height > 0.48 || item.kind === 'sign' && run.action === 'slide'
    if (cleared || run.immune > 0) continue
    if (run.boardTime > 0) {
      run.boardTime = 0; run.immune = 1.3; run.chase = 0; run.stun = 0
      feedback(run, '滑板挡住了碰撞！继续跑！'); continue
    }
    if (item.kind === 'train' || item.kind === 'truck' || run.chase > 0) { capture(run, item.kind); break }
    run.chase = CHASE_TIME; run.stun = 0.75; run.immune = 0.9
    feedback(run, '小心！巡逻员追近了，坚持 8 秒甩开他')
  }
  run.objects = run.objects.filter(item => item.z > -10 && !item.collected)
  if (run.spawnDistance >= 36) { run.spawnDistance -= 36; addRow(run, random) }
  run.score = Math.floor(run.distance) + run.coins * 5 + run.stars * 50
}
function stepRun(run, seconds, random = Math.random) {
  if (!['running', 'caught'].includes(run.status) || !Number.isFinite(seconds) || seconds <= 0) return run
  let remaining = Math.min(seconds, 0.12)
  while (remaining > 0.000001 && ['running', 'caught'].includes(run.status)) {
    const dt = Math.min(remaining, MAX_STEP)
    if (run.status === 'caught') { run.captureTime += dt; if (run.captureTime >= CAPTURE_TIME) run.status = 'over' }
    else tick(run, dt, random)
    remaining -= dt
  }
  return run
}
function runView(run) {
  return {
    phase: run.status, score: run.score, distance: Math.floor(run.distance), stars: run.stars, coins: run.coins,
    runTokens: run.coins + run.stars * 5, boards: run.boards, boardSeconds: Math.ceil(run.boardTime), magnetSeconds: Math.ceil(run.magnet),
    chaseSeconds: Math.ceil(run.chase), chaseLabel: run.status === 'caught' ? '被追上了' : run.chase > 0 ? '追逐者逼近' : '安全距离',
    pace: run.speed < 23 ? '城市站台' : run.speed < 28 ? '霓虹街区' : '极速环线',
    hint: run.feedbackTime > 0 ? run.feedback : '左右换道 · 上跳下滑 · 点滑板挡一次碰撞'
  }
}
module.exports = { createRun, controlRun, stepRun, jumpHeight, runView, CAPTURE_TIME, CHASE_TIME }
