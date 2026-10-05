import { mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GifUtil } from 'gifwrap'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const charactersDirectory = join(scriptDirectory, '..', 'assets', 'games', 'team', 'monster_escape_office', 'characters')
const MATTE_DISTANCE = 28

function colorDistanceSquared(data, offset, color) {
  const red = data[offset] - color.red
  const green = data[offset + 1] - color.green
  const blue = data[offset + 2] - color.blue
  return red * red + green * green + blue * blue
}

function dominantBorderColor(frame) {
  const { width, height, data } = frame.bitmap
  const colors = new Map()
  const add = (x, y) => {
    const offset = (y * width + x) * 4
    if (!data[offset + 3]) return
    const key = `${data[offset]}:${data[offset + 1]}:${data[offset + 2]}`
    colors.set(key, (colors.get(key) || 0) + 1)
  }
  for (let x = 0; x < width; x += 1) {
    add(x, 0)
    add(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(0, y)
    add(width - 1, y)
  }
  const dominant = [...colors.entries()].sort((left, right) => right[1] - left[1])[0]
  if (!dominant) return null
  const [red, green, blue] = dominant[0].split(':').map(Number)
  return { red, green, blue }
}

function clearConnectedMatte(frame) {
  const background = dominantBorderColor(frame)
  if (!background) return
  const { width, height, data } = frame.bitmap
  const visited = new Uint8Array(width * height)
  const pending = []
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const pixel = y * width + x
    if (visited[pixel]) return
    visited[pixel] = 1
    const offset = pixel * 4
    if (!data[offset + 3] || colorDistanceSquared(data, offset, background) > MATTE_DISTANCE * MATTE_DISTANCE) return
    pending.push(pixel)
  }
  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }
  while (pending.length) {
    const pixel = pending.pop()
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const offset = pixel * 4
    data[offset] = 0
    data[offset + 1] = 0
    data[offset + 2] = 0
    data[offset + 3] = 0
    enqueue(x - 1, y)
    enqueue(x + 1, y)
    enqueue(x, y - 1)
    enqueue(x, y + 1)
  }
}

function opaqueBounds(frame) {
  const { width, height, data } = frame.bitmap
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!data[(y * width + x) * 4 + 3]) continue
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return bottom >= 0 ? { top, bottom } : null
}

function alignFeet(frames) {
  const bounds = frames.map(opaqueBounds)
  frames.forEach((frame, index) => {
    const box = bounds[index]
    if (!box) return
    // Every animation uses the same canvas as its floor reference.  Placing the
    // lowest opaque pixel on that canvas edge gives each frame a shared foot
    // baseline even when the artwork's bounds differ from frame to frame.
    const shiftY = frame.bitmap.height - 1 - box.bottom
    if (!shiftY) return
    const { width, height, data } = frame.bitmap
    const aligned = Buffer.alloc(data.length)
    for (let y = 0; y < height - shiftY; y += 1) {
      data.copy(aligned, (y + shiftY) * width * 4, y * width * 4, (y + 1) * width * 4)
    }
    frame.bitmap.data = aligned
  })
}

async function processGif(sourcePath, outputPath) {
  const gif = await GifUtil.read(sourcePath)
  gif.frames.forEach(clearConnectedMatte)
  alignFeet(gif.frames)
  await GifUtil.write(outputPath, gif.frames, gif)
}

const roles = ['humans', 'monsters']
for (const role of roles) {
  const roleDirectory = join(charactersDirectory, role)
  const models = await readdir(roleDirectory, { withFileTypes: true })
  for (const model of models.filter((entry) => entry.isDirectory())) {
    const modelDirectory = join(roleDirectory, model.name)
    const outputDirectory = join(modelDirectory, 'transparent')
    await mkdir(outputDirectory, { recursive: true })
    for (const motion of ['walk.gif', 'run.gif']) {
      await processGif(join(modelDirectory, motion), join(outputDirectory, motion))
    }
  }
}
