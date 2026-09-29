import { WebSocket, WebSocketServer } from 'ws'
import { readFileSync } from 'node:fs'

const PORT = Number(process.env.PORT || 8787)
const RECONNECT_GRACE_MS = 10_000
const SLOT_GROUPS = ['one', 'two']
const ROOM_MODES = new Set(['Team', 'Free For All'])
const MAX_GAMES = new Set([3, 5, 8, 10])
const REACTION_TIME_PREP_MS = 3_000
const REACTION_TIME_RESULT_MS = 3_000
const REACTION_TIME_TARGET_MIN_MS = 2_000
const REACTION_TIME_TARGET_MAX_MS = 5_000
const REACTION_TIME_ROUNDS = 3
const GUESS_TIME_ROUNDS = 3
const GUESS_TIME_PREPARATION_MS = 5_000
const GUESS_TIME_GUESS_MS = 10_000
const GUESS_TIME_REVEAL_DELAY_MS = 3_000
const GUESS_TIME_RESULT_MS = 3_000
const GUESS_TIME_MIN_CENTISECONDS = 100
const GUESS_TIME_MAX_CENTISECONDS = 1_099
const INSTRUCTION_DURATION_MS = 30_000
const GAME_CATALOG = JSON.parse(readFileSync(new URL('../data/games/free_for_all.json', import.meta.url), 'utf8'))
const GAME_IDS = new Set(GAME_CATALOG.map((game) => game.id))
const DEFAULT_PLAYER_NAMES = [
  'SkillIssue',
  'OopsIDied',
  'AltF4Pro',
  'MissClick',
  'RageQuit',
  'BotDaddy',
  'ProNoob',
  'IWasLag',
  'CarryMe',
  'LagLord',
]
const rooms = new Map()
const sockets = new Map()

function createCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  } while (rooms.has(code))
  return code
}

function normalizeName(value, fallback = 'Player') {
  const name = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 10)
  return name || fallback
}

function send(socket, payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

function emptySlots() {
  return Array.from({ length: 5 }, () => null)
}

function roomForClient(clientId) {
  return [...rooms.values()].find((room) => findPlayer(room, clientId))
}

function findPlayer(room, clientId) {
  for (const group of SLOT_GROUPS) {
    const index = room.slots[group].findIndex((player) => player?.id === clientId)
    if (index >= 0) return { player: room.slots[group][index], group, index }
  }
  return null
}

function findOpenSlot(room) {
  for (const group of SLOT_GROUPS) {
    const index = room.slots[group].findIndex((player) => !player)
    if (index >= 0) return { group, index }
  }
  return null
}

function roomPlayers(room) {
  return SLOT_GROUPS.flatMap((group) => room.slots[group].filter(Boolean))
}

function nextDefaultName(room) {
  const usedNames = new Set(roomPlayers(room).map((player) => player.name))
  const availableNames = DEFAULT_PLAYER_NAMES.filter((name) => !usedNames.has(name))
  return availableNames[Math.floor(Math.random() * availableNames.length)]
}

function roomView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    maxGames: room.maxGames,
    manualGames: room.manualGames,
    selectedGames: room.selectedGames,
    phase: room.phase,
    instructions: room.instructions && {
      game: room.instructions.game,
      endsAt: room.instructions.endsAt,
      acknowledgedPlayerIds: [...room.instructions.acknowledgedPlayerIds],
    },
    game: room.game ? gameView(room) : null,
    slots: Object.fromEntries(SLOT_GROUPS.map((group) => [
      group,
      room.slots[group].map((player) => player && {
        id: player.id,
        name: player.name,
        ready: player.ready,
        connected: player.connected,
        bot: player.bot,
      }),
    ])),
  }
}

function gameView(room) {
  if (room.game.id === 'guess_the_time') return guessTimeGameView(room)
  return reactionGameView(room)
}

function reactionGameView(room) {
  const game = room.game
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  return {
    id: game.id,
    round: game.round,
    maxRounds: REACTION_TIME_ROUNDS,
    phase: game.phase,
    activePlayerId: game.activePlayerId,
    activePlayerName: playerById.get(game.activePlayerId)?.name || '',
    phaseEndsAt: game.phaseEndsAt,
    targetAppearedAt: game.targetAppearedAt,
    target: game.target,
    lastResult: game.lastResult && {
      ...game.lastResult,
      playerName: playerById.get(game.lastResult.playerId)?.name || '',
    },
    eliminatedIds: game.eliminatedIds,
    eliminatedPlayerId: game.eliminatedPlayerId,
    eliminatedPlayerName: playerById.get(game.eliminatedPlayerId)?.name || '',
    leaderboard: game.leaderboard.map((entry, index) => ({
      playerId: entry.playerId,
      playerName: playerById.get(entry.playerId)?.name || '',
      reactionTime: entry.reactionTime,
      eliminated: game.eliminatedIds.includes(entry.playerId),
      rank: index + 1,
    })),
    survivorIds: game.playerIds.filter((id) => !game.eliminatedIds.includes(id)),
    winnerId: game.winnerId,
    winnerName: playerById.get(game.winnerId)?.name || '',
  }
}

function guessTimeGameView(room) {
  const game = room.game
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  const showAnswers = game.phase === 'round_result' || game.phase === 'complete'
  const playerIds = [...game.playerIds].sort((left, right) => {
    const leftEliminated = game.eliminatedIds.includes(left)
    const rightEliminated = game.eliminatedIds.includes(right)
    return Number(leftEliminated) - Number(rightEliminated)
  })
  return {
    id: game.id,
    round: game.round,
    maxRounds: GUESS_TIME_ROUNDS,
    phase: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    startedAt: game.startedAt,
    stopsAt: game.stopsAt,
    stopwatchTime: game.stopwatchTime,
    stoppedTime: showAnswers ? game.stopwatchTime : null,
    guessedPlayerIds: [...game.guesses.keys()],
    eliminatedIds: game.eliminatedIds,
    eliminatedPlayerId: game.eliminatedPlayerId,
    eliminatedPlayerName: playerById.get(game.eliminatedPlayerId)?.name || '',
    players: playerIds.map((playerId, index) => {
      const eliminated = game.eliminatedIds.includes(playerId)
      const guess = game.guesses.get(playerId)
      return {
        playerId,
        playerName: playerById.get(playerId)?.name || '',
        eliminated,
        rank: index + 1,
        guess: showAnswers ? guess ?? null : null,
        difference: showAnswers && Number.isFinite(guess)
          ? Number(Math.abs(guess - game.stopwatchTime).toFixed(2))
          : null,
      }
    }),
    winnerId: game.winnerId,
    winnerName: playerById.get(game.winnerId)?.name || '',
  }
}

function broadcastRoom(room, type = 'room_state') {
  room.revision += 1
  const payload = { type, revision: room.revision, room: roomView(room), serverNow: Date.now() }
  for (const player of roomPlayers(room)) send(sockets.get(player.id), payload)
}

function reject(socket, message) {
  send(socket, { type: 'action_rejected', message })
}

function clearGameTimer(room) {
  if (room.game?.timer) clearTimeout(room.game.timer)
  for (const timer of room.game?.botTimers || []) clearTimeout(timer)
  if (room.game) room.game.timer = null
  if (room.game) room.game.botTimers = []
}

function clearInstructionTimer(room) {
  if (room.instructionTimer) clearTimeout(room.instructionTimer)
  room.instructionTimer = null
}

function selectedGame(room) {
  const gameId = room.manualGames && room.selectedGames.includes('guess_the_time')
    ? 'guess_the_time'
    : 'reaction_time'
  return GAME_CATALOG.find((game) => game.id === gameId)
}

function requiredInstructionPlayers(room) {
  return roomPlayers(room).filter((player) => !player.bot && player.connected)
}

function startSelectedGame(room) {
  if (!rooms.has(room.code) || room.phase !== 'instructions' || !room.instructions) return
  const gameId = room.instructions.game.id
  clearInstructionTimer(room)
  room.instructions = null
  room.phase = 'playing'
  if (gameId === 'guess_the_time') return startGuessTimeGame(room)
  startReactionTimeGame(room)
}

function maybeStartSelectedGame(room) {
  if (room.phase !== 'instructions' || !room.instructions) return false
  const allAcknowledged = requiredInstructionPlayers(room)
    .every((player) => room.instructions.acknowledgedPlayerIds.has(player.id))
  if (!allAcknowledged) return false
  startSelectedGame(room)
  return true
}

function beginInstructions(room) {
  const game = selectedGame(room)
  if (!game) return false
  room.phase = 'instructions'
  room.game = null
  room.instructions = {
    game: {
      id: game.id,
      name: game.name,
      description: game.description,
      winCondition: game.win_condition,
      loseCondition: game.lose_condition,
    },
    endsAt: Date.now() + INSTRUCTION_DURATION_MS,
    acknowledgedPlayerIds: new Set(roomPlayers(room).filter((player) => player.bot).map((player) => player.id)),
  }
  room.instructionTimer = setTimeout(() => startSelectedGame(room), INSTRUCTION_DURATION_MS)
  broadcastRoom(room)
  return true
}

function scheduleGame(room, delay, callback) {
  clearGameTimer(room)
  room.game.timer = setTimeout(() => {
    if (!rooms.has(room.code) || !room.game) return
    room.game.timer = null
    callback()
  }, delay)
}

function activeReactionPlayers(room) {
  return room.game.playerIds.filter((id) => !room.game.eliminatedIds.includes(id) && findPlayer(room, id))
}

function sortReactionLeaderboard(game) {
  game.leaderboard.sort((left, right) => {
    const leftEliminated = game.eliminatedIds.includes(left.playerId)
    const rightEliminated = game.eliminatedIds.includes(right.playerId)
    if (leftEliminated !== rightEliminated) return Number(leftEliminated) - Number(rightEliminated)
    const leftTime = left.reactionTime ?? Number.POSITIVE_INFINITY
    const rightTime = right.reactionTime ?? Number.POSITIVE_INFINITY
    return leftTime - rightTime || left.originalOrder - right.originalOrder
  })
}

function reactionRoundThreeTarget() {
  let x
  let y
  do {
    x = 14 + Math.floor(Math.random() * 73)
    y = 57 + Math.floor(Math.random() * 19)
  } while (Math.hypot(x - 50, (y - 58) * 1.35) < 30)
  return { x, y }
}

function setReactionTurn(room) {
  const game = room.game
  const players = activeReactionPlayers(room)
  if (game.turnIndex >= players.length) return finishReactionRound(room)

  game.activePlayerId = players[game.turnIndex]
  game.phase = 'preparing'
  game.phaseEndsAt = Date.now() + REACTION_TIME_PREP_MS
  game.targetAppearedAt = null
  game.target = null
  game.lastResult = null
  broadcastRoom(room, 'game_state')

  scheduleGame(room, REACTION_TIME_PREP_MS, () => {
    game.phase = 'waiting'
    const delay = REACTION_TIME_TARGET_MIN_MS
      + Math.floor(Math.random() * (REACTION_TIME_TARGET_MAX_MS - REACTION_TIME_TARGET_MIN_MS + 1))
    game.phaseEndsAt = Date.now() + delay
    broadcastRoom(room, 'game_state')
    scheduleGame(room, delay, () => showReactionTarget(room))
  })
}

function showReactionTarget(room) {
  const game = room.game
  game.phase = 'target'
  game.phaseEndsAt = null
  game.targetAppearedAt = Date.now()
  game.target = game.round === 3
    ? reactionRoundThreeTarget()
    : { x: 50, y: 50 }
  broadcastRoom(room, 'game_state')

  const activePlayer = findPlayer(room, game.activePlayerId)?.player
  if (activePlayer?.bot) {
    const botReaction = 180 + Math.floor(Math.random() * 420)
    scheduleGame(room, botReaction, () => recordReaction(room, activePlayer.id))
  }
}

function recordReaction(room, clientId) {
  const game = room.game
  if (!game || game.phase !== 'target' || game.activePlayerId !== clientId) return false

  const reactionTime = Math.max(0, Date.now() - game.targetAppearedAt)
  game.results.push({ playerId: clientId, reactionTime })
  const rankingEntry = game.leaderboard.find((entry) => entry.playerId === clientId)
  rankingEntry.reactionTime = rankingEntry.reactionTime === null
    ? reactionTime
    : Math.min(rankingEntry.reactionTime, reactionTime)
  sortReactionLeaderboard(game)
  game.lastResult = { playerId: clientId, reactionTime, target: game.target }
  game.phase = 'result'
  game.phaseEndsAt = Date.now() + REACTION_TIME_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, REACTION_TIME_RESULT_MS, () => {
    game.turnIndex += 1
    setReactionTurn(room)
  })
  return true
}

function finishReactionRound(room) {
  const game = room.game
  const slowest = game.results.reduce((current, result) =>
    !current || result.reactionTime > current.reactionTime ? result : current,
  null)
  if (!slowest) return

  game.eliminatedIds.push(slowest.playerId)
  game.eliminatedPlayerId = slowest.playerId
  sortReactionLeaderboard(game)
  game.phase = 'round_result'
  game.phaseEndsAt = Date.now() + REACTION_TIME_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, REACTION_TIME_RESULT_MS, () => {
    const survivors = activeReactionPlayers(room)
    if (survivors.length === 1 || game.round >= REACTION_TIME_ROUNDS) {
      game.phase = 'complete'
      game.phaseEndsAt = null
      game.winnerId = survivors.length === 1 ? survivors[0] : null
      broadcastRoom(room, 'game_state')
      return
    }
    game.round += 1
    game.turnIndex = 0
    game.results = []
    game.eliminatedPlayerId = null
    setReactionTurn(room)
  })
}

function startReactionTimeGame(room) {
  const playerIds = roomPlayers(room).map((player) => player.id)
  room.game = {
    id: 'reaction_time',
    round: 1,
    turnIndex: 0,
    playerIds,
    eliminatedIds: [],
    eliminatedPlayerId: null,
    activePlayerId: playerIds[0],
    phase: 'preparing',
    phaseEndsAt: Date.now() + REACTION_TIME_PREP_MS,
    targetAppearedAt: null,
    target: null,
    lastResult: null,
    results: [],
    leaderboard: playerIds.map((playerId, originalOrder) => ({ playerId, originalOrder, reactionTime: null })),
    winnerId: null,
    timer: null,
  }
  broadcastRoom(room, 'game_started')
  scheduleGame(room, REACTION_TIME_PREP_MS, () => {
    room.game.phase = 'waiting'
    const delay = REACTION_TIME_TARGET_MIN_MS
      + Math.floor(Math.random() * (REACTION_TIME_TARGET_MAX_MS - REACTION_TIME_TARGET_MIN_MS + 1))
    room.game.phaseEndsAt = Date.now() + delay
    broadcastRoom(room, 'game_state')
    scheduleGame(room, delay, () => showReactionTarget(room))
  })
}

function activeGuessTimePlayers(room) {
  return room.game.playerIds.filter((id) => !room.game.eliminatedIds.includes(id) && findPlayer(room, id))
}

function completeGuessTimeGame(room, survivors) {
  const game = room.game
  clearGameTimer(room)
  game.phase = 'complete'
  game.phaseEndsAt = null
  game.winnerId = survivors.length === 1 ? survivors[0] : null
  broadcastRoom(room, 'game_state')
}

function beginGuessTimeRound(room) {
  const game = room.game
  const survivors = activeGuessTimePlayers(room)
  if (survivors.length <= 1) return completeGuessTimeGame(room, survivors)

  const centiseconds = GUESS_TIME_MIN_CENTISECONDS
    + Math.floor(Math.random() * (GUESS_TIME_MAX_CENTISECONDS - GUESS_TIME_MIN_CENTISECONDS + 1))
  game.phase = 'preparing'
  game.startedAt = null
  game.stopwatchTime = 0
  game.plannedStopwatchTime = Number((centiseconds / 100).toFixed(2))
  game.stopsAt = null
  game.phaseEndsAt = Date.now() + GUESS_TIME_PREPARATION_MS
  game.guesses = new Map()
  game.eliminatedPlayerId = null
  broadcastRoom(room, 'game_state')
  scheduleGame(room, GUESS_TIME_PREPARATION_MS, () => startGuessTimeStopwatch(room))
}

function startGuessTimeStopwatch(room) {
  const game = room.game
  game.phase = 'running'
  game.startedAt = Date.now()
  game.stopwatchTime = game.plannedStopwatchTime
  game.stopsAt = game.startedAt + Math.round(game.stopwatchTime * 1_000)
  game.phaseEndsAt = game.stopsAt
  broadcastRoom(room, 'game_state')
  scheduleGame(room, Math.round(game.stopwatchTime * 1_000), () => beginGuessing(room))
}

function beginGuessing(room) {
  const game = room.game
  game.phase = 'guessing'
  game.phaseEndsAt = Date.now() + GUESS_TIME_GUESS_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, GUESS_TIME_GUESS_MS, () => lockGuessing(room))

  game.botTimers = activeGuessTimePlayers(room)
    .map((playerId) => findPlayer(room, playerId)?.player)
    .filter((player) => player?.bot)
    .map((player) => setTimeout(() => {
      if (room.game?.phase !== 'guessing' || !findPlayer(room, player.id)) return
      const variance = (Math.random() - 0.5) * 1.6
      submitTimeGuess(room, player.id, Number(Math.max(0.01, Math.min(10.99, game.stopwatchTime + variance)).toFixed(2)))
    }, 300 + Math.floor(Math.random() * 1_200)))
}

function lockGuessing(room) {
  const game = room.game
  game.phase = 'reveal_wait'
  game.phaseEndsAt = Date.now() + GUESS_TIME_REVEAL_DELAY_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, GUESS_TIME_REVEAL_DELAY_MS, () => finishGuessTimeRound(room))
}

function submitTimeGuess(room, clientId, value) {
  const game = room.game
  if (!game || game.id !== 'guess_the_time' || game.phase !== 'guessing') return false
  if (!activeGuessTimePlayers(room).includes(clientId) || game.guesses.has(clientId)) return false
  const guess = Number(value)
  if (!Number.isFinite(guess) || guess <= 0 || guess > 10.99 || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return false
  game.guesses.set(clientId, Number(guess.toFixed(2)))
  broadcastRoom(room, 'game_state')
  return true
}

function finishGuessTimeRound(room) {
  const game = room.game
  const survivors = activeGuessTimePlayers(room)
  const farthest = survivors.reduce((current, playerId) => {
    const guess = game.guesses.get(playerId)
    const difference = Number.isFinite(guess) ? Math.abs(guess - game.stopwatchTime) : Number.POSITIVE_INFINITY
    return !current || difference > current.difference
      ? { playerId, difference }
      : current
  }, null)
  if (!farthest) return completeGuessTimeGame(room, survivors)

  game.eliminatedIds.push(farthest.playerId)
  game.eliminatedPlayerId = farthest.playerId
  game.phase = 'round_result'
  game.phaseEndsAt = Date.now() + GUESS_TIME_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, GUESS_TIME_RESULT_MS, () => {
    const remaining = activeGuessTimePlayers(room)
    if (remaining.length <= 1 || game.round >= GUESS_TIME_ROUNDS) {
      completeGuessTimeGame(room, remaining)
      return
    }
    game.round += 1
    beginGuessTimeRound(room)
  })
}

function startGuessTimeGame(room) {
  const playerIds = roomPlayers(room).map((player) => player.id)
  room.game = {
    id: 'guess_the_time',
    round: 1,
    phase: 'preparing',
    phaseEndsAt: null,
    startedAt: null,
    stopsAt: null,
    stopwatchTime: null,
    plannedStopwatchTime: null,
    guesses: new Map(),
    eliminatedIds: [],
    eliminatedPlayerId: null,
    winnerId: null,
    timer: null,
    botTimers: [],
    playerIds,
  }
  broadcastRoom(room, 'game_started')
  beginGuessTimeRound(room)
}

function clearDisconnect(room, clientId) {
  const timer = room.disconnectTimers.get(clientId)
  if (timer) clearTimeout(timer)
  room.disconnectTimers.delete(clientId)
}

function closeRoom(room, reason) {
  if (!rooms.has(room.code)) return
  clearGameTimer(room)
  clearInstructionTimer(room)
  for (const player of roomPlayers(room)) {
    clearDisconnect(room, player.id)
    send(sockets.get(player.id), { type: 'room_closed', reason })
  }
  rooms.delete(room.code)
}

function removePlayer(room, clientId) {
  const match = findPlayer(room, clientId)
  if (!match) return false
  clearDisconnect(room, clientId)
  room.slots[match.group][match.index] = null
  return true
}

function completeReactionGame(room, survivors) {
  const game = room.game
  clearGameTimer(room)
  game.phase = 'complete'
  game.phaseEndsAt = null
  game.activePlayerId = null
  game.targetAppearedAt = null
  game.target = null
  game.lastResult = null
  game.winnerId = survivors.length === 1 ? survivors[0] : null
  broadcastRoom(room, 'game_state')
}

function removeReactionPlayer(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'reaction_time') return removePlayer(room, clientId)
  if (!removePlayer(room, clientId)) return false

  clearGameTimer(room)
  game.playerIds = game.playerIds.filter((playerId) => playerId !== clientId)
  game.eliminatedIds = game.eliminatedIds.filter((playerId) => playerId !== clientId)
  game.leaderboard = game.leaderboard.filter((entry) => entry.playerId !== clientId)
  game.results = game.results.filter((result) => result.playerId !== clientId)
  if (game.lastResult?.playerId === clientId) game.lastResult = null
  if (game.eliminatedPlayerId === clientId) game.eliminatedPlayerId = null

  const survivors = activeReactionPlayers(room)
  if (game.phase === 'complete' || survivors.length <= 1) {
    completeReactionGame(room, survivors)
    return true
  }

  if (game.phase === 'round_result') {
    if (game.round >= REACTION_TIME_ROUNDS) {
      completeReactionGame(room, survivors)
      return true
    }
    game.round += 1
    game.turnIndex = 0
    game.results = []
    game.eliminatedPlayerId = null
    setReactionTurn(room)
    return true
  }

  game.turnIndex = game.results.length
  game.lastResult = null
  game.eliminatedPlayerId = null
  if (game.turnIndex >= survivors.length) finishReactionRound(room)
  else setReactionTurn(room)
  return true
}

function removeGuessTimePlayer(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'guess_the_time') return removePlayer(room, clientId)
  if (!removePlayer(room, clientId)) return false

  game.playerIds = game.playerIds.filter((playerId) => playerId !== clientId)
  game.eliminatedIds = game.eliminatedIds.filter((playerId) => playerId !== clientId)
  game.guesses.delete(clientId)
  if (game.eliminatedPlayerId === clientId) game.eliminatedPlayerId = null

  const survivors = activeGuessTimePlayers(room)
  if (game.phase === 'complete' || survivors.length <= 1) {
    completeGuessTimeGame(room, survivors)
    return true
  }
  broadcastRoom(room, 'game_state')
  return true
}

function removeGamePlayer(room, clientId) {
  if (room.game?.id === 'reaction_time') return removeReactionPlayer(room, clientId)
  if (room.game?.id === 'guess_the_time') return removeGuessTimePlayer(room, clientId)
  return removePlayer(room, clientId)
}

function reconnect(room, clientId, socket) {
  const match = findPlayer(room, clientId)
  if (!match) return reject(socket, 'You are not part of this room.')
  clearDisconnect(room, clientId)
  match.player.connected = true
  sockets.set(clientId, socket)
  broadcastRoom(room)
}

function markDisconnected(room, clientId) {
  const match = findPlayer(room, clientId)
  if (!match) return
  match.player.connected = false
  broadcastRoom(room)
  maybeStartSelectedGame(room)
  clearDisconnect(room, clientId)
  room.disconnectTimers.set(clientId, setTimeout(() => {
    if (!rooms.has(room.code)) return
    const current = findPlayer(room, clientId)
    if (!current || current.player.connected) return
    if (room.hostId === clientId) return closeRoom(room, 'The host disconnected.')
    if (room.phase === 'playing' && room.game) removeGamePlayer(room, clientId)
    else {
      removePlayer(room, clientId)
      broadcastRoom(room)
    }
  }, RECONNECT_GRACE_MS))
}

function createRoom(clientId) {
  const existing = roomForClient(clientId)
  if (existing) closeRoom(existing, 'The host created a new room.')
  const room = {
    code: createCode(),
    hostId: clientId,
    mode: 'Free For All',
    maxGames: 5,
    manualGames: false,
    selectedGames: [],
    phase: 'lobby',
    game: null,
    instructions: null,
    instructionTimer: null,
    revision: 0,
    nextBotId: 1,
    slots: { one: emptySlots(), two: emptySlots() },
    disconnectTimers: new Map(),
  }
  room.slots.one[0] = { id: clientId, name: nextDefaultName(room), ready: false, connected: true, bot: false }
  rooms.set(room.code, room)
  broadcastRoom(room)
}

function joinRoom(socket, clientId, code) {
  const room = rooms.get(String(code || '').toUpperCase())
  if (!room) return reject(socket, 'Room not found.')
  if (room.phase !== 'lobby') return reject(socket, 'The game has already started.')
  if (findPlayer(room, clientId)) return reconnect(room, clientId, socket)
  const openSlot = findOpenSlot(room)
  if (!openSlot) return reject(socket, 'Room is full.')
  const existing = roomForClient(clientId)
  if (existing) removePlayer(existing, clientId)
  room.slots[openSlot.group][openSlot.index] = {
    id: clientId,
    name: nextDefaultName(room),
    ready: false,
    connected: true,
    bot: false,
  }
  broadcastRoom(room)
}

function addBot(room, group, index) {
  if (!SLOT_GROUPS.includes(group) || !Number.isInteger(index) || index < 0 || index >= room.slots[group].length) {
    return false
  }
  if (room.slots[group][index]) return false
  room.slots[group][index] = {
    id: `bot-${room.nextBotId++}`,
    name: nextDefaultName(room),
    ready: true,
    connected: true,
    bot: true,
  }
  return true
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' })

wss.on('connection', (socket) => {
  let clientId = null

  socket.on('message', (raw) => {
    let message
    try {
      message = JSON.parse(raw)
    } catch {
      return reject(socket, 'Invalid message.')
    }
    clientId = String(message.clientId || clientId || '')
    if (!clientId) return reject(socket, 'Missing client identity.')
    sockets.set(clientId, socket)

    if (message.type === 'create_room') return createRoom(clientId)
    if (message.type === 'join_room') return joinRoom(socket, clientId, message.code)
    if (message.type === 'reconnect') {
      const room = rooms.get(String(message.code || '').toUpperCase())
      return room ? reconnect(room, clientId, socket) : reject(socket, 'Room no longer exists.')
    }

    const room = roomForClient(clientId)
    if (!room) return reject(socket, 'You are not in a room.')
    const member = findPlayer(room, clientId)

    if (message.type === 'leave_room') {
      if (room.hostId === clientId) return closeRoom(room, 'The host left the room.')
      if (room.phase === 'playing' && room.game) removeGamePlayer(room, clientId)
      else removePlayer(room, clientId)
      send(socket, { type: 'room_closed', reason: 'You left the room.' })
      return room.phase === 'playing' && room.game ? undefined : broadcastRoom(room)
    }
    if (message.type === 'quit_game') {
      if (!room.game || room.phase !== 'playing') {
        return reject(socket, 'There is no active game to quit.')
      }
      if (room.hostId === clientId) return closeRoom(room, 'The host quit the game.')
      removeGamePlayer(room, clientId)
      return send(socket, { type: 'room_closed', reason: 'You quit the game.' })
    }
    if (message.type === 'update_name') {
      if (room.phase !== 'lobby') return reject(socket, 'Names can only be changed in the lobby.')
      const target = message.playerId && message.playerId !== clientId
        ? findPlayer(room, String(message.playerId))?.player
        : member.player
      if (!target) return reject(socket, 'Player not found.')
      if (target.bot && room.hostId !== clientId) return reject(socket, 'Only the host can rename bots.')
      if (!target.bot && target.id !== clientId) return reject(socket, 'You can only rename yourself.')
      target.name = normalizeName(message.name, target.name)
      return broadcastRoom(room)
    }
    if (message.type === 'toggle_ready') {
      if (room.phase !== 'lobby') return reject(socket, 'Ready state can only be changed in the lobby.')
      member.player.ready = !member.player.ready
      return broadcastRoom(room)
    }
    if (message.type === 'update_settings') {
      if (room.hostId !== clientId) return reject(socket, 'Only the host can change room settings.')
      if (room.phase !== 'lobby') return reject(socket, 'Settings can only be changed in the lobby.')
      if (!ROOM_MODES.has(message.mode) || !MAX_GAMES.has(Number(message.maxGames))) {
        return reject(socket, 'Unsupported room settings.')
      }
      room.mode = message.mode
      room.maxGames = Number(message.maxGames)
      room.selectedGames = room.selectedGames.slice(0, room.maxGames)
      return broadcastRoom(room)
    }
    if (message.type === 'set_manual_games') {
      if (room.hostId !== clientId) return reject(socket, 'Only the host can change game selection.')
      if (room.phase !== 'lobby') return reject(socket, 'Games can only be selected in the lobby.')
      room.manualGames = Boolean(message.manualGames)
      if (!room.manualGames) room.selectedGames = []
      return broadcastRoom(room)
    }
    if (message.type === 'update_selected_games') {
      if (room.hostId !== clientId) return reject(socket, 'Only the host can choose games.')
      if (room.phase !== 'lobby') return reject(socket, 'Games can only be selected in the lobby.')
      if (!room.manualGames) return reject(socket, 'Enable manual game selection first.')
      if (!Array.isArray(message.gameIds)) return reject(socket, 'Invalid game selection.')
      const gameIds = [...new Set(message.gameIds.map(String))].filter((gameId) => GAME_IDS.has(gameId))
      if (gameIds.length > room.maxGames) return reject(socket, `Choose no more than ${room.maxGames} games.`)
      room.selectedGames = gameIds
      return broadcastRoom(room)
    }
    if (message.type === 'add_bot') {
      if (room.hostId !== clientId) return reject(socket, 'Only the host can add bots.')
      if (room.phase !== 'lobby') return reject(socket, 'Bots can only be added in the lobby.')
      if (!addBot(room, message.group, Number(message.index))) return reject(socket, 'That player slot is unavailable.')
      return broadcastRoom(room)
    }
    if (message.type === 'kick_player') {
      if (room.hostId !== clientId) return reject(socket, 'Only the host can remove players.')
      if (room.phase !== 'lobby') return reject(socket, 'Players can only be removed in the lobby.')
      const target = findPlayer(room, String(message.playerId || ''))
      if (!target) return reject(socket, 'Player not found.')
      if (target.player.id === room.hostId) return reject(socket, 'The host cannot remove themselves.')
      removePlayer(room, target.player.id)
      if (!target.player.bot) send(sockets.get(target.player.id), { type: 'room_closed', reason: 'You were removed by the host.' })
      return broadcastRoom(room)
    }
    if (message.type === 'reaction_click') {
      if (room.game?.id !== 'reaction_time') return reject(socket, 'Reaction Time is not active.')
      if (room.game.activePlayerId !== clientId) return reject(socket, 'It is not your turn.')
      if (!recordReaction(room, clientId)) return reject(socket, 'Wait for the circle to appear.')
      return
    }
    if (message.type === 'guess_time_submit') {
      if (room.game?.id !== 'guess_the_time') return reject(socket, 'Guess The Time is not active.')
      if (!submitTimeGuess(room, clientId, message.guess)) {
        return reject(socket, 'Enter one positive time from 0.01 to 10.99 with up to two decimal places.')
      }
      return
    }
    if (message.type === 'close_instructions') {
      if (room.phase !== 'instructions' || !room.instructions) {
        return reject(socket, 'There are no instructions to close.')
      }
      if (member.player.bot || !member.player.connected) {
        return reject(socket, 'Only active human players can close instructions.')
      }
      if (room.instructions.acknowledgedPlayerIds.has(clientId)) {
        return reject(socket, 'You have already closed the instructions.')
      }
      room.instructions.acknowledgedPlayerIds.add(clientId)
      if (!maybeStartSelectedGame(room)) broadcastRoom(room)
      return
    }
    if (message.type === 'start_game') {
      if (room.hostId !== clientId) return reject(socket, 'Only the host can start the game.')
      const players = roomPlayers(room)
      const humanPlayers = players.filter((player) => !player.bot)
      if (!humanPlayers.every((player) => player.ready)) return reject(socket, 'All non-bot players must be ready to start.')
      if (room.mode === 'Team') {
        if (!room.slots.one.some(Boolean) || !room.slots.two.some(Boolean)) {
          return reject(socket, 'Each team needs at least one player to start.')
        }
      } else if (players.length < 2) {
        return reject(socket, 'At least two players are needed to start.')
      }
      if (!beginInstructions(room)) return reject(socket, 'Could not load instructions for the selected game.')
      return
    }
    reject(socket, 'Unsupported room action.')
  })

  socket.on('close', () => {
    if (!clientId) return
    if (sockets.get(clientId) === socket) sockets.delete(clientId)
    const room = roomForClient(clientId)
    if (room) markDisconnected(room, clientId)
  })
})

console.log(`Let's Play WebSocket server listening on ws://0.0.0.0:${PORT}`)
