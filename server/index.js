import { WebSocket, WebSocketServer } from 'ws'
import { readFileSync } from 'node:fs'

const PORT = Number(process.env.PORT || 8787)
const RECONNECT_GRACE_MS = 10_000
const SLOT_GROUPS = ['one', 'two']
const ROOM_MODES = new Set(['Team', 'Free For All', 'For Fun'])
const TOURNAMENT_FORMATS = new Set(['Elimination', 'Ranking'])
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
const IMPOSTOR_COLOR_BOTTLE_COUNT = 12
const IMPOSTOR_COLOR_RED_BOTTLE_COUNT = 2
const IMPOSTOR_COLOR_SHAKE_MS = 1_500
const IMPOSTOR_COLOR_REVEAL_MS = 800
const IMPOSTOR_COLOR_AWW_MS = 2_000
const IMPOSTOR_COLOR_TURN_DELAY_MS = 500
const IMPOSTOR_COLOR_PICK_MS = 5_000
const IMPOSTOR_COLOR_WARNING_MS = 2_000
const IMPOSTOR_COLOR_RETURN_MS = 500
const IMPOSTOR_COLOR_FAREWELL_MS = 3_000
const INTERMISSION_DURATION_MS = 15_000
const SUPPORTED_GAME_IDS = new Set(['reaction_time', 'guess_the_time', 'impostor_color'])
function loadGameCatalog(fileName) {
  const source = readFileSync(new URL(`../data/games/${fileName}`, import.meta.url), 'utf8').trim()
  return source ? JSON.parse(source) : []
}

const GAME_CATALOGS = {
  Team: loadGameCatalog('team.json'),
  'Free For All': loadGameCatalog('free_for_all.json'),
  'For Fun': loadGameCatalog('for_fun.json'),
}
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

function gameCatalogForMode(mode) {
  return GAME_CATALOGS[mode] || []
}

function playableGameIdsForMode(mode) {
  return new Set(gameCatalogForMode(mode)
    .map((game) => game.id)
    .filter((gameId) => SUPPORTED_GAME_IDS.has(gameId)))
}

function gameDefinition(room, gameId) {
  return gameCatalogForMode(room.mode).find((game) => game.id === gameId)
}

function gameNumberSetting(room, gameId, setting, fallback) {
  const value = Number(gameDefinition(room, gameId)?.[setting])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function maxRoundsForRoom(room, gameId, defaultMaxRounds) {
  if (room.format === 'Ranking') return 1
  return gameNumberSetting(room, gameId, 'rounds', defaultMaxRounds)
}

function maxEliminationsForRound(room, gameId) {
  return gameNumberSetting(room, gameId, 'max_eliminations_per_round', 1)
}

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
    format: room.format,
    maxGames: room.maxGames,
    lastStandardMaxGames: room.lastStandardMaxGames,
    manualGames: room.manualGames,
    selectedGames: room.selectedGames,
    phase: room.phase,
    instructions: room.instructions && {
      game: room.instructions.game,
      endsAt: room.instructions.endsAt,
      acknowledgedPlayerIds: [...room.instructions.acknowledgedPlayerIds],
    },
    intermission: room.intermission && {
      endsAt: room.intermission.endsAt,
      acknowledgedPlayerIds: [...room.intermission.acknowledgedPlayerIds],
    },
    tournament: tournamentView(room),
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
  if (room.game.id === 'impostor_color') return impostorColorGameView(room)
  return reactionGameView(room)
}

function tournamentView(room) {
  if (!room.tournament) return null
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  const standings = room.tournament.playerIds
    .map((playerId) => ({
      playerId,
      playerName: playerById.get(playerId)?.name || '',
      eliminated: room.tournament.eliminatedIds.includes(playerId),
      points: room.tournament.points.get(playerId) || 0,
    }))
    .sort((left, right) => room.tournament.format === 'Elimination'
      ? Number(left.eliminated) - Number(right.eliminated) || left.playerName.localeCompare(right.playerName)
      : right.points - left.points || left.playerName.localeCompare(right.playerName))
  return {
    format: room.tournament.format,
    eliminatedIds: room.tournament.eliminatedIds,
    standings,
    complete: room.tournament.complete,
    completedAt: room.tournament.completedAt,
    winnerId: room.tournament.winnerId,
    winnerName: playerById.get(room.tournament.winnerId)?.name || '',
  }
}

function impostorColorGameView(room) {
  const game = room.game
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  return {
    id: game.id,
    phase: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    currentPlayerId: game.currentPlayerId,
    currentPlayerName: playerById.get(game.currentPlayerId)?.name || '',
    selectedBottleIndex: game.selectedBottleIndex,
    bottles: game.bottles.map((bottle) => ({
      index: bottle.index,
      state: bottle.state,
      color: bottle.state === 'revealed' ? bottle.color : null,
      pickedById: bottle.pickedById,
    })),
    eliminatedIds: game.eliminatedIds,
    eliminatedPlayerId: game.eliminatedPlayerId,
    eliminatedPlayerName: playerById.get(game.eliminatedPlayerId)?.name || '',
    winnerId: game.winnerId,
    winnerName: playerById.get(game.winnerId)?.name || '',
    warningCount: game.warningCounts.get(game.currentPlayerId) || 0,
    farewellNames: game.eliminatedIds.map((playerId) => playerById.get(playerId)?.name).filter(Boolean),
    redBottlesPicked: game.bottles.filter((bottle) => bottle.state === 'revealed' && bottle.color === 'red').length,
    totalRedBottles: IMPOSTOR_COLOR_RED_BOTTLE_COUNT,
    players: game.playerIds.map((playerId) => ({
      playerId,
      playerName: playerById.get(playerId)?.name || '',
      eliminated: game.eliminatedIds.includes(playerId),
      warningCount: game.warningCounts.get(playerId) || 0,
      eliminatedByAfk: game.afkEliminatedIds.includes(playerId),
    })),
  }
}

function reactionGameView(room) {
  const game = room.game
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  return {
    id: game.id,
    round: game.round,
    maxRounds: game.maxRounds,
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
    maxRounds: game.maxRounds,
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

function createTournament(room) {
  const playerIds = roomPlayers(room).map((player) => player.id)
  room.tournament = {
    format: room.format,
    playerIds,
    eliminatedIds: [],
    points: new Map(playerIds.map((playerId) => [playerId, 0])),
    complete: false,
    completedAt: null,
    winnerId: null,
  }
}

function tournamentGamePlayers(room) {
  if (!room.tournament) return roomPlayers(room).map((player) => player.id)
  return room.tournament.playerIds.filter((playerId) => {
    if (room.tournament.format === 'Elimination' && room.tournament.eliminatedIds.includes(playerId)) return false
    return Boolean(findPlayer(room, playerId))
  })
}

function completeTournament(room) {
  const tournament = room.tournament
  if (!tournament || tournament.complete) return
  tournament.complete = true
  tournament.completedAt = Date.now()
  const remaining = tournamentGamePlayers(room)
  if (tournament.format === 'Elimination') {
    tournament.winnerId = remaining.length === 1 ? remaining[0] : null
  } else {
    tournament.winnerId = [...tournament.playerIds]
      .sort((left, right) => (tournament.points.get(right) || 0) - (tournament.points.get(left) || 0))[0] || null
  }
}

function applyRankingPoints(room, game) {
  const allocation = gameDefinition(room, game.id)?.points_allocation
  if (!allocation || !room.tournament || room.tournament.format !== 'Ranking' || game.pointsApplied) return
  const addPoints = (playerId, points) => room.tournament.points.set(playerId, (room.tournament.points.get(playerId) || 0) + points)
  if (game.id === 'reaction_time') {
    game.leaderboard.forEach((entry, index) => addPoints(entry.playerId, Number(allocation[String(index + 1)] || 0)))
  } else if (game.id === 'guess_the_time') {
    [...game.playerIds]
      .sort((left, right) => {
        const leftGuess = game.guesses.get(left)
        const rightGuess = game.guesses.get(right)
        const leftDifference = Number.isFinite(leftGuess) ? Math.abs(leftGuess - game.stopwatchTime) : Number.POSITIVE_INFINITY
        const rightDifference = Number.isFinite(rightGuess) ? Math.abs(rightGuess - game.stopwatchTime) : Number.POSITIVE_INFINITY
        return leftDifference - rightDifference
      })
      .forEach((playerId, index) => addPoints(playerId, Number(allocation[String(index + 1)] || 0)))
  } else if (game.id === 'impostor_color') {
    game.playerIds.forEach((playerId) => addPoints(
      playerId,
      Number(game.eliminatedIds.includes(playerId) ? allocation.losers : allocation.winners) || 0,
    ))
  }
  game.pointsApplied = true
}

function applyEliminations(room, game) {
  if (!room.tournament || room.tournament.format !== 'Elimination' || game.eliminationsApplied) return
  room.tournament.eliminatedIds.push(...game.eliminatedIds.filter((playerId) => !room.tournament.eliminatedIds.includes(playerId)))
  game.eliminationsApplied = true
}

function finalizeTournamentGame(room, game) {
  applyEliminations(room, game)
  applyRankingPoints(room, game)
}

function usesPlacementRanking(room, gameId) {
  const allocation = gameDefinition(room, gameId)?.points_allocation
  return room.format === 'Ranking' && allocation && Object.keys(allocation).every((key) => /^\d+$/.test(key))
}

function selectedGame(room) {
  const gameId = room.gameQueue?.[room.gameIndex]
    || (room.manualGames && room.selectedGames.includes('guess_the_time') ? 'guess_the_time' : 'reaction_time')
  return gameDefinition(room, gameId)
}

function randomGameQueue(mode, maxGames) {
  const playableGameIds = [...playableGameIdsForMode(mode)]
  if (!playableGameIds.length) return []
  const queue = []
  while (queue.length < maxGames) {
    const round = [...playableGameIds]
    for (let index = round.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[round[index], round[swapIndex]] = [round[swapIndex], round[index]]
    }
    queue.push(...round)
  }
  return queue.slice(0, maxGames)
}

function hasNextTournamentGame(room) {
  if (room.tournament?.format === 'Elimination' && tournamentGamePlayers(room).length <= 1) return false
  return room.gameIndex < room.gameQueue.length - 1
}

function advanceGameQueue(room) {
  if (!hasNextTournamentGame(room)) {
    completeTournament(room)
    room.intermission = null
    broadcastRoom(room, 'game_state')
    return false
  }
  clearGameTimer(room)
  room.intermission = null
  room.gameIndex += 1
  beginInstructions(room)
  return true
}

function requiredIntermissionPlayers(room) {
  const activeIds = new Set(tournamentGamePlayers(room))
  return roomPlayers(room).filter((player) => !player.bot && player.connected && activeIds.has(player.id))
}

function maybeAdvanceIntermission(room) {
  if (room.phase !== 'intermission' || !room.intermission) return false
  const allAcknowledged = requiredIntermissionPlayers(room)
    .every((player) => room.intermission.acknowledgedPlayerIds.has(player.id))
  if (!allAcknowledged) return false
  advanceGameQueue(room)
  return true
}

function beginIntermission(room) {
  if (!hasNextTournamentGame(room)) {
    completeTournament(room)
    broadcastRoom(room, 'game_state')
    return false
  }
  room.phase = 'intermission'
  room.intermission = {
    endsAt: Date.now() + INTERMISSION_DURATION_MS,
    acknowledgedPlayerIds: new Set(roomPlayers(room).filter((player) => player.bot).map((player) => player.id)),
  }
  broadcastRoom(room, 'game_state')
  scheduleGame(room, INTERMISSION_DURATION_MS, () => advanceGameQueue(room))
  return true
}

function scheduleNextGame(room) {
  return beginIntermission(room)
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
  if (gameId === 'impostor_color') return startImpostorColorGame(room)
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
  room.intermission = null
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
  const slowestPlayers = [...game.results]
    .sort((left, right) => right.reactionTime - left.reactionTime)
    .slice(0, maxEliminationsForRound(room, game.id))
  if (!slowestPlayers.length) return

  if (!usesPlacementRanking(room, game.id)) {
    game.eliminatedIds.push(...slowestPlayers.map((player) => player.playerId))
    game.eliminatedPlayerId = slowestPlayers[0].playerId
  }
  sortReactionLeaderboard(game)
  game.phase = 'round_result'
  game.phaseEndsAt = Date.now() + REACTION_TIME_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, REACTION_TIME_RESULT_MS, () => {
    const survivors = activeReactionPlayers(room)
    if (survivors.length === 1 || game.round >= game.maxRounds) {
      game.phase = 'complete'
      game.phaseEndsAt = null
      game.winnerId = survivors.length === 1 ? survivors[0] : null
      finalizeTournamentGame(room, game)
      broadcastRoom(room, 'game_state')
      scheduleNextGame(room)
      return
    }
    game.round += 1
    game.turnIndex = 0
    game.results = []
    game.leaderboard.forEach((entry) => { entry.reactionTime = null })
    sortReactionLeaderboard(game)
    game.eliminatedPlayerId = null
    setReactionTurn(room)
  })
}

function startReactionTimeGame(room) {
  const playerIds = tournamentGamePlayers(room)
  room.game = {
    id: 'reaction_time',
    round: 1,
    maxRounds: maxRoundsForRoom(room, 'reaction_time', REACTION_TIME_ROUNDS),
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
  finalizeTournamentGame(room, game)
  broadcastRoom(room, 'game_state')
  scheduleNextGame(room)
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
  const farthestPlayers = survivors.map((playerId) => {
    const guess = game.guesses.get(playerId)
    const difference = Number.isFinite(guess) ? Math.abs(guess - game.stopwatchTime) : Number.POSITIVE_INFINITY
    return { playerId, difference }
  }).sort((left, right) => right.difference - left.difference)
    .slice(0, maxEliminationsForRound(room, game.id))
  if (!farthestPlayers.length) return completeGuessTimeGame(room, survivors)

  if (!usesPlacementRanking(room, game.id)) {
    game.eliminatedIds.push(...farthestPlayers.map((player) => player.playerId))
    game.eliminatedPlayerId = farthestPlayers[0].playerId
  }
  game.phase = 'round_result'
  game.phaseEndsAt = Date.now() + GUESS_TIME_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, GUESS_TIME_RESULT_MS, () => {
    const remaining = activeGuessTimePlayers(room)
    if (remaining.length <= 1 || game.round >= game.maxRounds) {
      completeGuessTimeGame(room, remaining)
      return
    }
    game.round += 1
    beginGuessTimeRound(room)
  })
}

function startGuessTimeGame(room) {
  const playerIds = tournamentGamePlayers(room)
  room.game = {
    id: 'guess_the_time',
    round: 1,
    maxRounds: maxRoundsForRoom(room, 'guess_the_time', GUESS_TIME_ROUNDS),
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

function activeImpostorColorPlayers(room) {
  return room.game.playerIds.filter((playerId) =>
    !room.game.eliminatedIds.includes(playerId) && findPlayer(room, playerId),
  )
}

function nextImpostorColorPlayer(room, currentPlayerId) {
  const activePlayers = activeImpostorColorPlayers(room)
  if (!activePlayers.length) return null
  const currentIndex = room.game.playerIds.indexOf(currentPlayerId)
  for (let offset = 1; offset <= room.game.playerIds.length; offset += 1) {
    const candidate = room.game.playerIds[(currentIndex + offset) % room.game.playerIds.length]
    if (activePlayers.includes(candidate)) return candidate
  }
  return activePlayers[0]
}

function finishImpostorColorGame(room) {
  const game = room.game
  const activePlayers = activeImpostorColorPlayers(room)
  clearGameTimer(room)
  game.phase = 'complete'
  game.phaseEndsAt = null
  game.currentPlayerId = null
  game.winnerId = activePlayers.length === 1 ? activePlayers[0] : null
  finalizeTournamentGame(room, game)
  broadcastRoom(room, 'game_state')
  beginIntermission(room)
}

function beginImpostorColorFarewell(room) {
  const game = room.game
  if (!game || game.id !== 'impostor_color') return
  game.phase = 'returning'
  game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_RETURN_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, IMPOSTOR_COLOR_RETURN_MS, () => {
    game.selectedBottleIndex = null
    game.phase = 'farewell'
    game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_FAREWELL_MS
    broadcastRoom(room, 'game_state')
    scheduleGame(room, IMPOSTOR_COLOR_FAREWELL_MS, () => finishImpostorColorGame(room))
  })
}

function setImpostorColorTurn(room) {
  const game = room.game
  if (!game || game.id !== 'impostor_color') return
  const activePlayers = activeImpostorColorPlayers(room)
  if (activePlayers.length <= 1 || !game.bottles.some((bottle) => bottle.state === 'unpicked')) {
    return finishImpostorColorGame(room)
  }
  game.phase = 'picking'
  game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_PICK_MS
  game.selectedBottleIndex = null
  game.eliminatedPlayerId = null
  if (!game.currentPlayerId || !activePlayers.includes(game.currentPlayerId)) {
    game.currentPlayerId = activePlayers[0]
  }
  broadcastRoom(room, 'game_state')

  scheduleGame(room, IMPOSTOR_COLOR_PICK_MS, () => handleImpostorColorPickTimeout(room))

  const player = findPlayer(room, game.currentPlayerId)?.player
  if (player?.bot) {
    const botTimer = setTimeout(() => {
      const availableBottles = game.bottles.filter((bottle) => bottle.state === 'unpicked')
      const bottle = availableBottles[Math.floor(Math.random() * availableBottles.length)]
      if (bottle) pickImpostorColorBottle(room, player.id, bottle.index)
    }, IMPOSTOR_COLOR_TURN_DELAY_MS)
    game.botTimers.push(botTimer)
  }
}

function continueImpostorColorGame(room, previousPlayerId) {
  const game = room.game
  if (!game || game.id !== 'impostor_color') return
  if (activeImpostorColorPlayers(room).length <= 1) return finishImpostorColorGame(room)
  if (game.bottles.filter((bottle) => bottle.state === 'revealed' && bottle.color === 'red').length >= IMPOSTOR_COLOR_RED_BOTTLE_COUNT) {
    return beginImpostorColorFarewell(room)
  }
  game.currentPlayerId = nextImpostorColorPlayer(room, previousPlayerId)
  game.phase = 'turn_delay'
  game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_TURN_DELAY_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, IMPOSTOR_COLOR_TURN_DELAY_MS, () => setImpostorColorTurn(room))
}

function handleImpostorColorPickTimeout(room) {
  const game = room.game
  if (!game || game.id !== 'impostor_color' || game.phase !== 'picking') return
  const playerId = game.currentPlayerId
  const warnings = (game.warningCounts.get(playerId) || 0) + 1
  game.warningCounts.set(playerId, warnings)
  if (warnings === 1) {
    game.phase = 'warning'
    game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_WARNING_MS
    broadcastRoom(room, 'game_state')
    scheduleGame(room, IMPOSTOR_COLOR_WARNING_MS, () => continueImpostorColorGame(room, playerId))
    return
  }
  game.eliminatedIds.push(playerId)
  game.afkEliminatedIds.push(playerId)
  game.eliminatedPlayerId = playerId
  game.phase = 'afk_eliminated'
  game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_AWW_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, IMPOSTOR_COLOR_AWW_MS, () => {
    if (activeImpostorColorPlayers(room).length <= 1) return finishImpostorColorGame(room)
    continueImpostorColorGame(room, playerId)
  })
}

function revealImpostorColorBottle(room, bottleIndex, playerId) {
  const game = room.game
  const bottle = game?.bottles[bottleIndex]
  if (!game || !bottle || game.selectedBottleIndex !== bottleIndex) return
  bottle.state = 'revealed'
  game.phase = 'revealing'
  game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_REVEAL_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, IMPOSTOR_COLOR_REVEAL_MS, () => {
    if (bottle.color === 'red') {
      game.eliminatedIds.push(playerId)
      game.eliminatedPlayerId = playerId
      game.phase = 'aww'
      game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_AWW_MS
      broadcastRoom(room, 'game_state')
      scheduleGame(room, IMPOSTOR_COLOR_AWW_MS, () => continueImpostorColorGame(room, playerId))
      return
    }
    game.phase = 'safe'
    game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_AWW_MS
    broadcastRoom(room, 'game_state')
    scheduleGame(room, IMPOSTOR_COLOR_AWW_MS, () => continueImpostorColorGame(room, playerId))
  })
}

function pickImpostorColorBottle(room, clientId, bottleIndex) {
  const game = room.game
  if (!game || game.id !== 'impostor_color' || game.phase !== 'picking' || game.currentPlayerId !== clientId) return false
  const bottle = game.bottles[bottleIndex]
  if (!bottle || bottle.state !== 'unpicked') return false
  bottle.state = 'shaking'
  bottle.pickedById = clientId
  game.selectedBottleIndex = bottleIndex
  game.phase = 'shaking'
  game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_SHAKE_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, IMPOSTOR_COLOR_SHAKE_MS, () => revealImpostorColorBottle(room, bottleIndex, clientId))
  return true
}

function startImpostorColorGame(room) {
  const playerIds = tournamentGamePlayers(room)
  const redIndexes = new Set([...Array(IMPOSTOR_COLOR_BOTTLE_COUNT).keys()]
    .sort(() => Math.random() - 0.5)
    .slice(0, IMPOSTOR_COLOR_RED_BOTTLE_COUNT))
  room.game = {
    id: 'impostor_color',
    phase: 'picking',
    phaseEndsAt: null,
    playerIds,
    currentPlayerId: playerIds[0] || null,
    selectedBottleIndex: null,
    eliminatedIds: [],
    afkEliminatedIds: [],
    eliminatedPlayerId: null,
    winnerId: null,
    warningCounts: new Map(),
    bottles: Array.from({ length: IMPOSTOR_COLOR_BOTTLE_COUNT }, (_, index) => ({
      index,
      color: redIndexes.has(index) ? 'red' : 'green',
      state: 'unpicked',
      pickedById: null,
    })),
    timer: null,
    botTimers: [],
  }
  broadcastRoom(room, 'game_started')
  setImpostorColorTurn(room)
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
  room.intermission = null
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
  finalizeTournamentGame(room, game)
  broadcastRoom(room, 'game_state')
  scheduleNextGame(room)
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
    if (game.round >= game.maxRounds) {
      completeReactionGame(room, survivors)
      return true
    }
    game.round += 1
    game.turnIndex = 0
    game.results = []
    game.leaderboard.forEach((entry) => { entry.reactionTime = null })
    sortReactionLeaderboard(game)
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

function removeImpostorColorPlayer(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'impostor_color') return removePlayer(room, clientId)
  if (!removePlayer(room, clientId)) return false

  game.playerIds = game.playerIds.filter((playerId) => playerId !== clientId)
  game.eliminatedIds = game.eliminatedIds.filter((playerId) => playerId !== clientId)
  game.afkEliminatedIds = game.afkEliminatedIds.filter((playerId) => playerId !== clientId)
  if (game.eliminatedPlayerId === clientId) game.eliminatedPlayerId = null
  if (!activeImpostorColorPlayers(room).length) {
    finishImpostorColorGame(room)
    return true
  }
  if (game.currentPlayerId === clientId) {
    clearGameTimer(room)
    game.currentPlayerId = activeImpostorColorPlayers(room)[0]
    game.phase = 'turn_delay'
    game.phaseEndsAt = Date.now() + IMPOSTOR_COLOR_TURN_DELAY_MS
    broadcastRoom(room, 'game_state')
    scheduleGame(room, IMPOSTOR_COLOR_TURN_DELAY_MS, () => setImpostorColorTurn(room))
    return true
  }
  broadcastRoom(room, 'game_state')
  return true
}

function removeGamePlayer(room, clientId) {
  if (room.game?.id === 'reaction_time') return removeReactionPlayer(room, clientId)
  if (room.game?.id === 'guess_the_time') return removeGuessTimePlayer(room, clientId)
  if (room.game?.id === 'impostor_color') return removeImpostorColorPlayer(room, clientId)
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
  maybeAdvanceIntermission(room)
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
    format: 'Elimination',
    maxGames: 5,
    lastStandardMaxGames: 5,
    manualGames: false,
    selectedGames: [],
    phase: 'lobby',
    game: null,
    gameQueue: [],
    gameIndex: 0,
    instructions: null,
    intermission: null,
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
      const requestedMaxGames = Number(message.maxGames)
      if (!ROOM_MODES.has(message.mode)
        || !TOURNAMENT_FORMATS.has(message.format)
        || (message.mode !== 'For Fun' && !MAX_GAMES.has(requestedMaxGames))) {
        return reject(socket, 'Unsupported room settings.')
      }
      room.mode = message.mode
      room.format = message.format
      if (room.mode === 'For Fun') {
        if (MAX_GAMES.has(requestedMaxGames)) room.lastStandardMaxGames = requestedMaxGames
        room.maxGames = 1
      } else {
        room.maxGames = requestedMaxGames
        room.lastStandardMaxGames = requestedMaxGames
      }
      const playableGameIds = playableGameIdsForMode(room.mode)
      room.selectedGames = room.selectedGames
        .filter((gameId) => playableGameIds.has(gameId))
        .slice(0, room.maxGames)
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
      const playableGameIds = playableGameIdsForMode(room.mode)
      const gameIds = [...new Set(message.gameIds.map(String))].filter((gameId) => playableGameIds.has(gameId))
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
    if (message.type === 'impostor_color_pick') {
      if (room.game?.id !== 'impostor_color') return reject(socket, 'Impostor Color is not active.')
      if (!pickImpostorColorBottle(room, clientId, Number(message.bottleIndex))) {
        return reject(socket, 'Wait for your turn and choose an unopened bottle.')
      }
      return
    }
    if (message.type === 'skip_intermission') {
      if (room.phase !== 'intermission' || !room.intermission) {
        return reject(socket, 'There is no post-game leaderboard to skip.')
      }
      if (member.player.bot || !member.player.connected) {
        return reject(socket, 'Only active human players can continue.')
      }
      if (room.intermission.acknowledgedPlayerIds.has(clientId)) {
        return reject(socket, 'You have already chosen to continue.')
      }
      room.intermission.acknowledgedPlayerIds.add(clientId)
      if (!maybeAdvanceIntermission(room)) broadcastRoom(room)
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
      const playableGameIds = playableGameIdsForMode(room.mode)
      if (!playableGameIds.size) {
        return reject(socket, `No playable games are available for ${room.mode} yet.`)
      }
      room.gameQueue = room.manualGames
        ? room.selectedGames.filter((gameId) => playableGameIds.has(gameId))
        : randomGameQueue(room.mode, room.maxGames)
      if (!room.gameQueue.length) room.gameQueue = randomGameQueue(room.mode, room.maxGames)
      room.gameIndex = 0
      createTournament(room)
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
