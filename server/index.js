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
const IMPOSTOR_COLOR_SHAKE_SOUNDS = ['bottle_shake_one', 'bottle_shake_two']
const TOURNAMENT_FINISH_SOUNDS = {
  eliminationWinner: 'elimination_finish_with_winner',
  eliminationNoWinner: ['elimination_finish_without_winner_1', 'elimination_finish_without_winner_2'],
  ranking: 'ranking_podium_finish',
}
const WORD_MEMORY_ROUND_INTRO_MS = 3_000
const WORD_MEMORY_WORD_MS = 3_000
const WORD_MEMORY_WORD_GAP_MS = 1_000
const WORD_MEMORY_READY_MS = 5_000
const WORD_MEMORY_ANSWER_MS = 15_000
const WORD_MEMORY_REVEAL_MS = 3_000
const WORD_MEMORY_RESULT_MS = 3_000
const WORD_MEMORY_BOT_CORRECT_CHANCE = 0.6
const AVOID_SIMILAR_ROUND_INTRO_MS = 3_000
const AVOID_SIMILAR_ANSWER_MS = 15_000
const AVOID_SIMILAR_LOCKED_MS = 3_000
const AVOID_SIMILAR_TARGET_REVEAL_MS = 3_000
const AVOID_SIMILAR_EVALUATION_MS = 30_000
const AVOID_SIMILAR_VOTE_RESULT_MS = 3_000
const AVOID_SIMILAR_RESULT_MS = 3_000
const FULL_WATER_TURN_START_MS = 5_000
const FULL_WATER_MAX_POUR_ML = 5
const FULL_WATER_ML_PER_SECOND = 1
const FULL_WATER_MIN_POUR_ML = 0.1
const FULL_WATER_SETTLE_MS = 1_500
const FULL_WATER_WARNING_MS = 2_000
const FULL_WATER_ROUND_INTRO_MS = 3_000
const FULL_WATER_BOT_START_MIN_MS = 650
const FULL_WATER_BOT_START_MAX_MS = 1_250
const TYPE_IT_PREPARATION_MS = 5_000
const TYPE_IT_TIMEOUT_FEEDBACK_MS = 600
const TYPE_IT_RESULT_MS = 5_000
const TYPE_IT_TIME_LIMITS_MS = [30_000, 45_000, 60_000]
const TYPE_IT_MIN_ACCURACY = 75
const TYPE_IT_BOT_STEP_MIN_MS = 55
const TYPE_IT_BOT_STEP_MAX_MS = 130
const INTERMISSION_DURATION_MS = 15_000
const MONSTER_ESCAPE_ROUND_MS = 5 * 60_000
const MONSTER_ESCAPE_ROUND_INTRO_MS = 3_000
const MONSTER_ESCAPE_ROUND_RESULT_MS = 3_000
const MONSTER_ESCAPE_TICK_MS = 100
const MONSTER_ESCAPE_SEARCH_MS = 5_000
const MONSTER_ESCAPE_TRANSIT_MS = 3_000
const MONSTER_ESCAPE_KILL_MS = 5_000
const MONSTER_ESCAPE_BLIND_MS = 5_000
const MONSTER_ESCAPE_HIDE_MS = 10_000
const MONSTER_ESCAPE_HIDE_WARNING_MS = 3_000
const MONSTER_ESCAPE_MONSTER_FLOOR_MS = 10_000
const MONSTER_ESCAPE_MONSTER_FREEZE_MS = 5_000
const MONSTER_ESCAPE_MONSTER_LEAVE_MS = 5_000
const MONSTER_ESCAPE_HIDE_SEARCH_COOLDOWN_MS = 60_000
const MONSTER_ESCAPE_INTERACT_RANGE = 76
const MONSTER_ESCAPE_FLOORS = [1, 2, 3, 4, 5]
// guide.png is the 1672 x 941 source map. These are the top edges of its red
// floor bands, so player feet sit on the visible solid ground rather than in it.
const MONSTER_ESCAPE_MAP_WIDTH = 1672
const MONSTER_ESCAPE_FLOOR_Y = { 1: 933, 2: 749, 3: 568, 4: 378, 5: 189 }
const MONSTER_ESCAPE_LEFT_STAIRS_X = 170
const MONSTER_ESCAPE_ELEVATOR_X = 1570
const MONSTER_ESCAPE_EXIT = { floor: 1, x: 1120 }
const MONSTER_ESCAPE_HUMAN_SPAWNS = [
  { floor: 5, x: 800 }, { floor: 5, x: 1455 }, { floor: 4, x: 365 }, { floor: 4, x: 650 },
  { floor: 3, x: 690 }, { floor: 3, x: 1355 }, { floor: 2, x: 350 }, { floor: 2, x: 840 }, { floor: 2, x: 1335 },
]
const MONSTER_ESCAPE_MONSTER_SPAWNS = [
  { floor: 1, x: 370 }, { floor: 1, x: 480 }, { floor: 1, x: 880 }, { floor: 1, x: 1320 }, { floor: 1, x: 1480 },
]
const MONSTER_ESCAPE_HIDE_SPOTS = [
  { id: 'hide-5a', floor: 5, x: 1035 }, { id: 'hide-5b', floor: 5, x: 1260 }, { id: 'hide-4a', floor: 4, x: 770 },
  { id: 'hide-4b', floor: 4, x: 1500 }, { id: 'hide-3a', floor: 3, x: 570 }, { id: 'hide-3b', floor: 3, x: 930 },
  { id: 'hide-3c', floor: 3, x: 1250 }, { id: 'hide-3d', floor: 3, x: 1450 }, { id: 'hide-1a', floor: 1, x: 670 },
]
const MONSTER_ESCAPE_SEARCH_SPOTS = [
  { id: 'search-5a', floor: 5, x: 455 }, { id: 'search-5b', floor: 5, x: 700 }, { id: 'search-5c', floor: 5, x: 940 },
  { id: 'search-5d', floor: 5, x: 1175 }, { id: 'search-5e', floor: 5, x: 1360 }, { id: 'search-4a', floor: 4, x: 535 },
  { id: 'search-4b', floor: 4, x: 940 }, { id: 'search-3a', floor: 3, x: 475 }, { id: 'search-3b', floor: 3, x: 805 },
  { id: 'search-3c', floor: 3, x: 1165 }, { id: 'search-2a', floor: 2, x: 555 }, { id: 'search-2b', floor: 2, x: 1090 },
  { id: 'search-1a', floor: 1, x: 375 }, { id: 'search-1b', floor: 1, x: 865 }, { id: 'search-1c', floor: 1, x: 1320 },
]
const MONSTER_ESCAPE_ITEM_DEFINITIONS = {
  first_aid_kit: { weight: 0.5, max: 1, asset: 'first_aid.png' },
  flashlight: { weight: 0.8, max: 2, asset: 'flashlight.png' },
  lifter: { weight: 0.25, max: 1, asset: 'lifter.png' },
  life_injector: { weight: 0.15, max: 1, asset: 'life_injector.png' },
  adrenaline_shot: { weight: 0.6, max: 2, asset: 'adrenaline_shot.png' },
  sense_booster: { weight: 0.4, max: 1, asset: 'sense_booster.png' },
}
const MONSTER_ESCAPE_MODELS = {
  human: ['bob', 'mae'],
  monster: ['big_steps', 'tall_silhoutte'],
}
const SUPPORTED_GAME_IDS = new Set(['reaction_time', 'guess_the_time', 'impostor_color', 'word_memory_challenge', 'avoid_similar_answer', 'full_water', 'type_it', 'monster_escape_office'])
function loadGameCatalog(fileName) {
  const source = readFileSync(new URL(`../data/games/${fileName}`, import.meta.url), 'utf8').trim()
  return source ? JSON.parse(source) : []
}

const GAME_CATALOGS = {
  Team: loadGameCatalog('team.json'),
  'Free For All': loadGameCatalog('free_for_all.json'),
  'For Fun': loadGameCatalog('for_fun.json'),
}
const DATASETS = JSON.parse(readFileSync(new URL('../data/datasets.json', import.meta.url), 'utf8'))
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

function roomView(room, viewerId = null) {
  return {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    format: room.format,
    maxGames: room.maxGames,
    lastStandardMaxGames: room.lastStandardMaxGames,
    manualGames: room.manualGames,
    selectedGames: room.selectedGames,
    overtime: {
      active: room.scheduledGameCount > 0 && room.gameIndex >= room.scheduledGameCount,
      pending: Boolean(room.overtimePending),
      count: room.overtimeGameCount,
    },
    phase: room.phase,
    instructions: room.instructions && {
      game: room.instructions.game,
      endsAt: room.instructions.endsAt,
      acknowledgedPlayerIds: [...room.instructions.acknowledgedPlayerIds],
    },
    intermission: room.intermission && {
      endsAt: room.intermission.endsAt,
      acknowledgedPlayerIds: [...room.intermission.acknowledgedPlayerIds],
      overtime: Boolean(room.intermission.overtime),
    },
    tournament: tournamentView(room),
    game: room.game ? gameView(room, viewerId) : null,
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

function gameView(room, viewerId = null) {
  if (room.game.id === 'monster_escape_office') return monsterEscapeGameView(room, viewerId)
  if (room.game.id === 'guess_the_time') return guessTimeGameView(room)
  if (room.game.id === 'impostor_color') return impostorColorGameView(room)
  if (room.game.id === 'word_memory_challenge') return wordMemoryGameView(room)
  if (room.game.id === 'avoid_similar_answer') return avoidSimilarGameView(room)
  if (room.game.id === 'full_water') return fullWaterGameView(room)
  if (room.game.id === 'type_it') return typeItGameView(room)
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
    finishSound: room.tournament.finishSound,
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
    shakeSequence: game.shakeSequence,
    shakeSound: game.shakeSound,
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

function wordMemoryGameView(room) {
  const game = room.game
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  const showAnswer = ['reveal', 'round_result', 'complete'].includes(game.phase)
  const showQuestion = ['answering', 'answers_locked', 'reveal', 'round_result', 'complete'].includes(game.phase)
  const showLockedAnswers = game.phase === 'answers_locked'
  return {
    id: game.id,
    round: game.round,
    maxRounds: game.maxRounds,
    phase: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    currentWord: game.phase === 'showing_word' ? game.words[game.wordIndex] || '' : '',
    wordIndex: game.wordIndex,
    wordCount: game.words.length,
    question: showQuestion ? game.question?.text || '' : '',
    answerWord: showAnswer ? game.question?.answerWord || '' : '',
    answerLetterIndex: showAnswer ? game.question?.answerLetterIndex ?? null : null,
    answer: showAnswer ? game.question?.answer || '' : '',
    answeredPlayerIds: [...game.answers.keys()],
    correctPlayerIds: showAnswer ? game.correctPlayerIds : [],
    eliminatedIds: game.eliminatedIds,
    winnerId: game.winnerId,
    winnerName: playerById.get(game.winnerId)?.name || '',
    players: game.playerIds.map((playerId) => ({
      playerId,
      playerName: playerById.get(playerId)?.name || '',
      eliminated: game.eliminatedIds.includes(playerId),
      answered: game.answers.has(playerId),
      answer: showLockedAnswers ? game.answers.get(playerId) || '' : null,
      correct: showAnswer ? game.correctPlayerIds.includes(playerId) : null,
    })),
  }
}

function typeItGameView(room) {
  const game = room.game
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  const showResults = ['round_result', 'complete'].includes(game.phase)
  return {
    id: game.id,
    round: game.round,
    maxRounds: game.maxRounds,
    phase: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    roundLimitMs: game.roundLimitMs,
    phrase: game.phrase,
    eliminatedIds: game.eliminatedIds,
    roundEliminatedIds: game.roundEliminatedIds,
    winnerId: game.winnerId,
    winnerName: playerById.get(game.winnerId)?.name || '',
    players: game.playerIds.map((playerId) => {
      const result = game.results.get(playerId)
      return {
        playerId,
        playerName: playerById.get(playerId)?.name || '',
        eliminated: game.eliminatedIds.includes(playerId),
        eliminatedThisRound: game.roundEliminatedIds.includes(playerId),
        typedText: game.inputs.get(playerId) || '',
        typedLength: (game.inputs.get(playerId) || '').length,
        finished: Boolean(result?.finished),
        accuracy: showResults ? result?.accuracy ?? null : null,
        speedSeconds: showResults ? result?.speedSeconds ?? null : null,
      }
    }),
  }
}

function fullWaterGameView(room) {
  const game = room.game
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  return {
    id: game.id,
    round: game.round,
    maxRounds: game.maxRounds,
    phase: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    currentPlayerId: game.currentPlayerId,
    currentPlayerName: playerById.get(game.currentPlayerId)?.name || '',
    capacityMl: game.capacityMl,
    waterMl: game.waterMl,
    pourStartedAt: game.pourStartedAt,
    pourStartWaterMl: game.pourStartWaterMl,
    pouredMl: game.pouredMl,
    turnPouredMl: game.turnPouredMl,
    hasPoured: game.hasPoured,
    eliminatedIds: game.eliminatedIds,
    eliminatedPlayerId: game.eliminatedPlayerId,
    eliminatedPlayerName: playerById.get(game.eliminatedPlayerId)?.name || '',
    winnerId: game.winnerId,
    winnerName: playerById.get(game.winnerId)?.name || '',
    players: game.playerIds.map((playerId) => ({
      playerId,
      playerName: playerById.get(playerId)?.name || '',
      eliminated: game.eliminatedIds.includes(playerId),
      warningCount: game.warningCounts.get(playerId) || 0,
      eliminatedByAfk: game.afkEliminatedIds.includes(playerId),
    })),
  }
}

function avoidSimilarGameView(room) {
  const game = room.game
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  const showAnswers = ['answers_locked', 'reveal_target', 'evaluation', 'vote_results', 'round_result', 'complete'].includes(game.phase)
  const showTarget = ['reveal_target', 'evaluation', 'vote_results', 'round_result', 'complete'].includes(game.phase)
  const showVoteResults = ['vote_results', 'round_result', 'complete'].includes(game.phase)
  const playerIds = [...game.playerIds].sort((left, right) => Number(game.eliminatedIds.includes(left)) - Number(game.eliminatedIds.includes(right)))
  return {
    id: game.id,
    round: game.round,
    maxRounds: game.maxRounds,
    phase: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    request: game.request || '',
    gameAnswer: showTarget ? game.gameAnswer || '' : '',
    answeredPlayerIds: [...game.answers.keys()],
    eliminatedIds: game.eliminatedIds,
    directEliminatedIds: game.directEliminatedIds,
    roundEliminatedIds: game.roundEliminatedIds,
    voteRecords: game.phase === 'evaluation'
      ? [...game.votes.entries()].flatMap(([targetPlayerId, votes]) => [...votes.entries()].map(([voterPlayerId, vote]) => ({ targetPlayerId, voterPlayerId, vote })))
      : [],
    voteResults: showVoteResults ? game.voteResults : [],
    evaluationPlayerIds: game.phase === 'evaluation' ? game.evaluationPlayerIds : [],
    winnerId: game.winnerId,
    winnerName: playerById.get(game.winnerId)?.name || '',
    players: playerIds.map((playerId, index) => ({
      playerId,
      playerName: playerById.get(playerId)?.name || '',
      rank: index + 1,
      answer: showAnswers ? game.answers.get(playerId) || '' : null,
      answered: game.answers.has(playerId),
      eliminated: game.eliminatedIds.includes(playerId),
      eliminatedThisRound: game.roundEliminatedIds.includes(playerId),
      directEliminated: game.directEliminatedIds.includes(playerId),
    })),
  }
}

function monsterEscapeRolePlayerIds(room, role) {
  const group = role === 'human' ? 'one' : 'two'
  return room.slots[group].filter(Boolean).map((player) => player.id)
}

function monsterEscapePlayer(room, playerId) {
  return room.game?.players.get(playerId) || null
}

function monsterEscapeIsActive(player) {
  return player && !player.devoured && !player.escaped
}

function monsterEscapeDistance(left, right) {
  return left && right && left.floor === right.floor ? Math.abs(left.x - right.x) : Number.POSITIVE_INFINITY
}

function monsterEscapeVision(player, now) {
  if (!player) return 0
  if (player.role === 'monster') return 300
  return now < player.senseUntil ? 800 : 250
}

function shuffled(values) {
  return [...values].sort(() => Math.random() - 0.5)
}

function monsterEscapeSpawnRound(room) {
  const game = room.game
  const humanSpawns = shuffled(MONSTER_ESCAPE_HUMAN_SPAWNS)
  const monsterSpawns = shuffled(MONSTER_ESCAPE_MONSTER_SPAWNS)
  let humanIndex = 0
  let monsterIndex = 0
  game.players.forEach((entry) => {
    const spawn = entry.role === 'human'
      ? humanSpawns[humanIndex++ % humanSpawns.length]
      : monsterSpawns[monsterIndex++ % monsterSpawns.length]
    Object.assign(entry, {
      floor: spawn.floor,
      x: spawn.x,
      health: entry.role === 'human' ? 3 : null,
      inventory: [],
      equippedSlot: 0,
      devoured: false,
      escaped: false,
      hiddenSpotId: null,
      hiddenUntil: 0,
      searchingUntil: 0,
      searchingSpotId: null,
      transitTo: null,
      transitEndsAt: 0,
      awaitingTransit: false,
      grabbedById: null,
      killTargetId: null,
      killEndsAt: 0,
      blindedUntil: 0,
      frozenUntil: 0,
      mustLeaveFloorBy: 0,
      floorEnteredAt: Date.now(),
      hideSearchCooldownUntil: 0,
      adrenalineUntil: 0,
      flashlightUntil: 0,
      senseUntil: 0,
      lastFoundItem: null,
      itemRevealUntil: 0,
      facing: 'right',
      moving: false,
      running: false,
    })
  })
  game.inputs.clear()
  game.searchedSpotIds.clear()
  game.blocker = { removed: false, lifterIds: new Set(), startedAt: 0, requiredMs: 0 }
}

function monsterEscapeBeginRound(room) {
  const game = room.game
  if (!game || game.id !== 'monster_escape_office') return
  monsterEscapeSpawnRound(room)
  game.phase = 'round_intro'
  game.roundEndsAt = Date.now() + MONSTER_ESCAPE_ROUND_INTRO_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, MONSTER_ESCAPE_ROUND_INTRO_MS, () => {
    if (room.game !== game) return
    game.phase = 'active'
    game.roundEndsAt = Date.now() + MONSTER_ESCAPE_ROUND_MS
    broadcastRoom(room, 'game_state')
  })
}

function monsterEscapeFinishRound(room, winnerRole, reason) {
  const game = room.game
  if (!game || game.id !== 'monster_escape_office' || game.phase === 'round_result' || game.phase === 'complete') return
  clearGameTimer(room)
  game.phase = 'round_result'
  game.roundWinnerRole = winnerRole
  game.roundReason = reason
  game.wins[winnerRole] += 1
  game.roundEndsAt = Date.now() + MONSTER_ESCAPE_ROUND_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, MONSTER_ESCAPE_ROUND_RESULT_MS, () => {
    if (room.game !== game) return
    if (game.wins.human >= game.roundsToWin || game.wins.monster >= game.roundsToWin || game.round >= game.maxRounds) {
      game.phase = 'complete'
      game.matchWinnerRole = game.wins.human > game.wins.monster ? 'human' : 'monster'
      game.roundEndsAt = null
      broadcastRoom(room, 'game_state')
      return
    }
    game.round += 1
    monsterEscapeBeginRound(room)
  })
}

function monsterEscapeCompleteKill(room, monster, human) {
  const game = room.game
  if (!game || game.phase !== 'active' || !monster || !human || monster.killTargetId !== human.playerId) return
  monster.killTargetId = null
  monster.killEndsAt = 0
  monster.floorEnteredAt = Date.now()
  human.grabbedById = null
  human.devoured = true
  const aliveHumans = [...game.players.values()].filter((entry) => entry.role === 'human' && !entry.devoured && !entry.escaped)
  if (!aliveHumans.length) monsterEscapeFinishRound(room, 'monster', 'All humans were devoured.')
}

function monsterEscapeCancelKill(room, monster) {
  const game = room.game
  if (!game || !monster?.killTargetId) return
  const target = monsterEscapePlayer(room, monster.killTargetId)
  if (target) target.grabbedById = null
  monster.killTargetId = null
  monster.killEndsAt = 0
}

function monsterEscapeBlindMonster(room, monster) {
  const game = room.game
  if (!game || !monster || monster.role !== 'monster' || !monsterEscapeIsActive(monster)) return false
  monsterEscapeCancelKill(room, monster)
  monster.blindedUntil = Date.now() + MONSTER_ESCAPE_BLIND_MS
  game.blindSequence += 1
  broadcastRoom(room, 'game_state')
  return true
}

function monsterEscapeWeightedItem() {
  const entries = Object.entries(MONSTER_ESCAPE_ITEM_DEFINITIONS)
  const total = entries.reduce((sum, [, item]) => sum + item.weight, 0)
  let roll = Math.random() * total
  for (const [id, item] of entries) {
    roll -= item.weight
    if (roll <= 0) return id
  }
  return entries[0][0]
}

function monsterEscapeItemCount(player, itemId) {
  return player.inventory.filter((item) => item === itemId).length
}

function monsterEscapeSearch(room, player, spot) {
  const game = room.game
  if (!game || !player || player.role !== 'human' || !spot || player.searchingUntil || game.searchedSpotIds.has(spot.id)) return false
  player.searchingSpotId = spot.id
  player.searchingUntil = Date.now() + MONSTER_ESCAPE_SEARCH_MS
  broadcastRoom(room, 'game_state')
  return true
}

function monsterEscapeResolveSearch(room, player) {
  const game = room.game
  if (!game || !player.searchingSpotId) return
  const spotId = player.searchingSpotId
  player.searchingSpotId = null
  player.searchingUntil = 0
  game.searchedSpotIds.add(spotId)
  let foundItemId = null
  if (Math.random() < 0.5 && player.inventory.length < 5) {
    const candidate = monsterEscapeWeightedItem()
    const item = MONSTER_ESCAPE_ITEM_DEFINITIONS[candidate]
    if (monsterEscapeItemCount(player, candidate) < item.max) {
      player.inventory.push(candidate)
      foundItemId = candidate
    }
  }
  player.lastFoundItem = foundItemId
  player.itemRevealUntil = Date.now() + 5_000
  broadcastRoom(room, 'game_state')
}

function monsterEscapeStartTransit(room, player, destinationFloor) {
  const game = room.game
  if (!game || !player || player.role !== 'human' || !monsterEscapeIsActive(player) || player.transitEndsAt || !MONSTER_ESCAPE_FLOORS.includes(destinationFloor)) return false
  const nearStairs = Math.abs(player.x - MONSTER_ESCAPE_LEFT_STAIRS_X) <= MONSTER_ESCAPE_INTERACT_RANGE
  const nearElevator = Math.abs(player.x - MONSTER_ESCAPE_ELEVATOR_X) <= MONSTER_ESCAPE_INTERACT_RANGE && player.floor >= 2
  const valid = nearStairs || (nearElevator && destinationFloor >= 2)
  if (!valid || destinationFloor === player.floor) return false
  player.transitTo = { floor: destinationFloor, x: nearStairs ? MONSTER_ESCAPE_LEFT_STAIRS_X : MONSTER_ESCAPE_ELEVATOR_X }
  player.transitEndsAt = Date.now() + MONSTER_ESCAPE_TRANSIT_MS
  broadcastRoom(room, 'game_state')
  return true
}

function monsterEscapeMonsterStairs(room, player, direction) {
  if (!player || player.role !== 'monster' || !monsterEscapeIsActive(player) || Math.abs(player.x - MONSTER_ESCAPE_LEFT_STAIRS_X) > MONSTER_ESCAPE_INTERACT_RANGE) return false
  const targetFloor = player.floor + direction
  if (!MONSTER_ESCAPE_FLOORS.includes(targetFloor)) return false
  player.floor = targetFloor
  player.x = MONSTER_ESCAPE_LEFT_STAIRS_X
  player.floorEnteredAt = Date.now()
  player.mustLeaveFloorBy = 0
  broadcastRoom(room, 'game_state')
  return true
}

function monsterEscapeUseItem(room, player, targetId = '') {
  const game = room.game
  if (!game || !player || player.role !== 'human' || !monsterEscapeIsActive(player)) return false
  const itemId = player.inventory[player.equippedSlot]
  if (!itemId) return false
  const now = Date.now()
  if (itemId === 'first_aid_kit') player.health = Math.min(3, player.health + 3)
  else if (itemId === 'adrenaline_shot') player.adrenalineUntil = now + 10_000
  else if (itemId === 'sense_booster') player.senseUntil = now + 30_000
  else if (itemId === 'flashlight') {
    const target = [...game.players.values()]
      .filter((entry) => entry.role === 'monster' && monsterEscapeIsActive(entry) && monsterEscapeDistance(player, entry) <= monsterEscapeVision(player, now))
      .sort((left, right) => monsterEscapeDistance(player, left) - monsterEscapeDistance(player, right))[0]
    if (!target || (player.facing === 'left' ? target.x > player.x : target.x < player.x)) return false
    player.flashlightUntil = now + 15_000
    monsterEscapeBlindMonster(room, target)
  } else if (itemId === 'life_injector') {
    const target = monsterEscapePlayer(room, targetId)
    if (!target || target.role !== 'human' || !target.devoured) return false
    const spawn = MONSTER_ESCAPE_HUMAN_SPAWNS[Math.floor(Math.random() * MONSTER_ESCAPE_HUMAN_SPAWNS.length)]
    Object.assign(target, { devoured: false, escaped: false, grabbedById: null, health: 3, floor: spawn.floor, x: spawn.x, floorEnteredAt: now })
  } else if (itemId !== 'lifter') return false
  player.inventory.splice(player.equippedSlot, 1)
  player.equippedSlot = Math.max(0, Math.min(player.equippedSlot, player.inventory.length - 1))
  broadcastRoom(room, 'game_state')
  return true
}

function monsterEscapeInteract(room, clientId, direction = 0) {
  const game = room.game
  const player = monsterEscapePlayer(room, clientId)
  if (!game || game.phase !== 'active' || !monsterEscapeIsActive(player)) return false
  const now = Date.now()
  if (player.role === 'monster') {
    if (now < player.blindedUntil || now < player.frozenUntil || player.killTargetId) return false
    if (Math.abs(player.x - MONSTER_ESCAPE_LEFT_STAIRS_X) <= MONSTER_ESCAPE_INTERACT_RANGE && direction) return monsterEscapeMonsterStairs(room, player, direction)
    const hiding = MONSTER_ESCAPE_HIDE_SPOTS.find((spot) => spot.floor === player.floor && Math.abs(spot.x - player.x) <= MONSTER_ESCAPE_INTERACT_RANGE)
    if (hiding && now >= player.hideSearchCooldownUntil) {
      player.hideSearchCooldownUntil = now + MONSTER_ESCAPE_HIDE_SEARCH_COOLDOWN_MS
      const target = [...game.players.values()].find((entry) => entry.role === 'human' && entry.hiddenSpotId === hiding.id && monsterEscapeIsActive(entry))
      if (target) {
        target.hiddenSpotId = null
        target.hiddenUntil = 0
        target.grabbedById = player.playerId
        player.killTargetId = target.playerId
        player.killEndsAt = now + MONSTER_ESCAPE_KILL_MS
      }
      broadcastRoom(room, 'game_state')
      return true
    }
    const target = [...game.players.values()]
      .filter((entry) => entry.role === 'human' && monsterEscapeIsActive(entry) && !entry.hiddenSpotId && monsterEscapeDistance(player, entry) <= MONSTER_ESCAPE_INTERACT_RANGE)
      .sort((left, right) => monsterEscapeDistance(player, left) - monsterEscapeDistance(player, right))[0]
    if (!target) return false
    target.grabbedById = player.playerId
    player.killTargetId = target.playerId
    player.killEndsAt = now + MONSTER_ESCAPE_KILL_MS
    broadcastRoom(room, 'game_state')
    return true
  }
  if (player.grabbedById || player.searchingUntil || player.transitEndsAt) return false
  if (player.floor === MONSTER_ESCAPE_EXIT.floor && Math.abs(player.x - MONSTER_ESCAPE_EXIT.x) <= MONSTER_ESCAPE_INTERACT_RANGE && !game.blocker.removed) {
    game.blocker.lifterIds.add(player.playerId)
    if (!game.blocker.startedAt) game.blocker.startedAt = now
    broadcastRoom(room, 'game_state')
    return true
  }
  if (player.floor === MONSTER_ESCAPE_EXIT.floor && Math.abs(player.x - MONSTER_ESCAPE_EXIT.x) <= MONSTER_ESCAPE_INTERACT_RANGE && game.blocker.removed) {
    player.escaped = true
    const escaped = [...game.players.values()].filter((entry) => entry.role === 'human' && entry.escaped).length
    const humans = [...game.players.values()].filter((entry) => entry.role === 'human').length
    if (escaped >= Math.max(1, Math.floor(humans / 2))) monsterEscapeFinishRound(room, 'human', 'Enough humans escaped.')
    else broadcastRoom(room, 'game_state')
    return true
  }
  const stairOrElevator = Math.abs(player.x - MONSTER_ESCAPE_LEFT_STAIRS_X) <= MONSTER_ESCAPE_INTERACT_RANGE
    || (player.floor >= 2 && Math.abs(player.x - MONSTER_ESCAPE_ELEVATOR_X) <= MONSTER_ESCAPE_INTERACT_RANGE)
  if (stairOrElevator) {
    player.awaitingTransit = true
    broadcastRoom(room, 'game_state')
    return true
  }
  const spot = MONSTER_ESCAPE_SEARCH_SPOTS.find((entry) => entry.floor === player.floor && Math.abs(entry.x - player.x) <= MONSTER_ESCAPE_INTERACT_RANGE)
  if (spot) return monsterEscapeSearch(room, player, spot)
  const hiding = MONSTER_ESCAPE_HIDE_SPOTS.find((entry) => entry.floor === player.floor && Math.abs(entry.x - player.x) <= MONSTER_ESCAPE_INTERACT_RANGE)
  if (hiding) {
    if (player.hiddenSpotId) {
      player.hiddenSpotId = null
      player.hiddenUntil = 0
    } else {
      player.hiddenSpotId = hiding.id
      player.hiddenUntil = now + MONSTER_ESCAPE_HIDE_MS
    }
    broadcastRoom(room, 'game_state')
    return true
  }
  return false
}

function monsterEscapeSetInput(room, clientId, direction, running) {
  const game = room.game
  const player = monsterEscapePlayer(room, clientId)
  if (!game || game.phase !== 'active' || !monsterEscapeIsActive(player) || ![-1, 0, 1].includes(direction)) return false
  const unableToMove = player.hiddenSpotId || player.searchingUntil || player.transitEndsAt || player.awaitingTransit || player.grabbedById
    || (player.role === 'monster' && (player.blindedUntil > Date.now() || player.frozenUntil > Date.now() || player.killTargetId))
  if (direction && unableToMove) return false
  game.inputs.set(clientId, { direction, running: Boolean(running) })
  return true
}

function monsterEscapeMoveBotHorizontally(player, destinationX, speed) {
  const direction = Math.sign(destinationX - player.x)
  player.moving = Boolean(direction)
  player.running = false
  player.x += direction * speed
  if (direction) player.facing = direction < 0 ? 'left' : 'right'
  return direction
}

function monsterEscapeTickBots(room, now) {
  const game = room.game
  for (const player of game.players.values()) {
    const roomPlayer = findPlayer(room, player.playerId)?.player
    if (!roomPlayer?.bot) continue
    player.moving = false
    player.running = false
    if (!monsterEscapeIsActive(player) || player.hiddenSpotId || player.searchingUntil || player.transitEndsAt) continue
    if (player.role === 'human') {
      if (player.floor !== 1) {
        monsterEscapeMoveBotHorizontally(player, MONSTER_ESCAPE_LEFT_STAIRS_X, 7)
        if (Math.abs(player.x - MONSTER_ESCAPE_LEFT_STAIRS_X) < 10) {
          player.floor -= 1
          player.floorEnteredAt = now
        }
      } else {
        monsterEscapeMoveBotHorizontally(player, MONSTER_ESCAPE_EXIT.x, 7)
        if (Math.abs(player.x - MONSTER_ESCAPE_EXIT.x) <= MONSTER_ESCAPE_INTERACT_RANGE) monsterEscapeInteract(room, player.playerId)
      }
    } else {
      const target = [...game.players.values()].find((entry) => entry.role === 'human' && monsterEscapeIsActive(entry) && !entry.hiddenSpotId && entry.floor === player.floor)
      if (target) {
        monsterEscapeMoveBotHorizontally(player, target.x, 6)
        if (monsterEscapeDistance(player, target) <= MONSTER_ESCAPE_INTERACT_RANGE) monsterEscapeInteract(room, player.playerId)
      } else {
        monsterEscapeMoveBotHorizontally(player, MONSTER_ESCAPE_LEFT_STAIRS_X, 6)
        if (Math.abs(player.x - MONSTER_ESCAPE_LEFT_STAIRS_X) <= MONSTER_ESCAPE_INTERACT_RANGE) {
          const direction = player.floor === 1 ? 1 : player.floor === 5 ? -1 : (Math.random() < 0.5 ? -1 : 1)
          monsterEscapeMonsterStairs(room, player, direction)
        }
      }
    }
  }
}

function monsterEscapeTick(room, now = Date.now()) {
  const game = room.game
  if (!game || game.id !== 'monster_escape_office' || game.phase !== 'active') return
  if (now >= game.roundEndsAt) return monsterEscapeFinishRound(room, 'monster', 'Time expired.')
  monsterEscapeTickBots(room, now)
  for (const player of game.players.values()) {
    if (!monsterEscapeIsActive(player)) continue
    if (player.searchingUntil && now >= player.searchingUntil) monsterEscapeResolveSearch(room, player)
    if (player.transitEndsAt && now >= player.transitEndsAt) {
      player.floor = player.transitTo.floor
      player.x = player.transitTo.x
      player.floorEnteredAt = now
      player.transitTo = null
      player.transitEndsAt = 0
      player.awaitingTransit = false
    }
    if (player.hiddenUntil && now >= player.hiddenUntil) {
      player.hiddenSpotId = null
      player.hiddenUntil = 0
    }
    if (player.role === 'monster' && player.killTargetId && now >= player.killEndsAt) monsterEscapeCompleteKill(room, player, monsterEscapePlayer(room, player.killTargetId))
    if (player.role === 'monster' && !player.killTargetId) {
      if (player.frozenUntil && now >= player.frozenUntil) {
        player.frozenUntil = 0
        player.mustLeaveFloorBy = now + MONSTER_ESCAPE_MONSTER_LEAVE_MS
      } else if (!player.frozenUntil && player.mustLeaveFloorBy && now >= player.mustLeaveFloorBy) {
        player.frozenUntil = now + MONSTER_ESCAPE_MONSTER_FREEZE_MS
        player.mustLeaveFloorBy = 0
      } else if (!player.frozenUntil && !player.mustLeaveFloorBy && now - player.floorEnteredAt >= MONSTER_ESCAPE_MONSTER_FLOOR_MS) {
        player.frozenUntil = now + MONSTER_ESCAPE_MONSTER_FREEZE_MS
      }
    }
    const input = game.inputs.get(player.playerId)
    const locked = player.devoured || player.escaped || player.hiddenSpotId || player.searchingUntil || player.transitEndsAt || player.grabbedById
      || (player.role === 'monster' && (player.blindedUntil > now || player.frozenUntil > now || player.killTargetId))
    if (!locked && input?.direction) {
      const speed = player.role === 'human'
        ? ((input.running ? 150 : 75) * (player.adrenalineUntil > now ? 1.5 : 1))
        : (input.running ? 175 : 60)
      player.x = Math.max(80, Math.min(MONSTER_ESCAPE_MAP_WIDTH - 72, player.x + input.direction * speed * (MONSTER_ESCAPE_TICK_MS / 1_000)))
      player.facing = input.direction < 0 ? 'left' : 'right'
    }
  }
  const lifters = [...game.blocker.lifterIds]
    .map((playerId) => monsterEscapePlayer(room, playerId))
    .filter((player) => monsterEscapeIsActive(player) && player.floor === 1 && Math.abs(player.x - MONSTER_ESCAPE_EXIT.x) <= MONSTER_ESCAPE_INTERACT_RANGE)
  game.blocker.lifterIds = new Set(lifters.map((player) => player.playerId))
  if (lifters.length && !game.blocker.removed) {
    const hasLifter = lifters.some((player) => player.inventory.includes('lifter'))
    const humanCount = Math.max(3, [...game.players.values()].filter((player) => player.role === 'human').length)
    const table = humanCount >= 5 ? [25, 20, 15, 10, 8] : humanCount === 4 ? [20, 15, 10, 8] : [15, 10, 8]
    const requiredMs = hasLifter ? 5_000 : (table[Math.min(lifters.length, table.length) - 1] || table.at(-1)) * 1_000
    if (!game.blocker.startedAt || game.blocker.requiredMs !== requiredMs) {
      game.blocker.startedAt = now
      game.blocker.requiredMs = requiredMs
    }
    if (now - game.blocker.startedAt >= requiredMs) {
      game.blocker.removed = true
      game.blocker.lifterIds.clear()
      game.blocker.startedAt = 0
    }
  } else if (!game.blocker.removed) {
    game.blocker.startedAt = 0
    game.blocker.requiredMs = 0
  }
  if (!game.lastBroadcastAt || now - game.lastBroadcastAt >= 200) {
    game.lastBroadcastAt = now
    broadcastRoom(room, 'game_state')
  }
}

function startMonsterEscapeGame(room) {
  const definition = gameDefinition(room, 'monster_escape_office') || {}
  const players = new Map()
  monsterEscapeRolePlayerIds(room, 'human').forEach((playerId, index) => players.set(playerId, {
    playerId,
    role: 'human',
    model: MONSTER_ESCAPE_MODELS.human[index % MONSTER_ESCAPE_MODELS.human.length],
  }))
  monsterEscapeRolePlayerIds(room, 'monster').forEach((playerId, index) => players.set(playerId, {
    playerId,
    role: 'monster',
    model: MONSTER_ESCAPE_MODELS.monster[index % MONSTER_ESCAPE_MODELS.monster.length],
  }))
  room.game = {
    id: 'monster_escape_office',
    phase: 'round_intro',
    round: 1,
    maxRounds: Number(definition.rounds || 3),
    roundsToWin: Number(definition.rounds_to_win || 2),
    wins: { human: 0, monster: 0 },
    roundWinnerRole: null,
    roundReason: '',
    matchWinnerRole: null,
    roundEndsAt: null,
    players,
    inputs: new Map(),
    searchedSpotIds: new Set(),
    blocker: null,
    blindSequence: 0,
    lastBroadcastAt: 0,
  }
  monsterEscapeBeginRound(room)
}

function monsterEscapeGameView(room, viewerId) {
  const game = room.game
  const now = Date.now()
  const viewer = monsterEscapePlayer(room, viewerId)
  const follow = viewer && monsterEscapeIsActive(viewer)
    ? viewer
    : [...game.players.values()].find((entry) => entry.role === viewer?.role && monsterEscapeIsActive(entry)) || viewer
  const canSee = (entry) => entry.playerId === viewerId || !follow || (entry.floor === follow.floor && monsterEscapeDistance(follow, entry) <= monsterEscapeVision(follow, now))
  const playerById = new Map(roomPlayers(room).map((player) => [player.id, player]))
  return {
    id: game.id,
    phase: game.phase,
    round: game.round,
    maxRounds: game.maxRounds,
    wins: game.wins,
    roundWinnerRole: game.roundWinnerRole,
    roundReason: game.roundReason,
    matchWinnerRole: game.matchWinnerRole,
    roundEndsAt: game.roundEndsAt,
    blindSequence: game.blindSequence,
    blocker: {
      removed: game.blocker?.removed || false,
      lifting: game.blocker?.lifterIds?.has(viewerId) || false,
      progress: game.blocker?.startedAt && game.blocker.requiredMs ? Math.min(1, (now - game.blocker.startedAt) / game.blocker.requiredMs) : 0,
    },
    self: viewer && {
      ...viewer,
      blindRemainingMs: Math.max(0, viewer.blindedUntil - now),
      freezeRemainingMs: Math.max(0, viewer.frozenUntil - now),
      hideRemainingMs: Math.max(0, viewer.hiddenUntil - now),
      searchRemainingMs: Math.max(0, viewer.searchingUntil - now),
      transitRemainingMs: Math.max(0, viewer.transitEndsAt - now),
      hideSearchCooldownMs: Math.max(0, viewer.hideSearchCooldownUntil - now),
    },
    camera: follow && { floor: follow.floor, x: follow.x, y: MONSTER_ESCAPE_FLOOR_Y[follow.floor] },
    players: [...game.players.values()]
      .filter((entry) => canSee(entry))
      .map((entry) => ({
        playerId: entry.playerId,
        playerName: playerById.get(entry.playerId)?.name || '',
        role: entry.role,
        model: entry.model,
        floor: entry.floor,
        x: entry.x,
        y: MONSTER_ESCAPE_FLOOR_Y[entry.floor],
        facing: entry.facing,
        hidden: Boolean(entry.hiddenSpotId),
        devoured: entry.devoured,
        escaped: entry.escaped,
        grabbed: Boolean(entry.grabbedById),
        killing: Boolean(entry.killTargetId),
        blinded: entry.blindedUntil > now,
        frozen: entry.frozenUntil > now,
        moving: Boolean(entry.moving || game.inputs.get(entry.playerId)?.direction),
        running: Boolean(entry.running || game.inputs.get(entry.playerId)?.running),
      })),
    visibleSearchSpots: MONSTER_ESCAPE_SEARCH_SPOTS.filter((spot) => !game.searchedSpotIds.has(spot.id) && (!follow || (spot.floor === follow.floor && Math.abs(spot.x - follow.x) <= monsterEscapeVision(follow, now)))),
    visibleHideSpots: MONSTER_ESCAPE_HIDE_SPOTS.filter((spot) => !follow || (spot.floor === follow.floor && Math.abs(spot.x - follow.x) <= monsterEscapeVision(follow, now))),
    exit: MONSTER_ESCAPE_EXIT,
    floorY: MONSTER_ESCAPE_FLOOR_Y,
  }
}

function removeMonsterEscapePlayer(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'monster_escape_office') return removePlayer(room, clientId)
  const removed = monsterEscapePlayer(room, clientId)
  if (!removePlayer(room, clientId)) return false
  game.players.delete(clientId)
  game.inputs.delete(clientId)
  game.blocker?.lifterIds?.delete(clientId)
  for (const player of game.players.values()) {
    if (player.grabbedById === clientId) player.grabbedById = null
    if (player.killTargetId === clientId) monsterEscapeCancelKill(room, player)
  }
  if (game.phase === 'active' && removed) {
    const humans = [...game.players.values()].filter((player) => player.role === 'human' && monsterEscapeIsActive(player))
    const monsters = [...game.players.values()].filter((player) => player.role === 'monster' && monsterEscapeIsActive(player))
    if (!humans.length) monsterEscapeFinishRound(room, 'monster', 'All humans left the match.')
    else if (!monsters.length) monsterEscapeFinishRound(room, 'human', 'All monsters left the match.')
    else broadcastRoom(room, 'game_state')
  } else {
    broadcastRoom(room, 'game_state')
  }
  return true
}

function broadcastRoom(room, type = 'room_state') {
  room.revision += 1
  for (const player of roomPlayers(room)) {
    send(sockets.get(player.id), {
      type,
      revision: room.revision,
      room: roomView(room, player.id),
      serverNow: Date.now(),
    })
  }
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
    finishSound: null,
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
    tournament.finishSound = tournament.winnerId
      ? TOURNAMENT_FINISH_SOUNDS.eliminationWinner
      : TOURNAMENT_FINISH_SOUNDS.eliminationNoWinner[Math.floor(Math.random() * TOURNAMENT_FINISH_SOUNDS.eliminationNoWinner.length)]
  } else {
    tournament.winnerId = [...tournament.playerIds]
      .sort((left, right) => (tournament.points.get(right) || 0) - (tournament.points.get(left) || 0))[0] || null
    tournament.finishSound = TOURNAMENT_FINISH_SOUNDS.ranking
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
  } else if (game.id === 'word_memory_challenge') {
    game.playerIds.forEach((playerId) => addPoints(
      playerId,
      Number(game.correctPlayerIds.includes(playerId) ? allocation.winners : allocation.losers) || 0,
    ))
  } else if (game.id === 'avoid_similar_answer') {
    game.playerIds.forEach((playerId) => addPoints(
      playerId,
      Number(game.eliminatedIds.includes(playerId) ? allocation.losers : allocation.winners) || 0,
    ))
  } else if (game.id === 'full_water') {
    game.playerIds.forEach((playerId) => addPoints(
      playerId,
      Number(game.eliminatedIds.includes(playerId) ? allocation.losers : allocation.winners) || 0,
    ))
  } else if (game.id === 'type_it') {
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

function overtimeGamePool(room) {
  const playableGameIds = playableGameIdsForMode(room.mode)
  const selectedGames = room.selectedGames.filter((gameId) => playableGameIds.has(gameId))
  return room.manualGames && selectedGames.length
    ? selectedGames
    : [...playableGameIds]
}

function shouldQueueOvertimeGame(room) {
  return room.tournament?.format === 'Elimination'
    && tournamentGamePlayers(room).length > 1
    && room.gameIndex >= room.gameQueue.length - 1
}

function hasNextTournamentGame(room) {
  if (room.tournament?.format === 'Elimination') {
    if (tournamentGamePlayers(room).length <= 1) return false
    if (room.gameIndex < room.gameQueue.length - 1) return true
    return overtimeGamePool(room).length > 0
  }
  return room.gameIndex < room.gameQueue.length - 1
}

function advanceGameQueue(room) {
  if (!hasNextTournamentGame(room)) {
    completeTournament(room)
    room.intermission = null
    room.overtimePending = false
    broadcastRoom(room, 'game_state')
    return false
  }
  clearGameTimer(room)
  room.intermission = null
  if (shouldQueueOvertimeGame(room)) {
    const gamePool = overtimeGamePool(room)
    const gameId = gamePool[Math.floor(Math.random() * gamePool.length)]
    if (!gameId) {
      completeTournament(room)
      broadcastRoom(room, 'game_state')
      return false
    }
    room.gameQueue.push(gameId)
    room.overtimeGameCount += 1
  }
  room.overtimePending = false
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
    room.overtimePending = false
    broadcastRoom(room, 'game_state')
    return false
  }
  room.overtimePending = shouldQueueOvertimeGame(room)
  room.phase = 'intermission'
  room.intermission = {
    endsAt: Date.now() + INTERMISSION_DURATION_MS,
    acknowledgedPlayerIds: new Set(roomPlayers(room).filter((player) => player.bot).map((player) => player.id)),
    overtime: room.overtimePending,
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
  if (gameId === 'monster_escape_office') return startMonsterEscapeGame(room)
  if (gameId === 'guess_the_time') return startGuessTimeGame(room)
  if (gameId === 'impostor_color') return startImpostorColorGame(room)
  if (gameId === 'word_memory_challenge') return startWordMemoryGame(room)
  if (gameId === 'avoid_similar_answer') return startAvoidSimilarGame(room)
  if (gameId === 'full_water') return startFullWaterGame(room)
  if (gameId === 'type_it') return startTypeItGame(room)
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

function activeWordMemoryPlayers(room) {
  return room.game.playerIds.filter((playerId) =>
    !room.game.eliminatedIds.includes(playerId) && findPlayer(room, playerId),
  )
}

function normalizeWordMemoryAnswer(value) {
  return String(value || '').replace(/[^a-z]/gi, '').toLowerCase()
}

function chooseWordMemoryPhrase(game, room) {
  const roundKey = room.format === 'Ranking' ? 'round_3' : `round_${game.round}`
  const phrases = DATASETS.word_memory_challenge?.[roundKey] || []
  const available = phrases.filter((phrase) => !game.usedPhrases.includes(phrase))
  const pool = available.length ? available : phrases
  if (!pool.length) return []
  const phrase = pool[Math.floor(Math.random() * pool.length)]
  game.usedPhrases.push(phrase)
  return phrase.trim().split(/\s+/).filter(Boolean)
}

function createWordMemoryQuestion(words) {
  const choices = [
    { type: 'word', indexes: words.map((_, index) => index) },
    { type: 'letter', indexes: words.map((_, index) => index) },
    { type: 'next', indexes: words.slice(0, -1).map((_, index) => index) },
    { type: 'previous', indexes: words.slice(1).map((_, index) => index + 1) },
  ].filter((choice) => choice.indexes.length)
  const choice = choices[Math.floor(Math.random() * choices.length)]
  const index = choice.indexes[Math.floor(Math.random() * choice.indexes.length)]
  const targetIndex = choice.type === 'next' ? index + 1 : choice.type === 'previous' ? index - 1 : index
  const answerWord = words[targetIndex]
  const answer = choice.type === 'letter' ? answerWord[0] : answerWord
  const ordinal = index + 1
  const text = choice.type === 'word'
    ? `What is the ${ordinal}${ordinal === 1 ? 'st' : ordinal === 2 ? 'nd' : ordinal === 3 ? 'rd' : 'th'} word of this phrase?`
    : choice.type === 'letter'
      ? `What is the first letter of the ${ordinal}${ordinal === 1 ? 'st' : ordinal === 2 ? 'nd' : ordinal === 3 ? 'rd' : 'th'} word of this phrase?`
      : choice.type === 'next'
        ? `What is the next word after the ${ordinal}${ordinal === 1 ? 'st' : ordinal === 2 ? 'nd' : ordinal === 3 ? 'rd' : 'th'} word?`
        : `What was the word before the ${ordinal}${ordinal === 1 ? 'st' : ordinal === 2 ? 'nd' : ordinal === 3 ? 'rd' : 'th'} word?`
  return {
    type: choice.type,
    text,
    answer: normalizeWordMemoryAnswer(answer),
    answerWord,
    answerLetterIndex: choice.type === 'letter' ? 0 : null,
  }
}

function completeWordMemoryGame(room, survivors) {
  const game = room.game
  clearGameTimer(room)
  game.phase = 'complete'
  game.phaseEndsAt = null
  game.winnerId = survivors.length === 1 ? survivors[0] : null
  finalizeTournamentGame(room, game)
  broadcastRoom(room, 'game_state')
  scheduleNextGame(room)
}

function beginWordMemoryRound(room) {
  const game = room.game
  const survivors = activeWordMemoryPlayers(room)
  if (survivors.length <= 1) return completeWordMemoryGame(room, survivors)
  game.words = chooseWordMemoryPhrase(game, room)
  if (!game.words.length) return completeWordMemoryGame(room, survivors)
  game.question = createWordMemoryQuestion(game.words)
  game.wordIndex = 0
  game.answers = new Map()
  game.correctPlayerIds = []
  game.phase = 'round_intro'
  game.phaseEndsAt = Date.now() + WORD_MEMORY_ROUND_INTRO_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, WORD_MEMORY_ROUND_INTRO_MS, () => showWordMemoryWord(room))
}

function showWordMemoryWord(room) {
  const game = room.game
  if (!game || game.id !== 'word_memory_challenge') return
  if (game.wordIndex >= game.words.length) return beginWordMemoryReady(room)
  game.phase = 'showing_word'
  game.phaseEndsAt = Date.now() + WORD_MEMORY_WORD_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, WORD_MEMORY_WORD_MS, () => {
    game.phase = 'word_gap'
    game.phaseEndsAt = Date.now() + WORD_MEMORY_WORD_GAP_MS
    broadcastRoom(room, 'game_state')
    scheduleGame(room, WORD_MEMORY_WORD_GAP_MS, () => {
      game.wordIndex += 1
      if (game.wordIndex >= game.words.length) beginWordMemoryReady(room)
      else showWordMemoryWord(room)
    })
  })
}

function beginWordMemoryReady(room) {
  const game = room.game
  game.phase = 'be_ready'
  game.phaseEndsAt = Date.now() + WORD_MEMORY_READY_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, WORD_MEMORY_READY_MS, () => beginWordMemoryAnswers(room))
}

function wordMemoryWrongAnswer(answer, questionType) {
  if (questionType === 'letter') return answer === 'z' ? 'y' : 'z'
  const fallback = answer === 'memory' ? 'puzzle' : 'memory'
  return fallback
}

function beginWordMemoryAnswers(room) {
  const game = room.game
  game.phase = 'answering'
  game.phaseEndsAt = Date.now() + WORD_MEMORY_ANSWER_MS
  game.answers = new Map()
  broadcastRoom(room, 'game_state')
  scheduleGame(room, WORD_MEMORY_ANSWER_MS, () => lockWordMemoryAnswers(room))
  game.botTimers = activeWordMemoryPlayers(room)
    .map((playerId) => findPlayer(room, playerId)?.player)
    .filter((player) => player?.bot)
    .map((player) => setTimeout(() => {
      if (room.game?.id !== 'word_memory_challenge' || room.game.phase !== 'answering') return
      const answer = Math.random() < WORD_MEMORY_BOT_CORRECT_CHANCE
        ? game.question.answer
        : wordMemoryWrongAnswer(game.question.answer, game.question.type)
      submitWordMemoryAnswer(room, player.id, answer)
    }, 350 + Math.floor(Math.random() * 1_250)))
}

function maybeLockWordMemoryAnswers(room) {
  const activePlayers = activeWordMemoryPlayers(room)
  if (activePlayers.every((playerId) => room.game.answers.has(playerId))) lockWordMemoryAnswers(room)
}

function submitWordMemoryAnswer(room, clientId, value) {
  const game = room.game
  if (!game || game.id !== 'word_memory_challenge' || game.phase !== 'answering') return false
  if (!activeWordMemoryPlayers(room).includes(clientId) || game.answers.has(clientId)) return false
  const raw = String(value || '')
  if (raw && !/^[a-z]+$/i.test(raw)) return false
  game.answers.set(clientId, normalizeWordMemoryAnswer(raw))
  broadcastRoom(room, 'game_state')
  maybeLockWordMemoryAnswers(room)
  return true
}

function lockWordMemoryAnswers(room) {
  const game = room.game
  if (!game || game.id !== 'word_memory_challenge' || game.phase !== 'answering') return
  activeWordMemoryPlayers(room).forEach((playerId) => {
    if (!game.answers.has(playerId)) game.answers.set(playerId, '')
  })
  game.phase = 'answers_locked'
  game.phaseEndsAt = Date.now() + WORD_MEMORY_REVEAL_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, WORD_MEMORY_REVEAL_MS, () => revealWordMemoryAnswer(room))
}

function revealWordMemoryAnswer(room) {
  const game = room.game
  const survivors = activeWordMemoryPlayers(room)
  game.correctPlayerIds = survivors.filter((playerId) => game.answers.get(playerId) === game.question.answer)
  game.eliminatedIds.push(...survivors.filter((playerId) => !game.correctPlayerIds.includes(playerId)))
  game.phase = 'reveal'
  game.phaseEndsAt = Date.now() + WORD_MEMORY_REVEAL_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, WORD_MEMORY_REVEAL_MS, () => finishWordMemoryRound(room))
}

function finishWordMemoryRound(room) {
  const game = room.game
  game.phase = 'round_result'
  game.phaseEndsAt = Date.now() + WORD_MEMORY_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, WORD_MEMORY_RESULT_MS, () => {
    const remaining = activeWordMemoryPlayers(room)
    if (remaining.length <= 1 || game.round >= game.maxRounds) return completeWordMemoryGame(room, remaining)
    game.round += 1
    beginWordMemoryRound(room)
  })
}

function startWordMemoryGame(room) {
  const playerIds = tournamentGamePlayers(room)
  room.game = {
    id: 'word_memory_challenge',
    round: 1,
    maxRounds: maxRoundsForRoom(room, 'word_memory_challenge', 3),
    phase: 'round_intro',
    phaseEndsAt: null,
    words: [],
    wordIndex: 0,
    question: null,
    answers: new Map(),
    correctPlayerIds: [],
    eliminatedIds: [],
    winnerId: null,
    usedPhrases: [],
    timer: null,
    botTimers: [],
    playerIds,
  }
  broadcastRoom(room, 'game_started')
  beginWordMemoryRound(room)
}

function activeTypeItPlayers(room) {
  return room.game.playerIds.filter((playerId) =>
    !room.game.eliminatedIds.includes(playerId) && findPlayer(room, playerId),
  )
}

function typeItRoundLimitMs(room, round) {
  if (room.format === 'Ranking') return TYPE_IT_TIME_LIMITS_MS[2]
  return TYPE_IT_TIME_LIMITS_MS[Math.min(TYPE_IT_TIME_LIMITS_MS.length - 1, Math.max(0, round - 1))]
}

function chooseTypeItPhrase(game, room) {
  const roundKey = room.format === 'Ranking' ? 'round_3' : `round_${game.round}`
  const phrases = (DATASETS.type_it?.[roundKey] || []).map((phrase) => String(phrase || '')).filter(Boolean)
  const available = phrases.filter((phrase) => !game.usedPhrases.includes(phrase))
  const pool = available.length ? available : phrases
  if (!pool.length) return ''
  const phrase = pool[Math.floor(Math.random() * pool.length)]
  game.usedPhrases.push(phrase)
  return phrase
}

function typeItResult(phrase, typedText, finishedAt, startedAt) {
  const phraseWords = phrase.trim().split(/\s+/).filter(Boolean)
  const typedWords = typedText.trim().split(/\s+/).filter(Boolean)
  const correctWords = phraseWords.filter((word, index) => typedWords[index] === word).length
  const accuracy = phraseWords.length ? Number((correctWords / phraseWords.length * 100).toFixed(2)) : 0
  const speedMs = Math.max(0, Number(finishedAt || Date.now()) - Number(startedAt || Date.now()))
  return {
    finished: true,
    correctWords,
    accuracy,
    speedMs,
    speedSeconds: Number((speedMs / 1_000).toFixed(2)),
  }
}

function completeTypeItGame(room, survivors = activeTypeItPlayers(room)) {
  const game = room.game
  clearGameTimer(room)
  game.phase = 'complete'
  game.phaseEndsAt = null
  game.winnerId = survivors.length === 1 ? survivors[0] : null
  finalizeTournamentGame(room, game)
  broadcastRoom(room, 'game_state')
  scheduleNextGame(room)
}

function beginTypeItRound(room) {
  const game = room.game
  const players = activeTypeItPlayers(room)
  if (players.length <= 1) return completeTypeItGame(room, players)
  const phrase = chooseTypeItPhrase(game, room)
  if (!phrase) return completeTypeItGame(room, players)
  game.phrase = phrase
  game.roundLimitMs = typeItRoundLimitMs(room, game.round)
  game.inputs = new Map(players.map((playerId) => [playerId, '']))
  game.results = new Map()
  game.roundEliminatedIds = []
  game.roundStartedAt = null
  game.phase = 'preparing'
  game.phaseEndsAt = Date.now() + TYPE_IT_PREPARATION_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, TYPE_IT_PREPARATION_MS, () => beginTypeItTyping(room))
}

function typeItAllFinished(room) {
  return activeTypeItPlayers(room).every((playerId) => room.game.results.get(playerId)?.finished)
}

function scheduleTypeItBotStep(room, playerId) {
  const game = room.game
  const player = findPlayer(room, playerId)?.player
  if (!player?.bot || !game || game.id !== 'type_it' || game.phase !== 'typing' || game.results.get(playerId)?.finished) return
  const multiplier = game.botRateById.get(playerId) || 1
  const delay = Math.round((TYPE_IT_BOT_STEP_MIN_MS + Math.random() * (TYPE_IT_BOT_STEP_MAX_MS - TYPE_IT_BOT_STEP_MIN_MS)) * multiplier)
  const timer = setTimeout(() => {
    const current = room.game
    if (!current || current.id !== 'type_it' || current.phase !== 'typing' || current.results.get(playerId)?.finished) return
    const typed = current.inputs.get(playerId) || ''
    const needsCorrection = current.botCorrectionIds.has(playerId)
    let next = typed
    if (needsCorrection) {
      next = typed.slice(0, -1)
      current.botCorrectionIds.delete(playerId)
    } else {
      const expected = current.phrase[typed.length]
      const makeMistake = expected && expected !== ' ' && Math.random() < 0.055
      if (makeMistake) {
        const alternatives = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        let wrong = alternatives[Math.floor(Math.random() * alternatives.length)]
        if (wrong === expected) wrong = wrong === 'z' ? 'x' : 'z'
        next += wrong
        current.botCorrectionIds.add(playerId)
      } else {
        next += expected || ''
      }
    }
    updateTypeItInput(room, playerId, next, true)
    scheduleTypeItBotStep(room, playerId)
  }, delay)
  game.botTimers.push(timer)
}

function beginTypeItTyping(room) {
  const game = room.game
  if (!game || game.id !== 'type_it') return
  game.phase = 'typing'
  game.roundStartedAt = Date.now()
  game.phaseEndsAt = game.roundStartedAt + game.roundLimitMs
  broadcastRoom(room, 'game_state')
  scheduleGame(room, game.roundLimitMs, () => beginTypeItTimeoutFeedback(room))
  activeTypeItPlayers(room)
    .filter((playerId) => findPlayer(room, playerId)?.player.bot)
    .forEach((playerId) => scheduleTypeItBotStep(room, playerId))
}

function beginTypeItTimeoutFeedback(room) {
  const game = room.game
  if (!game || game.id !== 'type_it' || game.phase !== 'typing') return
  clearGameTimer(room)
  game.phase = 'time_expired'
  game.phaseEndsAt = Date.now() + TYPE_IT_TIMEOUT_FEEDBACK_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, TYPE_IT_TIMEOUT_FEEDBACK_MS, () => resolveTypeItRound(room))
}

function updateTypeItInput(room, clientId, value, allowBot = false) {
  const game = room.game
  if (!game || game.id !== 'type_it' || game.phase !== 'typing') return false
  const player = findPlayer(room, clientId)?.player
  if (!player || (player.bot && !allowBot) || !activeTypeItPlayers(room).includes(clientId) || game.results.get(clientId)?.finished) return false
  const next = String(value ?? '')
  const current = game.inputs.get(clientId) || ''
  if (next.length > game.phrase.length || /[\u0000-\u001f\u007f]/.test(next)) return false
  if (!(next.length <= current.length || next.length === current.length + 1)) return false
  game.inputs.set(clientId, next)
  if (next.length === game.phrase.length) {
    game.results.set(clientId, typeItResult(game.phrase, next, Date.now(), game.roundStartedAt))
  }
  broadcastRoom(room, 'game_state')
  if (typeItAllFinished(room)) resolveTypeItRound(room)
  return true
}

function resolveTypeItRound(room) {
  const game = room.game
  if (!game || game.id !== 'type_it' || !['typing', 'time_expired'].includes(game.phase)) return
  clearGameTimer(room)
  const players = activeTypeItPlayers(room)
  const incomplete = players.filter((playerId) => !game.results.get(playerId)?.finished)
  const belowAccuracy = players.filter((playerId) => {
    const result = game.results.get(playerId)
    return result?.finished && result.accuracy < TYPE_IT_MIN_ACCURACY
  })
  const automaticEliminations = [...new Set([...incomplete, ...belowAccuracy])]
  if (automaticEliminations.length) {
    game.roundEliminatedIds = automaticEliminations
  } else if (players.length) {
    const loser = [...players].sort((left, right) => {
      const leftResult = game.results.get(left)
      const rightResult = game.results.get(right)
      return leftResult.accuracy - rightResult.accuracy
        || rightResult.speedMs - leftResult.speedMs
        || left.localeCompare(right)
    })[0]
    game.roundEliminatedIds = [loser]
  }
  game.eliminatedIds.push(...game.roundEliminatedIds.filter((playerId) => !game.eliminatedIds.includes(playerId)))
  game.phase = 'round_result'
  game.phaseEndsAt = Date.now() + TYPE_IT_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, TYPE_IT_RESULT_MS, () => {
    const survivors = activeTypeItPlayers(room)
    if (survivors.length <= 1 || game.round >= game.maxRounds) return completeTypeItGame(room, survivors)
    game.round += 1
    beginTypeItRound(room)
  })
}

function startTypeItGame(room) {
  const playerIds = tournamentGamePlayers(room)
  room.game = {
    id: 'type_it',
    round: 1,
    maxRounds: maxRoundsForRoom(room, 'type_it', 3),
    phase: 'preparing',
    phaseEndsAt: null,
    roundLimitMs: TYPE_IT_TIME_LIMITS_MS[0],
    roundStartedAt: null,
    phrase: '',
    inputs: new Map(),
    results: new Map(),
    eliminatedIds: [],
    roundEliminatedIds: [],
    winnerId: null,
    usedPhrases: [],
    botCorrectionIds: new Set(),
    botRateById: new Map(playerIds.map((playerId) => [playerId, 0.78 + Math.random() * 0.36])),
    timer: null,
    botTimers: [],
    playerIds,
  }
  broadcastRoom(room, 'game_started')
  beginTypeItRound(room)
}

function activeAvoidSimilarPlayers(room) {
  return room.game.playerIds.filter((playerId) =>
    !room.game.eliminatedIds.includes(playerId) && findPlayer(room, playerId),
  )
}

function normalizeAvoidSimilarAnswer(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .toLowerCase()
}

function chooseAvoidSimilarPrompt(game) {
  const prompts = DATASETS.avoid_similar_answer || []
  const available = prompts.filter((prompt) => !game.usedRequests.includes(prompt.request))
  const pool = available.length ? available : prompts
  if (!pool.length) return null
  const prompt = pool[Math.floor(Math.random() * pool.length)]
  const answers = Array.isArray(prompt.answers) ? prompt.answers.filter(Boolean) : []
  if (!answers.length) return null
  game.usedRequests.push(prompt.request)
  return {
    request: String(prompt.request || ''),
    gameAnswer: String(answers[Math.floor(Math.random() * answers.length)]),
    possibleAnswers: answers.map(String),
  }
}

function completeAvoidSimilarGame(room, survivors = activeAvoidSimilarPlayers(room)) {
  const game = room.game
  clearGameTimer(room)
  game.phase = 'complete'
  game.phaseEndsAt = null
  game.winnerId = survivors.length === 1 ? survivors[0] : null
  finalizeTournamentGame(room, game)
  broadcastRoom(room, 'game_state')
  scheduleNextGame(room)
}

function beginAvoidSimilarRound(room) {
  const game = room.game
  const prompt = chooseAvoidSimilarPrompt(game)
  if (!prompt) return completeAvoidSimilarGame(room)
  game.request = prompt.request
  game.gameAnswer = prompt.gameAnswer
  game.possibleAnswers = prompt.possibleAnswers
  game.answers = new Map()
  game.votes = new Map()
  game.voteResults = []
  game.evaluationPlayerIds = []
  game.directEliminatedIds = []
  game.roundEliminatedIds = []
  game.phase = 'round_intro'
  game.phaseEndsAt = Date.now() + AVOID_SIMILAR_ROUND_INTRO_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, AVOID_SIMILAR_ROUND_INTRO_MS, () => beginAvoidSimilarAnswers(room))
}

function beginAvoidSimilarAnswers(room) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer') return
  game.phase = 'answering'
  game.phaseEndsAt = Date.now() + AVOID_SIMILAR_ANSWER_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, AVOID_SIMILAR_ANSWER_MS, () => lockAvoidSimilarAnswers(room))
  game.botTimers = activeAvoidSimilarPlayers(room)
    .map((playerId) => findPlayer(room, playerId)?.player)
    .filter((player) => player?.bot)
    .map((player) => setTimeout(() => {
      if (room.game?.id !== 'avoid_similar_answer' || room.game.phase !== 'answering') return
      const answer = game.possibleAnswers[Math.floor(Math.random() * game.possibleAnswers.length)] || ''
      submitAvoidSimilarAnswer(room, player.id, answer)
    }, 350 + Math.floor(Math.random() * 1_250)))
}

function maybeLockAvoidSimilarAnswers(room) {
  const activePlayers = activeAvoidSimilarPlayers(room)
  if (activePlayers.every((playerId) => room.game.answers.has(playerId))) lockAvoidSimilarAnswers(room)
}

function submitAvoidSimilarAnswer(room, clientId, value) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer' || game.phase !== 'answering') return false
  if (!activeAvoidSimilarPlayers(room).includes(clientId) || game.answers.has(clientId)) return false
  const raw = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '')
  if (raw.length > 80) return false
  game.answers.set(clientId, raw.trim())
  broadcastRoom(room, 'game_state')
  maybeLockAvoidSimilarAnswers(room)
  return true
}

function lockAvoidSimilarAnswers(room) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer' || game.phase !== 'answering') return
  activeAvoidSimilarPlayers(room).forEach((playerId) => {
    if (!game.answers.has(playerId)) game.answers.set(playerId, '')
  })
  game.phase = 'answers_locked'
  game.phaseEndsAt = Date.now() + AVOID_SIMILAR_LOCKED_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, AVOID_SIMILAR_LOCKED_MS, () => revealAvoidSimilarTarget(room))
}

function revealAvoidSimilarTarget(room) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer') return
  const targetAnswer = normalizeAvoidSimilarAnswer(game.gameAnswer)
  const directEliminated = activeAvoidSimilarPlayers(room).filter((playerId) => {
    const answer = normalizeAvoidSimilarAnswer(game.answers.get(playerId))
    return !answer || answer === targetAnswer
  })
  game.directEliminatedIds = directEliminated
  game.roundEliminatedIds = [...directEliminated]
  game.eliminatedIds.push(...directEliminated)
  game.phase = 'reveal_target'
  game.phaseEndsAt = Date.now() + AVOID_SIMILAR_TARGET_REVEAL_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, AVOID_SIMILAR_TARGET_REVEAL_MS, () => {
    const survivors = activeAvoidSimilarPlayers(room)
    if (survivors.length <= 1) return completeAvoidSimilarGame(room, survivors)
    beginAvoidSimilarEvaluation(room)
  })
}

function setAvoidSimilarVote(room, voterPlayerId, targetPlayerId, vote) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer' || game.phase !== 'evaluation') return false
  if (!['up', 'down', 'clear'].includes(vote)) return false
  const safePlayers = new Set(game.evaluationPlayerIds)
  if (!safePlayers.has(voterPlayerId) || !safePlayers.has(targetPlayerId) || voterPlayerId === targetPlayerId) return false
  const votes = game.votes.get(targetPlayerId) || new Map()
  if (vote === 'clear' || votes.get(voterPlayerId) === vote) votes.delete(voterPlayerId)
  else votes.set(voterPlayerId, vote)
  if (votes.size) game.votes.set(targetPlayerId, votes)
  else game.votes.delete(targetPlayerId)
  broadcastRoom(room, 'game_state')
  return true
}

function beginAvoidSimilarEvaluation(room) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer') return
  game.evaluationPlayerIds = activeAvoidSimilarPlayers(room)
  game.votes = new Map()
  game.voteResults = []
  game.phase = 'evaluation'
  game.phaseEndsAt = Date.now() + AVOID_SIMILAR_EVALUATION_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, AVOID_SIMILAR_EVALUATION_MS, () => resolveAvoidSimilarEvaluation(room))
  game.botTimers = game.evaluationPlayerIds
    .map((playerId) => findPlayer(room, playerId)?.player)
    .filter((player) => player?.bot)
    .flatMap((player) => game.evaluationPlayerIds
      .filter((targetPlayerId) => targetPlayerId !== player.id)
      .map((targetPlayerId, index) => setTimeout(() => {
        if (room.game?.id !== 'avoid_similar_answer' || room.game.phase !== 'evaluation') return
        setAvoidSimilarVote(room, player.id, targetPlayerId, Math.random() < 0.5 ? 'up' : 'down')
      }, 700 + index * 500 + Math.floor(Math.random() * 14_000))))
}

function resolveAvoidSimilarEvaluation(room) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer') return
  game.voteResults = game.evaluationPlayerIds.map((targetPlayerId) => {
    const votes = game.votes.get(targetPlayerId)
    let up = 0
    let down = 0
    votes?.forEach((vote) => {
      if (vote === 'up') up += 1
      if (vote === 'down') down += 1
    })
    return { targetPlayerId, up, down, eliminated: down > up }
  })
  const evaluationEliminated = game.voteResults
    .filter((result) => result.eliminated)
    .map((result) => result.targetPlayerId)
  game.roundEliminatedIds.push(...evaluationEliminated)
  game.eliminatedIds.push(...evaluationEliminated)
  game.phase = 'vote_results'
  game.phaseEndsAt = Date.now() + AVOID_SIMILAR_VOTE_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, AVOID_SIMILAR_VOTE_RESULT_MS, () => showAvoidSimilarRoundResult(room))
}

function showAvoidSimilarRoundResult(room) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer') return
  game.phase = 'round_result'
  game.phaseEndsAt = Date.now() + AVOID_SIMILAR_RESULT_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, AVOID_SIMILAR_RESULT_MS, () => {
    const survivors = activeAvoidSimilarPlayers(room)
    if (survivors.length <= 1 || game.round >= game.maxRounds) return completeAvoidSimilarGame(room, survivors)
    game.round += 1
    beginAvoidSimilarRound(room)
  })
}

function startAvoidSimilarGame(room) {
  const playerIds = tournamentGamePlayers(room)
  room.game = {
    id: 'avoid_similar_answer',
    round: 1,
    maxRounds: maxRoundsForRoom(room, 'avoid_similar_answer', 3),
    phase: 'round_intro',
    phaseEndsAt: null,
    request: '',
    gameAnswer: '',
    possibleAnswers: [],
    answers: new Map(),
    votes: new Map(),
    voteResults: [],
    evaluationPlayerIds: [],
    directEliminatedIds: [],
    roundEliminatedIds: [],
    eliminatedIds: [],
    usedRequests: [],
    winnerId: null,
    timer: null,
    botTimers: [],
    playerIds,
  }
  broadcastRoom(room, 'game_started')
  beginAvoidSimilarRound(room)
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
  game.shakeSequence += 1
  game.shakeSound = IMPOSTOR_COLOR_SHAKE_SOUNDS[Math.floor(Math.random() * IMPOSTOR_COLOR_SHAKE_SOUNDS.length)]
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
    shakeSequence: 0,
    shakeSound: null,
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

function activeFullWaterPlayers(room) {
  return room.game.playerIds.filter((playerId) =>
    !room.game.eliminatedIds.includes(playerId) && findPlayer(room, playerId),
  )
}

function nextFullWaterPlayer(room, currentPlayerId) {
  const activePlayers = activeFullWaterPlayers(room)
  if (!activePlayers.length) return null
  const currentIndex = room.game.playerIds.indexOf(currentPlayerId)
  for (let offset = 1; offset <= room.game.playerIds.length; offset += 1) {
    const candidate = room.game.playerIds[(currentIndex + offset) % room.game.playerIds.length]
    if (activePlayers.includes(candidate)) return candidate
  }
  return activePlayers[0]
}

function fullWaterCapacityForPlayers(room, playerCount) {
  const configuredValue = gameDefinition(room, 'full_water')?.max_container_limit_per_active_players?.[String(playerCount)]
  const capacity = Number.parseFloat(configuredValue)
  return Number.isFinite(capacity) && capacity > 0 ? capacity : Math.max(20, playerCount * 10)
}

function completeFullWaterGame(room, survivors = activeFullWaterPlayers(room)) {
  const game = room.game
  if (!game || game.id !== 'full_water') return
  clearGameTimer(room)
  game.phase = 'complete'
  game.phaseEndsAt = null
  game.currentPlayerId = null
  game.pourStartedAt = null
  game.winnerId = survivors.length === 1 ? survivors[0] : null
  finalizeTournamentGame(room, game)
  broadcastRoom(room, 'game_state')
  scheduleNextGame(room)
}

function setFullWaterTurn(room) {
  const game = room.game
  if (!game || game.id !== 'full_water') return
  const activePlayers = activeFullWaterPlayers(room)
  if (activePlayers.length <= 1) return completeFullWaterGame(room, activePlayers)
  if (!game.currentPlayerId || !activePlayers.includes(game.currentPlayerId)) game.currentPlayerId = activePlayers[0]
  game.phase = 'waiting_to_pour'
  game.phaseEndsAt = Date.now() + FULL_WATER_TURN_START_MS
  game.pourStartedAt = null
  game.pourStartWaterMl = game.waterMl
  game.pouredMl = 0
  game.turnPouredMl = 0
  game.hasPoured = false
  game.eliminatedPlayerId = null
  broadcastRoom(room, 'game_state')
  scheduleGame(room, FULL_WATER_TURN_START_MS, () => handleFullWaterTurnTimeout(room))

  const player = findPlayer(room, game.currentPlayerId)?.player
  if (player?.bot) {
    const botTimer = setTimeout(() => {
      if (room.game !== game || game.phase !== 'waiting_to_pour') return
      if (!startFullWaterPour(room, player.id)) return
      const pourMl = Number((0.5 + Math.random() * (FULL_WATER_MAX_POUR_ML - 0.5)).toFixed(2))
      const stopTimer = setTimeout(() => {
        if (!stopFullWaterPour(room, player.id)) return
        const finishTimer = setTimeout(() => finishFullWaterTurn(room, player.id), 350)
        game.botTimers.push(finishTimer)
      }, pourMl * 1_000)
      game.botTimers.push(stopTimer)
    }, FULL_WATER_BOT_START_MIN_MS + Math.random() * (FULL_WATER_BOT_START_MAX_MS - FULL_WATER_BOT_START_MIN_MS))
    game.botTimers.push(botTimer)
  }
}

function beginFullWaterRound(room) {
  const game = room.game
  if (!game || game.id !== 'full_water') return
  const activePlayers = activeFullWaterPlayers(room)
  if (activePlayers.length <= 1) return completeFullWaterGame(room, activePlayers)
  game.waterMl = 0
  game.pouredMl = 0
  game.pourStartedAt = null
  game.pourStartWaterMl = 0
  game.turnPouredMl = 0
  game.hasPoured = false
  game.eliminatedPlayerId = null
  game.currentPlayerId = activePlayers[0]
  game.phase = 'round_intro'
  game.phaseEndsAt = Date.now() + FULL_WATER_ROUND_INTRO_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, FULL_WATER_ROUND_INTRO_MS, () => setFullWaterTurn(room))
}

function finishFullWaterRound(room) {
  const game = room.game
  if (!game || game.id !== 'full_water') return
  const activePlayers = activeFullWaterPlayers(room)
  if (game.round >= game.maxRounds || activePlayers.length <= 1) return completeFullWaterGame(room, activePlayers)
  game.round += 1
  beginFullWaterRound(room)
}

function handleFullWaterTurnTimeout(room) {
  const game = room.game
  if (!game || game.id !== 'full_water' || game.phase !== 'waiting_to_pour') return
  const playerId = game.currentPlayerId
  const warnings = (game.warningCounts.get(playerId) || 0) + 1
  game.warningCounts.set(playerId, warnings)
  if (warnings === 1) {
    game.phase = 'warning'
    game.phaseEndsAt = Date.now() + FULL_WATER_WARNING_MS
    broadcastRoom(room, 'game_state')
    scheduleGame(room, FULL_WATER_WARNING_MS, () => {
      game.currentPlayerId = nextFullWaterPlayer(room, playerId)
      setFullWaterTurn(room)
    })
    return
  }
  game.eliminatedIds.push(playerId)
  game.afkEliminatedIds.push(playerId)
  game.eliminatedPlayerId = playerId
  game.phase = 'afk_eliminated'
  game.phaseEndsAt = Date.now() + FULL_WATER_WARNING_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, FULL_WATER_WARNING_MS, () => finishFullWaterRound(room))
}

function settleFullWaterTurn(room, overflowed) {
  const game = room.game
  game.phase = overflowed ? 'overflowing' : 'settling'
  game.phaseEndsAt = Date.now() + FULL_WATER_SETTLE_MS
  broadcastRoom(room, 'game_state')
  scheduleGame(room, FULL_WATER_SETTLE_MS, () => {
    if (overflowed) return finishFullWaterRound(room)
    game.currentPlayerId = nextFullWaterPlayer(room, game.currentPlayerId)
    setFullWaterTurn(room)
  })
}

function startFullWaterPour(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'full_water' || !['waiting_to_pour', 'ready_to_finish'].includes(game.phase) || game.currentPlayerId !== clientId) return false
  if (game.turnPouredMl >= FULL_WATER_MAX_POUR_ML) return false
  game.phase = 'pouring'
  game.pourStartedAt = Date.now()
  game.pourStartWaterMl = game.waterMl
  game.pouredMl = 0
  const remainingMl = FULL_WATER_MAX_POUR_ML - game.turnPouredMl
  game.phaseEndsAt = game.pourStartedAt + remainingMl * 1_000
  broadcastRoom(room, 'game_state')
  scheduleGame(room, remainingMl * 1_000, () => stopFullWaterPour(room, clientId, true))
  return true
}

function stopFullWaterPour(room, clientId, autoStopped = false) {
  const game = room.game
  if (!game || game.id !== 'full_water' || game.phase !== 'pouring' || game.currentPlayerId !== clientId) return false
  const remainingMl = FULL_WATER_MAX_POUR_ML - game.turnPouredMl
  const elapsedMl = Math.max(FULL_WATER_MIN_POUR_ML, (Date.now() - game.pourStartedAt) / 1_000 * FULL_WATER_ML_PER_SECOND)
  const pouredMl = Number((autoStopped ? remainingMl : Math.min(remainingMl, elapsedMl)).toFixed(2))
  game.pouredMl = pouredMl
  game.turnPouredMl = Number((game.turnPouredMl + pouredMl).toFixed(2))
  game.hasPoured = true
  game.waterMl = Number((game.pourStartWaterMl + pouredMl).toFixed(2))
  game.pourStartedAt = null
  const overflowed = game.waterMl > game.capacityMl
  if (overflowed) {
    game.eliminatedIds.push(clientId)
    game.eliminatedPlayerId = clientId
    settleFullWaterTurn(room, true)
    return true
  }
  if (game.turnPouredMl >= FULL_WATER_MAX_POUR_ML) {
    settleFullWaterTurn(room, false)
    return true
  }
  game.phase = 'ready_to_finish'
  game.phaseEndsAt = null
  broadcastRoom(room, 'game_state')
  return true
}

function finishFullWaterTurn(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'full_water' || game.phase !== 'ready_to_finish' || game.currentPlayerId !== clientId || !game.hasPoured) return false
  settleFullWaterTurn(room, false)
  return true
}

function startFullWaterGame(room) {
  const playerIds = tournamentGamePlayers(room)
  room.game = {
    id: 'full_water',
    round: 1,
    maxRounds: maxRoundsForRoom(room, 'full_water', 1),
    phase: 'round_intro',
    phaseEndsAt: null,
    playerIds,
    currentPlayerId: playerIds[0] || null,
    capacityMl: fullWaterCapacityForPlayers(room, playerIds.length),
    waterMl: 0,
    pourStartedAt: null,
    pourStartWaterMl: 0,
    pouredMl: 0,
    turnPouredMl: 0,
    hasPoured: false,
    eliminatedIds: [],
    afkEliminatedIds: [],
    eliminatedPlayerId: null,
    winnerId: null,
    warningCounts: new Map(),
    timer: null,
    botTimers: [],
  }
  broadcastRoom(room, 'game_started')
  beginFullWaterRound(room)
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

function removeWordMemoryPlayer(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'word_memory_challenge') return removePlayer(room, clientId)
  if (!removePlayer(room, clientId)) return false

  game.playerIds = game.playerIds.filter((playerId) => playerId !== clientId)
  game.eliminatedIds = game.eliminatedIds.filter((playerId) => playerId !== clientId)
  game.correctPlayerIds = game.correctPlayerIds.filter((playerId) => playerId !== clientId)
  game.answers.delete(clientId)
  const survivors = activeWordMemoryPlayers(room)
  if (game.phase === 'complete' || survivors.length <= 1) {
    completeWordMemoryGame(room, survivors)
    return true
  }
  if (game.phase === 'answering') maybeLockWordMemoryAnswers(room)
  else broadcastRoom(room, 'game_state')
  return true
}

function removeAvoidSimilarPlayer(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'avoid_similar_answer') return removePlayer(room, clientId)
  if (!removePlayer(room, clientId)) return false

  game.playerIds = game.playerIds.filter((playerId) => playerId !== clientId)
  game.eliminatedIds = game.eliminatedIds.filter((playerId) => playerId !== clientId)
  game.directEliminatedIds = game.directEliminatedIds.filter((playerId) => playerId !== clientId)
  game.roundEliminatedIds = game.roundEliminatedIds.filter((playerId) => playerId !== clientId)
  game.evaluationPlayerIds = game.evaluationPlayerIds.filter((playerId) => playerId !== clientId)
  game.answers.delete(clientId)
  game.votes.delete(clientId)
  game.votes.forEach((votes) => votes.delete(clientId))

  const survivors = activeAvoidSimilarPlayers(room)
  if (game.phase === 'complete' || survivors.length <= 2) {
    completeAvoidSimilarGame(room, survivors)
    return true
  }
  if (game.phase === 'answering') maybeLockAvoidSimilarAnswers(room)
  else broadcastRoom(room, 'game_state')
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

function removeFullWaterPlayer(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'full_water') return removePlayer(room, clientId)
  if (!removePlayer(room, clientId)) return false

  const wasCurrentPlayer = game.currentPlayerId === clientId
  game.playerIds = game.playerIds.filter((playerId) => playerId !== clientId)
  game.eliminatedIds = game.eliminatedIds.filter((playerId) => playerId !== clientId)
  game.afkEliminatedIds = game.afkEliminatedIds.filter((playerId) => playerId !== clientId)
  if (game.eliminatedPlayerId === clientId) game.eliminatedPlayerId = null

  const survivors = activeFullWaterPlayers(room)
  if (game.phase === 'complete' || survivors.length <= 1) {
    completeFullWaterGame(room, survivors)
    return true
  }
  if (wasCurrentPlayer) {
    clearGameTimer(room)
    game.currentPlayerId = survivors[0]
    game.pourStartedAt = null
    game.pouredMl = 0
    setFullWaterTurn(room)
    return true
  }
  broadcastRoom(room, 'game_state')
  return true
}

function removeTypeItPlayer(room, clientId) {
  const game = room.game
  if (!game || game.id !== 'type_it') return removePlayer(room, clientId)
  if (!removePlayer(room, clientId)) return false
  game.playerIds = game.playerIds.filter((playerId) => playerId !== clientId)
  game.eliminatedIds = game.eliminatedIds.filter((playerId) => playerId !== clientId)
  game.roundEliminatedIds = game.roundEliminatedIds.filter((playerId) => playerId !== clientId)
  game.inputs.delete(clientId)
  game.results.delete(clientId)
  game.botCorrectionIds.delete(clientId)
  game.botRateById.delete(clientId)
  const survivors = activeTypeItPlayers(room)
  if (game.phase === 'complete' || survivors.length <= 1) {
    completeTypeItGame(room, survivors)
    return true
  }
  if (game.phase === 'typing' && typeItAllFinished(room)) resolveTypeItRound(room)
  else broadcastRoom(room, 'game_state')
  return true
}

function removeGamePlayer(room, clientId) {
  if (room.game?.id === 'monster_escape_office') return removeMonsterEscapePlayer(room, clientId)
  if (room.game?.id === 'reaction_time') return removeReactionPlayer(room, clientId)
  if (room.game?.id === 'guess_the_time') return removeGuessTimePlayer(room, clientId)
  if (room.game?.id === 'word_memory_challenge') return removeWordMemoryPlayer(room, clientId)
  if (room.game?.id === 'avoid_similar_answer') return removeAvoidSimilarPlayer(room, clientId)
  if (room.game?.id === 'impostor_color') return removeImpostorColorPlayer(room, clientId)
  if (room.game?.id === 'full_water') return removeFullWaterPlayer(room, clientId)
  if (room.game?.id === 'type_it') return removeTypeItPlayer(room, clientId)
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
    scheduledGameCount: 0,
    overtimeGameCount: 0,
    overtimePending: false,
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
        || (message.mode !== 'For Fun' && message.mode !== 'Team' && !MAX_GAMES.has(requestedMaxGames))) {
        return reject(socket, 'Unsupported room settings.')
      }
      room.mode = message.mode
      room.format = message.format
      if (room.mode === 'For Fun') {
        if (MAX_GAMES.has(requestedMaxGames)) room.lastStandardMaxGames = requestedMaxGames
        room.maxGames = 1
      } else if (room.mode === 'Team') {
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
    if (message.type === 'monster_escape_input') {
      if (room.game?.id !== 'monster_escape_office' || !monsterEscapeSetInput(room, clientId, Number(message.direction), message.running)) {
        return reject(socket, 'You cannot move right now.')
      }
      return
    }
    if (message.type === 'monster_escape_interact') {
      if (room.game?.id !== 'monster_escape_office' || !monsterEscapeInteract(room, clientId, Number(message.direction || 0))) {
        return reject(socket, 'There is nothing available to interact with right now.')
      }
      return
    }
    if (message.type === 'monster_escape_select_floor') {
      const player = monsterEscapePlayer(room, clientId)
      if (!player?.awaitingTransit || !monsterEscapeStartTransit(room, player, Number(message.floor))) {
        return reject(socket, 'Choose a connected destination floor.')
      }
      return
    }
    if (message.type === 'monster_escape_equip') {
      const player = monsterEscapePlayer(room, clientId)
      const slot = Number(message.slot)
      if (!player || player.role !== 'human' || !Number.isInteger(slot) || slot < 0 || slot >= player.inventory.length) {
        return reject(socket, 'Choose an occupied inventory slot.')
      }
      player.equippedSlot = slot
      return broadcastRoom(room, 'game_state')
    }
    if (message.type === 'monster_escape_use_item') {
      const player = monsterEscapePlayer(room, clientId)
      if (!monsterEscapeUseItem(room, player, String(message.targetId || ''))) {
        return reject(socket, 'That item cannot be used right now.')
      }
      return
    }
    if (message.type === 'monster_escape_close_item_reveal') {
      const player = monsterEscapePlayer(room, clientId)
      if (!player || !player.itemRevealUntil) return reject(socket, 'There is no item reveal to close.')
      player.itemRevealUntil = 0
      return broadcastRoom(room, 'game_state')
    }
    if (message.type === 'guess_time_submit') {
      if (room.game?.id !== 'guess_the_time') return reject(socket, 'Guess The Time is not active.')
      if (!submitTimeGuess(room, clientId, message.guess)) {
        return reject(socket, 'Enter one positive time from 0.01 to 10.99 with up to two decimal places.')
      }
      return
    }
    if (message.type === 'word_memory_submit') {
      if (room.game?.id !== 'word_memory_challenge') return reject(socket, 'Word Memory Challenge is not active.')
      if (!submitWordMemoryAnswer(room, clientId, message.answer)) {
        return reject(socket, 'Enter letters only, then lock your answer.')
      }
      return
    }
    if (message.type === 'type_it_input') {
      if (room.game?.id !== 'type_it') return reject(socket, 'Type It is not active.')
      if (!updateTypeItInput(room, clientId, message.value)) {
        return reject(socket, 'Type one character at a time, including spaces, while the round is active.')
      }
      return
    }
    if (message.type === 'avoid_similar_submit') {
      if (room.game?.id !== 'avoid_similar_answer') return reject(socket, 'Avoid Similar Answer is not active.')
      if (!submitAvoidSimilarAnswer(room, clientId, message.answer)) {
        return reject(socket, 'Enter an answer up to 80 characters, then lock it.')
      }
      return
    }
    if (message.type === 'avoid_similar_vote') {
      if (room.game?.id !== 'avoid_similar_answer') return reject(socket, 'Avoid Similar Answer is not active.')
      if (!setAvoidSimilarVote(room, clientId, String(message.targetPlayerId || ''), message.vote)) {
        return reject(socket, 'Vote for another safe player during the evaluation phase.')
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
    if (message.type === 'full_water_pour_start') {
      if (room.game?.id !== 'full_water') return reject(socket, 'Full Water is not active.')
      if (!startFullWaterPour(room, clientId)) return reject(socket, 'Wait for your turn, then start pouring.')
      return
    }
    if (message.type === 'full_water_pour_stop') {
      if (room.game?.id !== 'full_water') return reject(socket, 'Full Water is not active.')
      if (!stopFullWaterPour(room, clientId)) return reject(socket, 'You are not currently pouring.')
      return
    }
    if (message.type === 'full_water_finish_turn') {
      if (room.game?.id !== 'full_water') return reject(socket, 'Full Water is not active.')
      if (!finishFullWaterTurn(room, clientId)) return reject(socket, 'Pour water first, then finish your turn while paused.')
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
        if (players.length < 3 || !room.slots.one.some(Boolean) || !room.slots.two.some(Boolean)) {
          return reject(socket, 'Monster Escape needs at least three players and one player on each team.')
        }
      } else if (players.length < 2) {
        return reject(socket, 'At least two players are needed to start.')
      }
      const playableGameIds = playableGameIdsForMode(room.mode)
      if (!playableGameIds.size) {
        return reject(socket, `No playable games are available for ${room.mode} yet.`)
      }
      room.gameQueue = room.mode === 'Team'
        ? ['monster_escape_office']
        : room.manualGames
        ? room.selectedGames.filter((gameId) => playableGameIds.has(gameId))
        : randomGameQueue(room.mode, room.maxGames)
      if (!room.gameQueue.length) room.gameQueue = randomGameQueue(room.mode, room.maxGames)
      room.gameIndex = 0
      room.scheduledGameCount = room.gameQueue.length
      room.overtimeGameCount = 0
      room.overtimePending = false
      if (room.mode === 'Team') room.tournament = null
      else createTournament(room)
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

setInterval(() => {
  for (const room of rooms.values()) monsterEscapeTick(room)
}, MONSTER_ESCAPE_TICK_MS)

console.log(`Let's Play WebSocket server listening on ws://0.0.0.0:${PORT}`)
