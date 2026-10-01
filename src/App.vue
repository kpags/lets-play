<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import freeForAllCatalog from '../data/games/free_for_all.json'
import forFunCatalog from '../data/games/for_fun.json'
import teamCatalog from '../data/games/team.json'

const currentView = ref('landing')
const sfxVolume = ref(75)
const musicVolume = ref(65)
const onlineStatus = ref('offline')
const onlineError = ref('')
const onlineRoom = ref(null)
const reactionGame = ref(null)
const reactionClickSubmitted = ref(false)
const fullWaterPourHeld = ref(false)
const fullWaterBottleReturning = ref(false)
const guessInput = ref('')
const wordMemoryInput = ref('')
const avoidSimilarInput = ref('')
const typeItInput = ref('')
const typeItInputRef = ref(null)
const typeItInputHydrated = ref(false)
const reactionClockNow = ref(Date.now())
const reactionServerClockOffset = ref(0)
const showReactionMenu = ref(false)
const settingsReturnView = ref('landing')
const manualGames = ref(false)
const selectedGames = ref([])
const showGameChooser = ref(false)
const gameSelectionBeforeChoosing = ref([])
const showInviteDialog = ref(false)
const inviteCodeEntry = ref('')
const inviteDialogError = ref('')
const joiningFromInviteDialog = ref(false)
const inviteCode = ref(createInviteCode())
const copyLabel = ref('Copy')
const roomMode = ref('Free For All')
const roomFormat = ref('Elimination')
const maxGames = ref('5')
const lastStandardMaxGames = ref('5')
const teamOne = ref([{ id: 'host', name: 'Host', ready: false }, null, null, null, null])
const teamTwo = ref([null, null, null, null, null])
const clientId = localStorage.getItem('lets-play-client-id') || createClientId()
const playerName = ref(localStorage.getItem('lets-play-player-name') || 'Host')
let roomSocket = null
let reconnectTimer = null
let reconnectAttempts = 0
let shuttingDown = false
let reactionClockTimer = null
let fullWaterBottleReturnTimer = null
const menuItems = [
  { label: 'Play', action: () => createOnlineRoom() },
  { label: 'Invite Code', action: () => openInviteDialog() },
  { label: 'Settings', action: () => (currentView.value = 'settings') },
]
const gameCatalogs = {
  Team: teamCatalog,
  'Free For All': freeForAllCatalog,
  'For Fun': forFunCatalog,
}
const playableGameIds = new Set(['reaction_time', 'guess_the_time', 'impostor_color', 'word_memory_challenge', 'avoid_similar_answer', 'full_water', 'type_it'])

const playerCount = computed(
  () => teamOne.value.filter(Boolean).length + teamTwo.value.filter(Boolean).length,
)
const isTeamMode = computed(() => roomMode.value === 'Team')
const isRoomHost = computed(() => onlineRoom.value?.hostId === clientId)
const roomIsLobby = computed(() => onlineRoom.value?.phase === 'lobby')
const nonBotPlayersReady = computed(() =>
  [...teamOne.value, ...teamTwo.value]
    .filter((player) => player && !player.bot)
    .every((player) => player.ready),
)
const canStartGame = computed(() => {
  if (!isRoomHost.value || !roomIsLobby.value || !nonBotPlayersReady.value) return false
  if (!gameCatalog.value.some((game) => playableGameIds.has(game.id))) return false
  if (isTeamMode.value) return teamOne.value.some(Boolean) && teamTwo.value.some(Boolean)
  return playerCount.value >= 2
})
const gameCatalog = computed(() => gameCatalogs[roomMode.value] || [])
const selectedGameCount = computed(() => selectedGames.value.length)
const gameChooserIsReadOnly = computed(() => !isRoomHost.value || !roomIsLobby.value)
const isRankingFormat = computed(() => onlineRoom.value?.tournament?.format === 'Ranking')
const tournamentPoints = (playerId) => onlineRoom.value?.tournament?.standings
  ?.find((player) => player.playerId === playerId)?.points ?? 0
const gameInstructions = computed(() => onlineRoom.value?.phase === 'instructions' ? onlineRoom.value.instructions : null)
const instructionCountdown = computed(() => {
  if (!gameInstructions.value?.endsAt) return 0
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, Math.ceil((gameInstructions.value.endsAt - serverNow) / 1000))
})
const instructionsClosedByMe = computed(() =>
  gameInstructions.value?.acknowledgedPlayerIds?.includes(clientId) ?? false,
)
const gameIntermission = computed(() => onlineRoom.value?.phase === 'intermission' ? onlineRoom.value.intermission : null)
const overtimeState = computed(() => onlineRoom.value?.overtime || { active: false, pending: false, count: 0 })
const isOvertimeGame = computed(() => Boolean(overtimeState.value.active))
const overtimeLabel = computed(() => `Overtime ${overtimeState.value.count}`)
const intermissionCountdown = computed(() => {
  if (!gameIntermission.value?.endsAt) return 0
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, Math.ceil((gameIntermission.value.endsAt - serverNow) / 1000))
})
const intermissionSkippedByMe = computed(() =>
  gameIntermission.value?.acknowledgedPlayerIds?.includes(clientId) ?? false,
)
const isTournamentSpectator = computed(() =>
  onlineRoom.value?.tournament?.format === 'Elimination'
  && onlineRoom.value.tournament.eliminatedIds.includes(clientId),
)
const showTournamentPodium = computed(() =>
  Boolean(onlineRoom.value?.tournament?.complete && !gameInstructions.value && !gameIntermission.value),
)
const podiumElapsed = computed(() => {
  if (!onlineRoom.value?.tournament?.completedAt) return 0
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, serverNow - onlineRoom.value.tournament.completedAt)
})
const noEliminationWinner = computed(() =>
  onlineRoom.value?.tournament?.format === 'Elimination'
  && onlineRoom.value.tournament.complete
  && !onlineRoom.value.tournament.winnerId,
)
const rankingPodiumGroups = computed(() => {
  const standings = onlineRoom.value?.tournament?.standings || []
  return [
    { title: 'Winners Podium', players: standings.slice(0, 3) },
    { title: 'Almost Winners Podium', players: standings.slice(3, 5) },
    { title: 'NT Podium', players: standings.slice(5, 8) },
    { title: 'ROFL Podium', players: standings.slice(8, 10) },
  ]
})
const rankingPodiumStage = computed(() => Math.min(4, Math.floor(podiumElapsed.value / 1_500) + 1))
const podiumExitAvailable = computed(() => {
  if (onlineRoom.value?.tournament?.format === 'Ranking') return rankingPodiumStage.value >= 4
  return podiumElapsed.value >= 1_500
})
const reactionPreparationCountdown = computed(() => {
  if (reactionGame.value?.phase !== 'preparing' || !reactionGame.value.phaseEndsAt) return null
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.min(3, Math.max(0, Math.ceil((reactionGame.value.phaseEndsAt - serverNow) / 1000)))
})
const reactionTargetStyle = computed(() => {
  const target = reactionGame.value?.target || { x: 50, y: 50 }
  const size = reactionGame.value?.round === 1 ? 'clamp(9rem, 22vmin, 13rem)' : 'clamp(5.75rem, 14vmin, 7.5rem)'
  return { left: `${target.x}%`, top: `${target.y}%`, '--reaction-size': size }
})
const reactionTargetVisible = computed(() => {
  if (reactionGame.value?.phase !== 'target') return false
  return reactionGame.value.activePlayerId !== clientId || !reactionClickSubmitted.value
})
const reactionTargetInteractive = computed(() =>
  reactionGame.value?.phase === 'target' && reactionGame.value.activePlayerId === clientId && !isTournamentSpectator.value && !showReactionMenu.value,
)
const reactionResultVisible = computed(() => reactionGame.value?.phase === 'result')
const guessTimeGame = computed(() => reactionGame.value?.id === 'guess_the_time' ? reactionGame.value : null)
const wordMemoryGame = computed(() => reactionGame.value?.id === 'word_memory_challenge' ? reactionGame.value : null)
const avoidSimilarGame = computed(() => reactionGame.value?.id === 'avoid_similar_answer' ? reactionGame.value : null)
const impostorColorGame = computed(() => reactionGame.value?.id === 'impostor_color' ? reactionGame.value : null)
const fullWaterGame = computed(() => reactionGame.value?.id === 'full_water' ? reactionGame.value : null)
const typeItGame = computed(() => reactionGame.value?.id === 'type_it' ? reactionGame.value : null)
const typeItCountdown = computed(() => {
  if (!typeItGame.value?.phaseEndsAt) return null
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, Math.ceil((typeItGame.value.phaseEndsAt - serverNow) / 1_000))
})
const typeItCanType = computed(() =>
  typeItGame.value?.phase === 'typing'
  && !typeItGame.value.eliminatedIds.includes(clientId)
  && !isTournamentSpectator.value
  && !showReactionMenu.value
  && !typeItGame.value.players.find((player) => player.playerId === clientId)?.finished,
)
const typeItRows = computed(() => {
  const phrase = typeItGame.value?.phrase || ''
  let offset = 0
  const words = phrase.split(' ').map((word, index) => {
    const item = { word, start: offset, key: `${offset}-${word}` }
    offset += word.length + (index < phrase.split(' ').length - 1 ? 1 : 0)
    return item
  })
  return Array.from({ length: Math.ceil(words.length / 5) }, (_, index) => words.slice(index * 5, index * 5 + 5))
})
const typeItClockStyle = computed(() => {
  const game = typeItGame.value
  const limit = Math.max(1, Number(game?.phase === 'preparing' ? 5_000 : game?.roundLimitMs || 1))
  const remaining = Math.max(0, Number(typeItCountdown.value || 0) * 1_000)
  const progress = Math.min(1, Math.max(0, 1 - remaining / limit))
  return { '--type-it-second-angle': `${progress * 360}deg`, '--type-it-minute-angle': `${progress * 30}deg` }
})
const typeItStatus = computed(() => {
  const game = typeItGame.value
  if (!game) return ''
  if (game.phase === 'preparing') return `Round ${game.round} starts in ${typeItCountdown.value}.`
  if (game.phase === 'typing') return typeItGame.value.players.find((player) => player.playerId === clientId)?.finished ? 'Finished — waiting for the others.' : 'Type the phrase exactly.'
  if (game.phase === 'round_result') return 'Round results'
  if (game.phase === 'complete') return game.winnerName ? `${game.winnerName} wins!` : 'Type It complete!'
  return ''
})
function typeItCharacterState(index) {
  const phrase = typeItGame.value?.phrase || ''
  if (index >= typeItInput.value.length) return 'pending'
  return typeItInput.value[index] === phrase[index] ? 'correct' : 'incorrect'
}
const fullWaterBottleVisible = computed(() => {
  const phase = fullWaterGame.value?.phase
  return fullWaterBottleReturning.value || ['pouring', 'ready_to_finish'].includes(phase)
})
const fullWaterCountdown = computed(() => {
  if (!fullWaterGame.value?.phaseEndsAt) return null
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, Math.ceil((fullWaterGame.value.phaseEndsAt - serverNow) / 1000))
})
const canStartFullWaterPour = computed(() =>
  ['waiting_to_pour', 'ready_to_finish'].includes(fullWaterGame.value?.phase)
  && fullWaterGame.value.currentPlayerId === clientId
  && Number(fullWaterGame.value.turnPouredMl || 0) < 5
  && !isTournamentSpectator.value
  && !showReactionMenu.value,
)
const canStopFullWaterPour = computed(() =>
  fullWaterGame.value?.phase === 'pouring'
  && fullWaterGame.value.currentPlayerId === clientId
  && !isTournamentSpectator.value,
)
const canFinishFullWaterTurn = computed(() =>
  fullWaterGame.value?.phase === 'ready_to_finish'
  && fullWaterGame.value.currentPlayerId === clientId
  && Boolean(fullWaterGame.value.hasPoured)
  && !isTournamentSpectator.value
  && !showReactionMenu.value,
)
const canControlFullWaterPour = computed(() => canStartFullWaterPour.value || (canStopFullWaterPour.value && fullWaterPourHeld.value))
const fullWaterDisplayedMl = computed(() => {
  const game = fullWaterGame.value
  if (!game) return 0
  if (game.phase !== 'pouring' || !game.pourStartedAt) return Number(game.waterMl || 0)
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  const remainingMl = Math.max(0, 5 - Number(game.turnPouredMl || 0))
  const pouredMl = Math.min(remainingMl, Math.max(0, (serverNow - game.pourStartedAt) / 1_000))
  return Number((Number(game.pourStartWaterMl || 0) + pouredMl).toFixed(2))
})
const fullWaterFillStyle = computed(() => {
  const capacity = Number(fullWaterGame.value?.capacityMl || 1)
  const percentage = Math.min(116, Math.max(0, fullWaterDisplayedMl.value / capacity * 100))
  return { height: `${percentage}%` }
})
const fullWaterIsNearOverflow = computed(() => {
  const game = fullWaterGame.value
  const capacity = Number(game?.capacityMl || 0)
  const water = fullWaterDisplayedMl.value
  return capacity > 0
    && game?.phase !== 'overflowing'
    && water >= Math.max(0, capacity - 2)
    && water <= capacity
})
const fullWaterStatus = computed(() => {
  const game = fullWaterGame.value
  if (!game) return ''
  if (game.phase === 'round_intro') return `Round ${game.round} starts in ${fullWaterCountdown.value}.`
  if (game.phase === 'waiting_to_pour' && game.currentPlayerId === clientId) return `Hold Pour to add water · ${fullWaterCountdown.value}s`
  if (game.phase === 'ready_to_finish') return ''
  if (game.phase === 'settling') return `${game.currentPlayerName || 'Player'}'s turn ends`
  if (game.phase === 'overflowing') return 'Overflow!'
  if (game.phase === 'afk_eliminated') return `${game.eliminatedPlayerName} was eliminated due to AFK.`
  if (game.phase === 'complete') return game.winnerName ? `${game.winnerName} wins!` : 'Full Water complete!'
  return ''
})
const impostorSelectedBottle = computed(() => {
  const index = impostorColorGame.value?.selectedBottleIndex
  return Number.isInteger(index) ? impostorColorGame.value?.bottles?.[index] : null
})
const canPickImpostorBottle = computed(() =>
  impostorColorGame.value?.phase === 'picking'
  && impostorColorGame.value.currentPlayerId === clientId
  && !isTournamentSpectator.value
  && !showReactionMenu.value,
)
const impostorPickCountdown = computed(() => {
  if (impostorColorGame.value?.phase !== 'picking' || !impostorColorGame.value.phaseEndsAt) return null
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, Math.ceil((impostorColorGame.value.phaseEndsAt - serverNow) / 1000))
})
const guessInputLocked = computed(() => guessTimeGame.value?.guessedPlayerIds?.includes(clientId))
const wordMemoryInputLocked = computed(() => wordMemoryGame.value?.answeredPlayerIds?.includes(clientId))
const avoidSimilarInputLocked = computed(() => avoidSimilarGame.value?.answeredPlayerIds?.includes(clientId))
const avoidSimilarCountdown = computed(() => {
  if (!avoidSimilarGame.value?.phaseEndsAt) return null
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, Math.ceil((avoidSimilarGame.value.phaseEndsAt - serverNow) / 1000))
})
const avoidSimilarStatus = computed(() => {
  const game = avoidSimilarGame.value
  if (!game) return ''
  if (game.phase === 'round_intro') return `Round ${game.round} starts in ${avoidSimilarCountdown.value}.`
  if (game.phase === 'answering') return avoidSimilarInputLocked.value ? 'Your answer is locked.' : 'Choose an answer that avoids the game answer.'
  if (game.phase === 'answers_locked') return 'Answers locked.'
  if (game.phase === 'reveal_target') return 'Game answer revealed.'
  if (game.phase === 'evaluation') return `Evaluate the other answers — ${avoidSimilarCountdown.value} seconds left.`
  if (game.phase === 'vote_results') return ''
  if (game.phase === 'round_result') return 'Round results'
  if (game.phase === 'complete') return game.winnerName ? `${game.winnerName} wins!` : 'Avoid Similar Answer complete!'
  return ''
})
const avoidSimilarMyVotes = computed(() => new Map(
  (avoidSimilarGame.value?.voteRecords || [])
    .filter((record) => record.voterPlayerId === clientId)
    .map((record) => [record.targetPlayerId, record.vote]),
))
const avoidSimilarResolutionCards = computed(() => {
  const game = avoidSimilarGame.value
  if (!game || !['vote_results', 'round_result'].includes(game.phase)) return []
  const players = new Map((game.players || []).map((player) => [player.playerId, player]))
  const voteResults = new Map((game.voteResults || []).map((result) => [result.targetPlayerId, result]))
  const playerIds = game.phase === 'vote_results'
    ? (game.voteResults || []).map((result) => result.targetPlayerId)
    : game.roundEliminatedIds || []
  return playerIds.map((playerId) => {
    const player = players.get(playerId)
    const result = voteResults.get(playerId)
    return {
      playerId,
      playerName: player?.playerName || 'Player',
      answer: player?.answer || 'No answer',
      up: result?.up ?? 0,
      down: result?.down ?? 0,
      eliminated: game.roundEliminatedIds.includes(playerId),
      evaluated: Boolean(result),
    }
  })
})
const wordMemoryCountdown = computed(() => {
  if (!wordMemoryGame.value?.phaseEndsAt) return null
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, Math.ceil((wordMemoryGame.value.phaseEndsAt - serverNow) / 1000))
})
const wordMemoryStatus = computed(() => {
  const game = wordMemoryGame.value
  if (!game) return ''
  if (game.phase === 'round_intro') return `Round ${game.round} starts in ${wordMemoryCountdown.value}.`
  if (game.phase === 'word_gap') return ''
  if (game.phase === 'be_ready') return 'Be Ready'
  if (game.phase === 'answering') return wordMemoryInputLocked.value ? 'Your answer is locked.' : 'Answer before time runs out.'
  if (game.phase === 'answers_locked') return 'Answers locked.'
  if (game.phase === 'reveal') return 'Correct answer'
  if (game.phase === 'round_result') return `${game.correctPlayerIds.length} player${game.correctPlayerIds.length === 1 ? '' : 's'} safe.`
  if (game.phase === 'complete') return game.winnerName ? `${game.winnerName} wins!` : 'Word Memory Challenge complete!'
  return ''
})
const guessPreparationCountdown = computed(() => {
  if (guessTimeGame.value?.phase !== 'preparing' || !guessTimeGame.value.phaseEndsAt) return null
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.min(5, Math.max(0, Math.ceil((guessTimeGame.value.phaseEndsAt - serverNow) / 1000)))
})
const guessCountdown = computed(() => {
  if (guessTimeGame.value?.phase !== 'guessing' || !guessTimeGame.value.phaseEndsAt) return null
  const serverNow = reactionClockNow.value + reactionServerClockOffset.value
  return Math.max(0, Math.ceil((guessTimeGame.value.phaseEndsAt - serverNow) / 1000))
})
const guessStopwatchDisplay = computed(() => {
  const game = guessTimeGame.value
  if (!game) return '0.00'
  if (game.phase === 'running' && game.startedAt) {
    const serverNow = reactionClockNow.value + reactionServerClockOffset.value
    return (Math.min(game.stopwatchTime || 0, Math.max(0, (serverNow - game.startedAt) / 1000))).toFixed(2)
  }
  return Number(game.stopwatchTime || 0).toFixed(2)
})
const guessStopwatchBlurred = computed(() =>
  ['running', 'guessing', 'reveal_wait'].includes(guessTimeGame.value?.phase),
)
const guessStatus = computed(() => {
  const game = guessTimeGame.value
  if (!game) return ''
  if (game.phase === 'preparing') return `Get ready — the stopwatch starts in ${guessPreparationCountdown.value}.`
  if (game.phase === 'running') return 'Watch the stopwatch closely.'
  if (game.phase === 'guessing') return guessInputLocked.value ? 'Your guess is locked.' : 'Enter the time when the stopwatch stopped.'
  if (game.phase === 'reveal_wait') return 'All answers are locked.'
  if (game.phase === 'round_result') return isRankingFormat.value ? 'Round complete.' : `${game.eliminatedPlayerName} was farthest from the correct time.`
  if (game.phase === 'complete') return game.winnerName ? `${game.winnerName} wins!` : 'Guess The Time complete!'
  return ''
})
const reactionStatus = computed(() => {
  const game = reactionGame.value
  if (!game) return ''
  if (game.phase === 'complete') return game.winnerName ? `${game.winnerName} wins!` : 'Reaction Time complete!'
  if (game.phase === 'round_result') return isRankingFormat.value ? 'Round complete.' : `${game.eliminatedPlayerName} was eliminated for the slowest reaction.`
  if (game.phase === 'result') return `${game.lastResult?.playerName} reacted in ${game.lastResult?.reactionTime} ms.`
  if (game.activePlayerId === clientId) {
    if (game.phase === 'waiting') return 'Wait for green circle'
    if (game.phase === 'target') return ''
    if (game.phase === 'preparing') return 'Get ready…'
    return ''
  }
  return `${game.activePlayerName}'s turn`
})
const impostorColorStatus = computed(() => {
  const game = impostorColorGame.value
  if (!game) return ''
  if (game.phase === 'complete') return game.winnerName ? `${game.winnerName} wins!` : 'All red bottles have been found.'
  if (game.phase === 'farewell') return 'Saying goodbye to eliminated players…'
  if (game.phase === 'returning') return 'Returning the last bottle…'
  if (game.phase === 'aww') return ''
  if (game.phase === 'afk_eliminated') return `${game.eliminatedPlayerName} was eliminated due to AFK.`
  if (game.phase === 'warning') return `${game.currentPlayerName} received an AFK warning.`
  return ''
})

function createInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function createClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeRoomCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function openInviteDialog() {
  inviteCodeEntry.value = ''
  inviteDialogError.value = ''
  showInviteDialog.value = true
}

function closeInviteDialog() {
  showInviteDialog.value = false
  inviteCodeEntry.value = ''
  inviteDialogError.value = ''
}

function submitInviteCode() {
  const code = normalizeRoomCode(inviteCodeEntry.value)
  inviteCodeEntry.value = code
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    inviteDialogError.value = 'Enter the six-character invite code.'
    return
  }

  joiningFromInviteDialog.value = true
  showInviteDialog.value = false
  joinOnlineRoom(code, true)
}

localStorage.setItem('lets-play-client-id', clientId)

function socketUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.hostname}:8787`
}

function prepareFullWaterBottleReturn(playerId) {
  const container = document.querySelector('.full-water-container')
  const activeBottle = container?.querySelector('.full-water-bottle')
  const playerCard = [...document.querySelectorAll('[data-full-water-player-id]')]
    .find((card) => card.dataset.fullWaterPlayerId === playerId)
  const slotBottle = playerCard?.querySelector('.full-water-player__bottle')
  if (!container || !activeBottle || !slotBottle) return

  const bottleRect = activeBottle.getBoundingClientRect()
  const slotRect = slotBottle.getBoundingClientRect()
  const returnX = slotRect.left + slotRect.width / 2 - (bottleRect.left + bottleRect.width / 2)
  const returnY = slotRect.top + slotRect.height / 2 - (bottleRect.top + bottleRect.height / 2)
  container.style.setProperty('--full-water-bottle-return-x', `${returnX}px`)
  container.style.setProperty('--full-water-bottle-return-y', `${returnY}px`)
}

function applyRoomSnapshot(room, serverNow) {
  const previousGame = reactionGame.value
  const nextGame = room.game
  const fullWaterTurnEnded = previousGame?.id === 'full_water'
    && ['pouring', 'ready_to_finish'].includes(previousGame.phase)
    && nextGame?.id === 'full_water'
    && ['settling', 'overflowing'].includes(nextGame.phase)
  if (fullWaterTurnEnded) {
    window.clearTimeout(fullWaterBottleReturnTimer)
    prepareFullWaterBottleReturn(previousGame.currentPlayerId)
    fullWaterBottleReturning.value = true
    fullWaterBottleReturnTimer = window.setTimeout(() => { fullWaterBottleReturning.value = false }, 360)
  } else if (nextGame?.id !== 'full_water' || ['waiting_to_pour', 'round_intro', 'complete'].includes(nextGame.phase)) {
    window.clearTimeout(fullWaterBottleReturnTimer)
    fullWaterBottleReturning.value = false
  }
  onlineRoom.value = room
  reactionGame.value = room.game || null
  if (serverNow) reactionServerClockOffset.value = serverNow - Date.now()
  if (!room.game || room.game.phase !== 'target' || room.game.activePlayerId !== clientId) reactionClickSubmitted.value = false
  if (room.game?.id !== 'full_water' || room.game.phase !== 'pouring' || room.game.currentPlayerId !== clientId) fullWaterPourHeld.value = false
  if (room.game?.id !== 'guess_the_time' || room.game.phase !== 'guessing') guessInput.value = ''
  if (room.game?.id !== 'word_memory_challenge' || room.game.phase !== 'answering') wordMemoryInput.value = ''
  if (room.game?.id !== 'avoid_similar_answer' || room.game.phase !== 'answering') avoidSimilarInput.value = ''
  if (room.game?.id === 'type_it') {
    const serverTypedText = room.game.players?.find((player) => player.playerId === clientId)?.typedText || ''
    if (room.game.phase !== 'typing') {
      typeItInput.value = serverTypedText
      typeItInputHydrated.value = false
    } else if (!typeItInputHydrated.value) {
      // Once typing has begun, preserve local keystrokes until the server catches up.
      // WebSocket snapshots can otherwise arrive between rapid key presses and erase text.
      typeItInput.value = serverTypedText
      typeItInputHydrated.value = true
    }
  } else {
    typeItInput.value = ''
    typeItInputHydrated.value = false
  }
  inviteCode.value = room.code
  roomMode.value = room.mode
  roomFormat.value = room.format
  maxGames.value = String(room.maxGames)
  if (room.lastStandardMaxGames) lastStandardMaxGames.value = String(room.lastStandardMaxGames)
  manualGames.value = Boolean(room.manualGames)
  selectedGames.value = room.selectedGames || []
  if (!manualGames.value) showGameChooser.value = false
  teamOne.value = room.slots.one
  teamTwo.value = room.slots.two
  localStorage.setItem('lets-play-room-code', room.code)
}

function resetOnlineRoom(reason = '') {
  window.clearTimeout(fullWaterBottleReturnTimer)
  fullWaterBottleReturning.value = false
  onlineRoom.value = null
  reactionGame.value = null
  showReactionMenu.value = false
  onlineError.value = reason
  localStorage.removeItem('lets-play-room-code')
}

function handleRoomMessage(event) {
  const message = JSON.parse(event.data)
  if (message.type === 'room_state' || message.type === 'game_started' || message.type === 'game_state') {
    applyRoomSnapshot(message.room, message.serverNow)
    joiningFromInviteDialog.value = false
    if (message.room.phase === 'playing' && message.room.game?.id === 'reaction_time') currentView.value = 'reaction'
    if (message.room.phase === 'playing' && message.room.game?.id === 'guess_the_time') currentView.value = 'guess-time'
    if (message.room.phase === 'playing' && message.room.game?.id === 'word_memory_challenge') currentView.value = 'word-memory'
    if (message.room.phase === 'playing' && message.room.game?.id === 'avoid_similar_answer') currentView.value = 'avoid-similar'
    if (message.room.phase === 'playing' && message.room.game?.id === 'impostor_color') currentView.value = 'impostor-color'
    if (message.room.phase === 'playing' && message.room.game?.id === 'full_water') currentView.value = 'full-water'
    if (message.room.phase === 'playing' && message.room.game?.id === 'type_it') currentView.value = 'type-it'
    onlineError.value = message.room.phase === 'playing' ? 'Game started — waiting for gameplay.' : ''
  } else if (message.type === 'room_closed') {
    resetOnlineRoom(message.reason)
    currentView.value = 'landing'
  } else if (message.type === 'action_rejected' || message.type === 'error') {
    if (joiningFromInviteDialog.value) {
      joiningFromInviteDialog.value = false
      inviteDialogError.value = message.message
      showInviteDialog.value = true
      currentView.value = 'landing'
      return
    }
    onlineError.value = message.message
  }
}

function handleRoomClose() {
  onlineStatus.value = 'offline'
  if (shuttingDown || !onlineRoom.value?.code) return
  window.clearTimeout(reconnectTimer)
  reconnectTimer = window.setTimeout(async () => {
    reconnectAttempts += 1
    try {
      await connectRoom()
      sendRoom({ type: 'reconnect', code: onlineRoom.value.code })
      reconnectAttempts = 0
    } catch {}
  }, Math.min(8000, 500 * 2 ** reconnectAttempts))
}

function connectRoom() {
  if (roomSocket?.readyState === WebSocket.OPEN) return Promise.resolve()
  onlineStatus.value = 'connecting'
  return new Promise((resolve, reject) => {
    roomSocket = new WebSocket(socketUrl())
    roomSocket.addEventListener('open', () => {
      onlineStatus.value = 'online'
      resolve()
    }, { once: true })
    roomSocket.addEventListener('error', () => {
      onlineStatus.value = 'offline'
      reject(new Error('Room server unavailable'))
    }, { once: true })
    roomSocket.addEventListener('message', handleRoomMessage)
    roomSocket.addEventListener('close', handleRoomClose, { once: true })
  })
}

function sendRoom(payload) {
  if (roomSocket?.readyState === WebSocket.OPEN) {
    roomSocket.send(JSON.stringify({ ...payload, clientId }))
  }
}

async function createOnlineRoom() {
  currentView.value = 'room'
  onlineError.value = ''
  localStorage.setItem('lets-play-player-name', playerName.value.trim().slice(0, 10) || 'Host')
  try {
    await connectRoom()
    sendRoom({ type: 'create_room', name: playerName.value })
  } catch {
    onlineError.value = 'Could not reach the room server.'
  }
}

async function joinOnlineRoom(code, fromInviteDialog = false) {
  currentView.value = 'room'
  onlineError.value = ''
  try {
    await connectRoom()
    sendRoom({ type: 'join_room', code, name: playerName.value })
  } catch {
    if (fromInviteDialog) {
      joiningFromInviteDialog.value = false
      inviteDialogError.value = 'Could not reach the room server.'
      showInviteDialog.value = true
      currentView.value = 'landing'
      return
    }
    onlineError.value = 'Could not reach the room server.'
  }
}

function updateRoomSettings() {
  if (roomMode.value === 'For Fun') {
    if (maxGames.value !== '1') lastStandardMaxGames.value = maxGames.value
    maxGames.value = '1'
  } else if (maxGames.value === '1') {
    maxGames.value = lastStandardMaxGames.value
  } else {
    lastStandardMaxGames.value = maxGames.value
  }
  sendRoom({ type: 'update_settings', mode: roomMode.value, format: roomFormat.value, maxGames: Number(maxGames.value) })
}

function updateManualGames() {
  if (!manualGames.value) {
    showGameChooser.value = false
    selectedGames.value = []
  }
  sendRoom({ type: 'set_manual_games', manualGames: manualGames.value })
}

function openGameChooser() {
  gameSelectionBeforeChoosing.value = [...selectedGames.value]
  showGameChooser.value = true
}

function openGameViewer() {
  showGameChooser.value = true
}

function cancelGameChooser() {
  selectedGames.value = [...gameSelectionBeforeChoosing.value]
  sendRoom({ type: 'update_selected_games', gameIds: selectedGames.value })
  showGameChooser.value = false
}

function canSelectGame(gameId) {
  if (!playableGameIds.has(gameId)) return false
  return selectedGames.value.includes(gameId) || selectedGameCount.value < Number(maxGames.value)
}

function toggleSelectedGame(gameId) {
  const gameIds = selectedGames.value.includes(gameId)
    ? selectedGames.value.filter((selectedId) => selectedId !== gameId)
    : canSelectGame(gameId) ? [...selectedGames.value, gameId] : selectedGames.value
  selectedGames.value = gameIds
  sendRoom({ type: 'update_selected_games', gameIds })
}

function updateRoomName(player) {
  const name = player.name.trim().slice(0, 10) || 'Player'
  if (player.id === clientId) {
    playerName.value = name
    localStorage.setItem('lets-play-player-name', name)
  }
  sendRoom({ type: 'update_name', playerId: player.id, name })
}

const copyInviteCode = async () => {
  try {
    await navigator.clipboard.writeText(inviteCode.value)
  } catch {
    const fallback = document.createElement('textarea')
    fallback.value = inviteCode.value
    fallback.style.position = 'fixed'
    fallback.style.opacity = '0'
    document.body.appendChild(fallback)
    fallback.select()
    document.execCommand('copy')
    fallback.remove()
  }

  copyLabel.value = 'Copied!'
  window.setTimeout(() => (copyLabel.value = 'Copy'), 1600)
}

const toggleReady = () => sendRoom({ type: 'toggle_ready' })
const addBot = (group, index) => sendRoom({ type: 'add_bot', group, index })
const kickPlayer = (player) => sendRoom({ type: 'kick_player', playerId: player.id })
const closeInstructions = () => sendRoom({ type: 'close_instructions' })
const skipIntermission = () => sendRoom({ type: 'skip_intermission' })
const pickImpostorBottle = (bottleIndex) => sendRoom({ type: 'impostor_color_pick', bottleIndex })
function startFullWaterPour() {
  if (!canStartFullWaterPour.value || fullWaterPourHeld.value) return
  fullWaterPourHeld.value = true
  sendRoom({ type: 'full_water_pour_start' })
}

function stopFullWaterPour() {
  if (!fullWaterPourHeld.value) return
  fullWaterPourHeld.value = false
  sendRoom({ type: 'full_water_pour_stop' })
}

function finishFullWaterTurn() {
  if (!canFinishFullWaterTurn.value) return
  sendRoom({ type: 'full_water_finish_turn' })
}

const recordReaction = () => {
  if (!reactionTargetInteractive.value) return
  reactionClickSubmitted.value = true
  sendRoom({ type: 'reaction_click' })
}

function normalizeGuessInput(value) {
  const [integer = '', ...decimalParts] = String(value || '').replace(/[^\d.]/g, '').split('.')
  const decimal = decimalParts.join('').slice(0, 2)
  return decimalParts.length ? `${integer}.${decimal}` : integer
}

function submitTimeGuess() {
  const value = guessInput.value
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0 || Number(value) > 10.99) return
  sendRoom({ type: 'guess_time_submit', guess: value })
}

function normalizeWordMemoryInput(value) {
  return String(value || '').replace(/[^a-z]/gi, '').slice(0, 32)
}

function submitWordMemoryAnswer() {
  if (wordMemoryInputLocked.value || isTournamentSpectator.value) return
  sendRoom({ type: 'word_memory_submit', answer: normalizeWordMemoryInput(wordMemoryInput.value) })
}

function focusTypeItInput() {
  if (typeItCanType.value) typeItInputRef.value?.focus()
}

function sendTypeItInput(event) {
  if (!typeItCanType.value) return
  sendRoom({ type: 'type_it_input', value: event.target.value })
}

function normalizeAvoidSimilarInput(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80)
}

function submitAvoidSimilarAnswer() {
  if (avoidSimilarInputLocked.value || isTournamentSpectator.value) return
  sendRoom({ type: 'avoid_similar_submit', answer: normalizeAvoidSimilarInput(avoidSimilarInput.value) })
}

function voteAvoidSimilar(targetPlayerId, vote) {
  if (isTournamentSpectator.value || showReactionMenu.value) return
  sendRoom({ type: 'avoid_similar_vote', targetPlayerId, vote })
}

function closeSettings() {
  currentView.value = settingsReturnView.value
  settingsReturnView.value = 'landing'
}

function toggleReactionMenu() {
  showReactionMenu.value = !showReactionMenu.value
}

function resumeReaction() {
  showReactionMenu.value = false
}

function openReactionSettings() {
  showReactionMenu.value = false
  settingsReturnView.value = currentView.value
  currentView.value = 'settings'
}

function quitActiveGame() {
  showReactionMenu.value = false
  sendRoom({ type: 'quit_game' })
}

function exitRoom() {
  sendRoom({ type: 'leave_room' })
  resetOnlineRoom()
  currentView.value = 'landing'
}

const renderGameToText = () =>
  JSON.stringify({
    screen: currentView.value,
    title: 'Let’s Play!',
    actions: currentView.value === 'landing'
      ? [...menuItems.map(({ label }) => label), ...(showInviteDialog.value ? ['Cancel', 'Join'] : [])]
      : ['Exit'],
    ...(showInviteDialog.value && {
      inviteDialog: { code: inviteCodeEntry.value, error: inviteDialogError.value },
    }),
    ...(currentView.value === 'settings' && {
      sfxVolume: sfxVolume.value,
      musicVolume: musicVolume.value,
    }),
    ...(currentView.value === 'room' && {
      inviteCode: inviteCode.value,
      mode: roomMode.value,
      format: roomFormat.value,
      maxGames: Number(maxGames.value),
      manualGames: manualGames.value,
      selectedGames: selectedGames.value,
      playerCount: playerCount.value,
      teamOne: teamOne.value.map((player) => (player ? { name: player.name, ready: player.ready, bot: player.bot } : null)),
      teamTwo: teamTwo.value.map((player) => (player ? { name: player.name, ready: player.ready, bot: player.bot } : null)),
      ...(gameInstructions.value && {
        instructions: {
          game: gameInstructions.value.game,
          secondsRemaining: instructionCountdown.value,
          closedByMe: instructionsClosedByMe.value,
        },
      }),
      ...(gameIntermission.value && {
        intermission: {
          secondsRemaining: intermissionCountdown.value,
          continuedByMe: intermissionSkippedByMe.value,
          overtime: Boolean(gameIntermission.value.overtime),
          standings: onlineRoom.value?.tournament?.standings,
        },
      }),
    }),
    ...(currentView.value === 'reaction' && reactionGame.value && {
      game: {
        id: reactionGame.value.id,
        round: reactionGame.value.round,
        phase: reactionGame.value.phase,
        activePlayerId: reactionGame.value.activePlayerId,
        targetVisible: reactionTargetVisible.value,
        targetInteractive: reactionTargetInteractive.value,
        lastReactionMs: reactionGame.value.lastResult?.reactionTime ?? null,
        eliminatedPlayerId: reactionGame.value.eliminatedPlayerId,
        menuOpen: showReactionMenu.value,
        leaderboard: reactionGame.value.leaderboard,
      },
    }),
    ...(currentView.value === 'guess-time' && guessTimeGame.value && {
      game: {
        id: guessTimeGame.value.id,
        round: guessTimeGame.value.round,
        phase: guessTimeGame.value.phase,
        stopwatch: guessStopwatchDisplay.value,
        blurred: guessStopwatchBlurred.value,
        secondsRemaining: guessCountdown.value,
        guessLocked: guessInputLocked.value,
        players: guessTimeGame.value.players,
      },
    }),
    ...(currentView.value === 'word-memory' && wordMemoryGame.value && {
      game: {
        id: wordMemoryGame.value.id,
        round: wordMemoryGame.value.round,
        maxRounds: wordMemoryGame.value.maxRounds,
        phase: wordMemoryGame.value.phase,
        word: wordMemoryGame.value.currentWord,
        question: wordMemoryGame.value.question,
        secondsRemaining: wordMemoryCountdown.value,
        answerLocked: wordMemoryInputLocked.value,
        submittedAnswers: wordMemoryGame.value.players
          .filter((player) => player.answer !== null)
          .map((player) => ({ playerId: player.playerId, answer: player.answer })),
        correctPlayerIds: wordMemoryGame.value.correctPlayerIds,
        eliminatedIds: wordMemoryGame.value.eliminatedIds,
        players: wordMemoryGame.value.players,
      },
    }),
    ...(currentView.value === 'avoid-similar' && avoidSimilarGame.value && {
      game: {
        id: avoidSimilarGame.value.id,
        round: avoidSimilarGame.value.round,
        maxRounds: avoidSimilarGame.value.maxRounds,
        phase: avoidSimilarGame.value.phase,
        request: avoidSimilarGame.value.request,
        gameAnswer: avoidSimilarGame.value.gameAnswer,
        secondsRemaining: avoidSimilarCountdown.value,
        answerLocked: avoidSimilarInputLocked.value,
        eliminatedIds: avoidSimilarGame.value.eliminatedIds,
        roundEliminatedIds: avoidSimilarGame.value.roundEliminatedIds,
        evaluationPlayerIds: avoidSimilarGame.value.evaluationPlayerIds,
        myVotes: [...avoidSimilarMyVotes.value],
        voteResults: avoidSimilarGame.value.voteResults,
        players: avoidSimilarGame.value.players,
      },
    }),
    ...(currentView.value === 'impostor-color' && impostorColorGame.value && {
      game: {
        id: impostorColorGame.value.id,
        phase: impostorColorGame.value.phase,
        currentPlayerId: impostorColorGame.value.currentPlayerId,
        selectedBottleIndex: impostorColorGame.value.selectedBottleIndex,
        pickSecondsRemaining: impostorPickCountdown.value,
        bottles: impostorColorGame.value.bottles,
        eliminatedIds: impostorColorGame.value.eliminatedIds,
      },
    }),
    ...(currentView.value === 'full-water' && fullWaterGame.value && {
      game: {
        id: fullWaterGame.value.id,
        round: fullWaterGame.value.round,
        maxRounds: fullWaterGame.value.maxRounds,
        phase: fullWaterGame.value.phase,
        currentPlayerId: fullWaterGame.value.currentPlayerId,
        waterMl: fullWaterDisplayedMl.value,
        capacityMl: fullWaterGame.value.capacityMl,
        turnPouredMl: fullWaterGame.value.turnPouredMl,
        canFinish: canFinishFullWaterTurn.value,
        secondsRemaining: fullWaterCountdown.value,
        pouring: fullWaterPourHeld.value,
        eliminatedPlayerId: fullWaterGame.value.eliminatedPlayerId,
        players: fullWaterGame.value.players,
      },
    }),
    ...(currentView.value === 'type-it' && typeItGame.value && {
      game: {
        id: typeItGame.value.id,
        round: typeItGame.value.round,
        maxRounds: typeItGame.value.maxRounds,
        phase: typeItGame.value.phase,
        phrase: typeItGame.value.phrase,
        secondsRemaining: typeItCountdown.value,
        canType: typeItCanType.value,
        input: typeItInput.value,
        eliminatedIds: typeItGame.value.eliminatedIds,
        roundEliminatedIds: typeItGame.value.roundEliminatedIds,
        players: typeItGame.value.players,
      },
    }),
  })

onMounted(() => {
  window.render_game_to_text = renderGameToText
  reactionClockTimer = window.setInterval(() => { reactionClockNow.value = Date.now() }, 100)
  window.advanceTime = (ms = 0) => { reactionClockNow.value += Number(ms) || 0 }
  window.addEventListener('pointerup', stopFullWaterPour)
  window.addEventListener('blur', stopFullWaterPour)
  const invitedRoom = new URLSearchParams(location.search).get('room')
  if (invitedRoom) joinOnlineRoom(invitedRoom.toUpperCase())
})

onBeforeUnmount(() => {
  shuttingDown = true
  window.clearTimeout(reconnectTimer)
  window.clearTimeout(fullWaterBottleReturnTimer)
  window.clearInterval(reactionClockTimer)
  window.removeEventListener('pointerup', stopFullWaterPour)
  window.removeEventListener('blur', stopFullWaterPour)
  roomSocket?.close()
  delete window.render_game_to_text
  delete window.advanceTime
})
</script>

<template>
  <main v-if="currentView === 'landing'" class="landing-page" aria-labelledby="game-title">
    <div class="landing-page__backdrop" aria-hidden="true"></div>

    <section class="landing-page__content" aria-label="Let’s Play main menu">
      <h1 id="game-title" class="game-title">Let’s Play!</h1>

      <nav class="main-menu" aria-label="Main menu">
        <button
          v-for="item in menuItems"
          :key="item.label"
          class="main-menu__button"
          type="button"
          @click="item.action"
        >
          {{ item.label }}
        </button>
      </nav>

      <div v-if="showInviteDialog" class="invite-dialog__overlay">
        <section
          class="invite-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-dialog-title"
          aria-describedby="invite-dialog-help"
        >
          <h2 id="invite-dialog-title">Join a room</h2>
          <p id="invite-dialog-help">Enter the six-character invite code.</p>

          <form @submit.prevent="submitInviteCode">
            <label class="sr-only" for="invite-code-entry">Invite code</label>
            <input
              id="invite-code-entry"
              v-model="inviteCodeEntry"
              class="invite-dialog__input"
              type="text"
              inputmode="text"
              autocomplete="off"
              maxlength="6"
              placeholder="ABC123"
              aria-describedby="invite-dialog-help invite-dialog-error"
              @input="inviteCodeEntry = normalizeRoomCode(inviteCodeEntry)"
            />
            <p v-if="inviteDialogError" id="invite-dialog-error" class="invite-dialog__error" role="alert">
              {{ inviteDialogError }}
            </p>

            <div class="invite-dialog__actions">
              <button class="main-menu__button" type="button" @click="closeInviteDialog">Cancel</button>
              <button class="main-menu__button" type="submit">Join</button>
            </div>
          </form>
        </section>
      </div>
    </section>
  </main>

  <main v-else-if="currentView === 'settings'" class="settings-page" aria-labelledby="settings-title">
    <div class="settings-page__art" aria-hidden="true"></div>

    <button class="main-menu__button settings-page__back" type="button" @click="closeSettings">
      <span aria-hidden="true">←</span>
      Back
    </button>

    <section class="settings-page__controls-region">
      <div class="settings-controls" aria-labelledby="settings-title">
        <h1 id="settings-title" class="visually-hidden">Sound Settings</h1>
        <div class="sound-control">
          <label for="sfx-volume">SFX</label>
          <input id="sfx-volume" v-model.number="sfxVolume" type="range" min="0" max="100" />
        </div>

        <div class="sound-control">
          <label for="music-volume">Music</label>
          <input id="music-volume" v-model.number="musicVolume" type="range" min="0" max="100" />
        </div>
      </div>
    </section>
  </main>

  <main v-else-if="currentView === 'reaction' || gameInstructions?.game?.id === 'reaction_time'" class="reaction-page" aria-labelledby="reaction-title">
    <header class="reaction-page__header">
      <button
        class="reaction-menu-trigger"
        type="button"
        aria-label="Open game menu"
        aria-controls="reaction-game-menu"
        :aria-expanded="showReactionMenu"
        @click="toggleReactionMenu"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div>
        <p>Let's Play!</p>
        <h1 id="reaction-title">Reaction Time</h1>
      </div>
      <p class="reaction-page__round">Round {{ reactionGame?.round }} / {{ reactionGame?.maxRounds }}</p>
      <p v-if="isOvertimeGame" class="reaction-page__overtime">{{ overtimeLabel }}</p>

      <section v-if="showReactionMenu" id="reaction-game-menu" class="reaction-menu" aria-label="Game menu">
        <button type="button" @click="resumeReaction">Resume</button>
        <button type="button" @click="openReactionSettings">Settings</button>
        <button class="reaction-menu__quit" type="button" @click="quitActiveGame">Quit</button>
      </section>
    </header>

    <section class="reaction-field" aria-live="polite">
      <div class="reaction-field__play-area">
        <p class="reaction-field__turn">{{ reactionStatus }}</p>
        <p v-if="reactionPreparationCountdown !== null" class="reaction-field__countdown">
          {{ reactionPreparationCountdown }}
        </p>
        <button
          v-if="reactionTargetVisible"
          class="reaction-target"
          :class="{ 'reaction-target--spectator': !reactionTargetInteractive }"
          :style="reactionTargetStyle"
          type="button"
          :disabled="!reactionTargetInteractive"
          :aria-label="reactionTargetInteractive ? 'Record your reaction time' : 'Reaction target shown for another player'"
          @click="recordReaction"
        ></button>

        <div
          v-if="reactionResultVisible"
          class="reaction-target reaction-target--result"
          :class="{ 'reaction-target--spectator-click': reactionGame?.lastResult?.playerId !== clientId }"
          :style="reactionTargetStyle"
        >
          {{ reactionGame?.lastResult?.reactionTime }} ms
        </div>
      </div>

      <TransitionGroup name="reaction-rank" tag="section" class="reaction-leaderboard" aria-label="Reaction time rankings">
        <article
          v-for="entry in reactionGame?.leaderboard || []"
          :key="entry.playerId"
          class="reaction-leaderboard__entry"
          :class="{
            'reaction-leaderboard__entry--pending': entry.reactionTime === null,
            'reaction-leaderboard__entry--eliminated': entry.eliminated,
          }"
        >
          <span class="reaction-leaderboard__rank">{{ entry.rank }}</span>
          <strong>{{ entry.playerName }}</strong>
          <span>{{ entry.eliminated ? 'Out' : entry.reactionTime === null ? 'Waiting' : `${entry.reactionTime} ms` }}</span>
          <small v-if="isRankingFormat">{{ tournamentPoints(entry.playerId) }} pts</small>
        </article>
      </TransitionGroup>
    </section>
  </main>

  <main v-else-if="currentView === 'guess-time' || gameInstructions?.game?.id === 'guess_the_time'" class="reaction-page guess-time-page" aria-labelledby="guess-time-title">
    <header class="reaction-page__header">
      <button
        class="reaction-menu-trigger"
        type="button"
        aria-label="Open game menu"
        aria-controls="guess-time-game-menu"
        :aria-expanded="showReactionMenu"
        @click="toggleReactionMenu"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div>
        <p>Let's Play!</p>
        <h1 id="guess-time-title">Guess The Time</h1>
      </div>
      <p class="reaction-page__round">Round {{ guessTimeGame?.round }} / {{ guessTimeGame?.maxRounds }}</p>
      <p v-if="isOvertimeGame" class="reaction-page__overtime">{{ overtimeLabel }}</p>

      <section v-if="showReactionMenu" id="guess-time-game-menu" class="reaction-menu" aria-label="Game menu">
        <button type="button" @click="resumeReaction">Resume</button>
        <button type="button" @click="openReactionSettings">Settings</button>
        <button class="reaction-menu__quit" type="button" @click="quitActiveGame">Quit</button>
      </section>
    </header>

    <section class="guess-time-field" aria-live="polite">
      <p class="guess-time-field__status">{{ guessStatus }}</p>
      <div
        class="guess-stopwatch"
        :class="{
          'guess-stopwatch--waiting': guessTimeGame?.phase === 'preparing',
          'guess-stopwatch--running': guessTimeGame?.phase === 'running',
          'guess-stopwatch--blurred': guessStopwatchBlurred,
          'guess-stopwatch--revealed': guessTimeGame?.phase === 'round_result',
        }"
      >
        <span class="guess-stopwatch__crown" aria-hidden="true"></span>
        <span class="guess-stopwatch__time">{{ guessStopwatchDisplay }}</span>
      </div>

      <form v-if="guessTimeGame?.phase === 'guessing' && !guessTimeGame.eliminatedIds.includes(clientId) && !isTournamentSpectator" class="guess-time-form" @submit.prevent="submitTimeGuess">
        <label for="guess-time-input">Your guess</label>
        <div>
          <input
            id="guess-time-input"
            v-model="guessInput"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
            :disabled="guessInputLocked || showReactionMenu"
            @input="guessInput = normalizeGuessInput(guessInput)"
          />
          <button class="guess-time-form__lock" type="submit" :disabled="guessInputLocked || showReactionMenu">{{ guessInputLocked ? 'Locked' : 'Lock guess' }}</button>
        </div>
        <small>{{ guessCountdown }} seconds remaining</small>
      </form>

      <TransitionGroup name="reaction-rank" tag="section" class="guess-time-players" aria-label="Guess The Time players">
        <article
          v-for="entry in guessTimeGame?.players || []"
          :key="entry.playerId"
          class="guess-time-player"
          :class="{ 'guess-time-player--eliminated': entry.eliminated }"
        >
          <span class="reaction-leaderboard__rank">{{ entry.rank }}</span>
          <strong>{{ entry.playerName }}</strong>
          <span v-if="guessTimeGame?.phase === 'round_result' || guessTimeGame?.phase === 'complete'">
            {{ entry.guess === null ? 'No guess' : `${entry.guess.toFixed(2)} s` }}
          </span>
          <span v-else>{{ guessTimeGame?.guessedPlayerIds.includes(entry.playerId) ? 'Locked' : 'Waiting' }}</span>
          <small v-if="isRankingFormat">{{ tournamentPoints(entry.playerId) }} pts</small>
        </article>
      </TransitionGroup>
    </section>
  </main>

  <main v-else-if="currentView === 'word-memory' || gameInstructions?.game?.id === 'word_memory_challenge'" class="reaction-page word-memory-page" aria-labelledby="word-memory-title">
    <header class="reaction-page__header">
      <button
        class="reaction-menu-trigger"
        type="button"
        aria-label="Open game menu"
        aria-controls="word-memory-game-menu"
        :aria-expanded="showReactionMenu"
        @click="toggleReactionMenu"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div>
        <p>Let's Play!</p>
        <h1 id="word-memory-title">Word Memory Challenge</h1>
      </div>
      <p class="reaction-page__round">Round {{ wordMemoryGame?.round }} / {{ wordMemoryGame?.maxRounds }}</p>
      <p v-if="isOvertimeGame" class="reaction-page__overtime">{{ overtimeLabel }}</p>

      <section v-if="showReactionMenu" id="word-memory-game-menu" class="reaction-menu" aria-label="Game menu">
        <button type="button" @click="resumeReaction">Resume</button>
        <button type="button" @click="openReactionSettings">Settings</button>
        <button class="reaction-menu__quit" type="button" @click="quitActiveGame">Quit</button>
      </section>
    </header>

    <section class="word-memory-field" :class="{ 'word-memory-field--with-status': wordMemoryStatus }" aria-live="polite">
      <p v-if="wordMemoryStatus" class="word-memory-field__status">{{ wordMemoryStatus }}</p>

      <div class="word-memory-prompt" :class="`word-memory-prompt--${wordMemoryGame?.phase || 'waiting'}`">
        <strong v-if="wordMemoryGame?.phase === 'round_intro'" class="word-memory-prompt__countdown">{{ wordMemoryCountdown }}</strong>
        <strong v-else-if="wordMemoryGame?.phase === 'showing_word'" class="word-memory-prompt__word">{{ wordMemoryGame?.currentWord }}</strong>
        <span v-else-if="wordMemoryGame?.phase === 'word_gap'" class="word-memory-prompt__gap" aria-label="Brief pause">• • •</span>
        <template v-else-if="wordMemoryGame?.phase === 'be_ready'">
          <strong class="word-memory-prompt__ready">Be Ready</strong>
          <span class="word-memory-prompt__countdown">{{ wordMemoryCountdown }}</span>
        </template>
        <template v-else-if="['answering', 'answers_locked', 'reveal', 'round_result'].includes(wordMemoryGame?.phase)">
          <p class="word-memory-prompt__question">{{ wordMemoryGame?.question }}</p>
          <p v-if="['reveal', 'round_result'].includes(wordMemoryGame?.phase)" class="word-memory-prompt__answer">
            <span>Answer: </span>
            <template v-if="wordMemoryGame?.answerLetterIndex !== null && wordMemoryGame?.answerLetterIndex !== undefined">
              <span v-for="(letter, index) in wordMemoryGame?.answerWord || ''" :key="`${letter}-${index}`" :class="{ 'word-memory-prompt__letter--highlighted': index === wordMemoryGame?.answerLetterIndex }" class="word-memory-prompt__letter">{{ letter }}</span>
            </template>
            <strong v-else>{{ wordMemoryGame?.answer }}</strong>
          </p>
        </template>
        <strong v-else-if="wordMemoryGame?.phase === 'complete'" class="word-memory-prompt__complete">{{ wordMemoryGame?.winnerName || 'Round complete' }}</strong>
      </div>

      <form
        v-if="wordMemoryGame?.phase === 'answering' && !wordMemoryGame.eliminatedIds.includes(clientId) && !isTournamentSpectator"
        class="guess-time-form word-memory-form"
        @submit.prevent="submitWordMemoryAnswer"
      >
        <label for="word-memory-input">Your answer</label>
        <div>
          <input
            id="word-memory-input"
            v-model="wordMemoryInput"
            type="text"
            inputmode="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="Letters only"
            :disabled="wordMemoryInputLocked || showReactionMenu"
            @input="wordMemoryInput = normalizeWordMemoryInput(wordMemoryInput)"
          />
          <button class="guess-time-form__lock" type="submit" :disabled="wordMemoryInputLocked || showReactionMenu">{{ wordMemoryInputLocked ? 'Locked' : 'Lock answer' }}</button>
        </div>
        <small>{{ wordMemoryCountdown }} seconds remaining</small>
      </form>

      <TransitionGroup name="reaction-rank" tag="section" class="guess-time-players word-memory-players" aria-label="Word Memory Challenge players">
        <article
          v-for="entry in wordMemoryGame?.players || []"
          :key="entry.playerId"
          class="guess-time-player word-memory-player"
          :class="{
            'guess-time-player--eliminated': entry.eliminated,
            'word-memory-player--safe': ['round_result', 'complete'].includes(wordMemoryGame?.phase) && wordMemoryGame?.correctPlayerIds.includes(entry.playerId),
          }"
        >
          <span class="reaction-leaderboard__rank">{{ entry.rank }}</span>
          <strong>{{ entry.playerName }}</strong>
          <span v-if="wordMemoryGame?.phase === 'answers_locked'" class="word-memory-player__answer-bubble">{{ entry.answer || 'No answer' }}</span>
          <span v-if="entry.eliminated">Out</span>
          <span v-else-if="['round_result', 'complete'].includes(wordMemoryGame?.phase)">{{ wordMemoryGame?.correctPlayerIds.includes(entry.playerId) ? 'Safe' : 'Out' }}</span>
          <span v-else>{{ wordMemoryGame?.answeredPlayerIds.includes(entry.playerId) ? 'Locked' : 'Thinking' }}</span>
          <small v-if="isRankingFormat">{{ tournamentPoints(entry.playerId) }} pts</small>
        </article>
      </TransitionGroup>
    </section>
  </main>

  <main v-else-if="currentView === 'avoid-similar' || gameInstructions?.game?.id === 'avoid_similar_answer'" class="reaction-page avoid-similar-page" aria-labelledby="avoid-similar-title">
    <header class="reaction-page__header">
      <button
        class="reaction-menu-trigger"
        type="button"
        aria-label="Open game menu"
        aria-controls="avoid-similar-game-menu"
        :aria-expanded="showReactionMenu"
        @click="toggleReactionMenu"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div>
        <p>Let's Play!</p>
        <h1 id="avoid-similar-title">Avoid Similar Answer</h1>
      </div>
      <p class="reaction-page__round">Round {{ avoidSimilarGame?.round }} / {{ avoidSimilarGame?.maxRounds }}</p>
      <p v-if="isOvertimeGame" class="reaction-page__overtime">{{ overtimeLabel }}</p>

      <section v-if="showReactionMenu" id="avoid-similar-game-menu" class="reaction-menu" aria-label="Game menu">
        <button type="button" @click="resumeReaction">Resume</button>
        <button type="button" @click="openReactionSettings">Settings</button>
        <button class="reaction-menu__quit" type="button" @click="quitActiveGame">Quit</button>
      </section>
    </header>

    <section class="avoid-similar-field" :class="{ 'avoid-similar-field--with-status': avoidSimilarStatus }" aria-live="polite">
      <p v-if="avoidSimilarStatus" class="avoid-similar-field__status">{{ avoidSimilarStatus }}</p>

      <div class="avoid-similar-prompt" :class="`avoid-similar-prompt--${avoidSimilarGame?.phase || 'waiting'}`">
        <strong v-if="avoidSimilarGame?.phase === 'round_intro'" class="avoid-similar-prompt__countdown">{{ avoidSimilarCountdown }}</strong>
        <template v-else-if="['answering', 'answers_locked', 'reveal_target', 'evaluation'].includes(avoidSimilarGame?.phase)">
          <p class="avoid-similar-prompt__request">{{ avoidSimilarGame?.request }}</p>
          <p v-if="['reveal_target', 'evaluation'].includes(avoidSimilarGame?.phase)" class="avoid-similar-prompt__target">
            <span>Game answer</span>
            <strong>{{ avoidSimilarGame?.gameAnswer }}</strong>
          </p>
        </template>
        <template v-else-if="['vote_results', 'round_result'].includes(avoidSimilarGame?.phase)">
          <p class="avoid-similar-prompt__result-title">
            {{ avoidSimilarGame?.phase === 'vote_results' ? 'Vote results' : 'Eliminated this round' }}
          </p>
          <TransitionGroup
            name="avoid-similar-resolution"
            tag="div"
            class="avoid-similar-resolution"
            :class="{ 'avoid-similar-resolution--eliminated': avoidSimilarGame?.phase === 'round_result' }"
          >
            <article
              v-for="card in avoidSimilarResolutionCards"
              :key="card.playerId"
              class="avoid-similar-resolution__card"
              :class="{ 'avoid-similar-resolution__card--out': card.eliminated }"
            >
              <strong>{{ card.playerName }}</strong>
              <span>{{ card.answer }}</span>
              <small v-if="avoidSimilarGame?.phase === 'vote_results' && card.evaluated">👍 {{ card.up }} &nbsp; 👎 {{ card.down }}</small>
              <small v-else>Eliminated</small>
            </article>
          </TransitionGroup>
          <p v-if="avoidSimilarGame?.phase === 'round_result' && !avoidSimilarResolutionCards.length" class="avoid-similar-resolution__safe">Everyone is safe!</p>
        </template>
        <strong v-else-if="avoidSimilarGame?.phase === 'complete'" class="avoid-similar-prompt__complete">{{ avoidSimilarGame?.winnerName || 'Round complete' }}</strong>
      </div>

      <form
        v-if="avoidSimilarGame?.phase === 'answering' && !avoidSimilarGame.eliminatedIds.includes(clientId) && !isTournamentSpectator"
        class="guess-time-form avoid-similar-form"
        @submit.prevent="submitAvoidSimilarAnswer"
      >
        <label for="avoid-similar-input">Your answer</label>
        <div>
          <input
            id="avoid-similar-input"
            v-model="avoidSimilarInput"
            type="text"
            autocomplete="off"
            maxlength="80"
            placeholder="Type your answer"
            :disabled="avoidSimilarInputLocked || showReactionMenu"
            @input="avoidSimilarInput = normalizeAvoidSimilarInput(avoidSimilarInput)"
          />
          <button class="guess-time-form__lock" type="submit" :disabled="avoidSimilarInputLocked || showReactionMenu">{{ avoidSimilarInputLocked ? 'Locked' : 'Lock answer' }}</button>
        </div>
        <small>{{ avoidSimilarCountdown }} seconds remaining</small>
      </form>

      <section v-if="avoidSimilarGame?.phase === 'evaluation'" class="avoid-similar-evaluation" aria-label="Evaluate player answers">
        <article v-for="player in avoidSimilarGame.players.filter((entry) => avoidSimilarGame.evaluationPlayerIds.includes(entry.playerId))" :key="player.playerId" class="avoid-similar-evaluation__card">
          <strong>{{ player.playerName }}</strong>
          <span>{{ player.answer || 'No answer' }}</span>
          <div v-if="player.playerId !== clientId && !isTournamentSpectator" class="avoid-similar-evaluation__votes" role="group" :aria-label="`Evaluate ${player.playerName}'s answer`">
            <button
              type="button"
              :class="{ 'avoid-similar-evaluation__vote--selected': avoidSimilarMyVotes.get(player.playerId) === 'up' }"
              :aria-pressed="avoidSimilarMyVotes.get(player.playerId) === 'up'"
              :disabled="showReactionMenu"
              @click="voteAvoidSimilar(player.playerId, 'up')"
            >👍 <span>Up</span></button>
            <button
              type="button"
              :class="{ 'avoid-similar-evaluation__vote--selected': avoidSimilarMyVotes.get(player.playerId) === 'down' }"
              :aria-pressed="avoidSimilarMyVotes.get(player.playerId) === 'down'"
              :disabled="showReactionMenu"
              @click="voteAvoidSimilar(player.playerId, 'down')"
            >👎 <span>Down</span></button>
          </div>
          <small v-else-if="player.playerId === clientId">Your answer</small>
        </article>
      </section>

      <TransitionGroup name="reaction-rank" tag="section" class="guess-time-players avoid-similar-players" aria-label="Avoid Similar Answer players">
        <article
          v-for="player in avoidSimilarGame?.players || []"
          :key="player.playerId"
          class="guess-time-player avoid-similar-player"
          :class="{ 'guess-time-player--eliminated': player.eliminated, 'avoid-similar-player--direct-out': player.directEliminated }"
        >
          <span class="reaction-leaderboard__rank">{{ player.rank }}</span>
          <strong>{{ player.playerName }}</strong>
          <span v-if="avoidSimilarGame?.phase === 'answers_locked' && !player.eliminated" class="avoid-similar-player__answer-bubble">{{ player.answer || 'No answer' }}</span>
          <span v-if="player.eliminated">Out</span>
          <span v-else-if="avoidSimilarGame?.phase === 'evaluation'">Evaluating</span>
          <span v-else-if="avoidSimilarGame?.phase === 'vote_results'">{{ player.eliminated ? 'Out' : 'Safe' }}</span>
          <span v-else>{{ avoidSimilarGame?.answeredPlayerIds.includes(player.playerId) ? 'Locked' : 'Thinking' }}</span>
          <small v-if="isRankingFormat">{{ tournamentPoints(player.playerId) }} pts</small>
        </article>
      </TransitionGroup>
    </section>
  </main>

  <main v-else-if="currentView === 'type-it' || gameInstructions?.game?.id === 'type_it'" class="reaction-page type-it-page" aria-labelledby="type-it-title">
    <header class="reaction-page__header">
      <button class="reaction-menu-toggle" type="button" :aria-expanded="showReactionMenu" aria-controls="type-it-game-menu" @click="toggleReactionMenu">&#9881;<span class="sr-only">Game menu</span></button>
      <div>
        <p class="reaction-page__eyebrow">LET'S PLAY!</p>
        <h1 id="type-it-title">Type It</h1>
      </div>
      <div class="reaction-page__round-wrap">
        <p class="reaction-page__round">Round {{ typeItGame?.round ?? 1 }} / {{ typeItGame?.maxRounds ?? 1 }}</p>
        <p v-if="isOvertimeGame" class="reaction-page__overtime">{{ overtimeLabel }}</p>
      </div>
      <section v-if="showReactionMenu" id="type-it-game-menu" class="reaction-menu" aria-label="Game menu">
        <button type="button" @click="resumeReaction">Resume</button>
        <button type="button" @click="openReactionSettings">Settings</button>
        <button class="reaction-menu__quit" type="button" @click="quitActiveGame">Quit</button>
      </section>
    </header>

    <section class="type-it-field" aria-live="polite">
      <p v-if="typeItStatus" class="type-it-field__status">{{ typeItStatus }}</p>
      <div class="type-it-clock-wrap">
        <div class="type-it-clock" :class="{ 'type-it-clock--running': typeItGame?.phase === 'typing' }" :style="typeItClockStyle" aria-label="Round countdown">
          <i class="type-it-clock__hand type-it-clock__hand--minute"></i>
          <i class="type-it-clock__hand type-it-clock__hand--second"></i>
          <b>{{ typeItCountdown ?? 0 }}</b>
        </div>
      </div>

      <div class="type-it-phrase" :class="{ 'type-it-phrase--active': typeItCanType }" role="group" aria-label="Typing phrase" @click="focusTypeItInput">
        <input
          ref="typeItInputRef"
          v-model="typeItInput"
          class="type-it-phrase__capture"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :maxlength="typeItGame?.phrase?.length || 0"
          :disabled="!typeItCanType"
          aria-label="Type the phrase exactly"
          @input="sendTypeItInput"
        />
        <div v-for="(row, rowIndex) in typeItRows" :key="`row-${rowIndex}`" class="type-it-phrase__row">
          <span v-for="word in row" :key="word.key" class="type-it-phrase__word">
            <span v-for="(character, index) in word.word" :key="`${word.start}-${index}`" class="type-it-phrase__character" :class="`type-it-phrase__character--${typeItCharacterState(word.start + index)}`">{{ character }}</span>
          </span>
        </div>
      </div>

      <p v-if="typeItCanType" class="type-it-field__hint">Tap the phrase and type. Spaces, case, and punctuation count.</p>

      <Transition name="type-it-results">
        <section v-if="typeItGame?.phase === 'round_result'" class="type-it-results" aria-label="Round results">
          <article v-for="player in typeItGame?.players || []" :key="player.playerId" class="type-it-results__name" :class="{ 'type-it-results__name--out': player.eliminatedThisRound }">
            <strong>{{ player.playerName }}</strong>
            <small>{{ player.eliminatedThisRound ? 'Out' : 'Safe' }} · {{ player.accuracy?.toFixed?.(2) ?? '0.00' }}% · {{ player.speedSeconds?.toFixed?.(2) ?? '—' }}s</small>
          </article>
        </section>
      </Transition>

      <section class="type-it-players" aria-label="Player typing status">
        <article v-for="player in typeItGame?.players || []" :key="player.playerId" class="type-it-player" :class="{ 'type-it-player--out': player.eliminated, 'type-it-player--finished': player.finished && !player.eliminated }">
          <strong>{{ player.playerName }}</strong>
          <span v-if="['round_result', 'complete'].includes(typeItGame?.phase)">{{ player.eliminatedThisRound || player.eliminated ? 'Out' : 'Safe' }}<small>{{ player.accuracy?.toFixed?.(2) ?? '0.00' }}% · {{ player.speedSeconds?.toFixed?.(2) ?? '—' }}s</small></span>
          <span v-else-if="player.finished">Finished</span>
          <span v-else>{{ player.typedLength }} / {{ typeItGame?.phrase?.length || 0 }}</span>
        </article>
      </section>
    </section>
  </main>

  <main v-else-if="currentView === 'full-water' || gameInstructions?.game?.id === 'full_water'" class="reaction-page full-water-page" aria-labelledby="full-water-title">
    <header class="reaction-page__header">
      <button
        class="reaction-menu-trigger"
        type="button"
        aria-label="Open game menu"
        aria-controls="full-water-game-menu"
        :aria-expanded="showReactionMenu"
        @click="toggleReactionMenu"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div>
        <p>Let's Play!</p>
        <h1 id="full-water-title">Full Water</h1>
      </div>
      <p class="reaction-page__round">Round {{ fullWaterGame?.round ?? 1 }} / {{ fullWaterGame?.maxRounds ?? 1 }}</p>
      <p v-if="isOvertimeGame" class="reaction-page__overtime">{{ overtimeLabel }}</p>

      <section v-if="showReactionMenu" id="full-water-game-menu" class="reaction-menu" aria-label="Game menu">
        <button type="button" @click="resumeReaction">Resume</button>
        <button type="button" @click="openReactionSettings">Settings</button>
        <button class="reaction-menu__quit" type="button" @click="quitActiveGame">Quit</button>
      </section>
    </header>

    <section class="full-water-field" :class="{ 'full-water-field--with-status': fullWaterStatus }" aria-live="polite">
      <p v-if="fullWaterStatus" class="full-water-field__status">{{ fullWaterStatus }}</p>
      <div class="full-water-board">
        <div
          class="full-water-container"
          :class="{
            'full-water-container--near-overflow': fullWaterIsNearOverflow,
            'full-water-container--near-overflow-pouring': fullWaterIsNearOverflow && fullWaterGame?.phase === 'pouring',
            'full-water-container--overflowing': fullWaterGame?.phase === 'overflowing',
          }"
          aria-label="Water container"
        >
          <span class="full-water-container__rim"></span>
          <span v-if="fullWaterIsNearOverflow" class="full-water-container__lip-water" aria-hidden="true"><i></i><b></b></span>
          <span v-if="fullWaterGame?.phase === 'overflowing'" class="full-water-container__overflow-surface" aria-hidden="true"></span>
          <span class="full-water-container__glass">
            <span v-if="fullWaterGame?.phase === 'pouring'" class="full-water-container__pour-stream" aria-hidden="true"></span>
            <span class="full-water-container__limit-ring" aria-hidden="true"></span>
            <span class="full-water-container__liquid" :style="fullWaterFillStyle"><i></i></span>
          </span>
          <span class="full-water-container__base"></span>
          <span class="full-water-container__spill full-water-container__spill--left"></span>
          <span class="full-water-container__spill full-water-container__spill--right"></span>
          <span class="full-water-container__puddle"></span>
          <div v-if="fullWaterBottleVisible" class="full-water-bottle" :class="{ 'full-water-bottle--pouring': fullWaterGame?.phase === 'pouring', 'full-water-bottle--returning': fullWaterBottleReturning }" aria-hidden="true">
            <span class="full-water-bottle__cap"><i v-if="fullWaterGame?.phase === 'pouring'" class="full-water-bottle__stream"></i></span>
            <span class="full-water-bottle__glass"><span class="full-water-bottle__liquid"></span></span>
          </div>
        </div>

        <p v-if="fullWaterGame?.phase === 'warning'" class="full-water-board__warning">AFK warning</p>
        <p v-if="fullWaterGame?.phase === 'overflowing'" class="full-water-board__overflow">Overflow!</p>

        <div v-if="canControlFullWaterPour || canFinishFullWaterTurn" class="full-water-actions">
          <button
            v-if="canControlFullWaterPour"
            class="full-water-pour"
            :class="{ 'full-water-pour--active': fullWaterPourHeld }"
            type="button"
            :aria-label="fullWaterPourHeld ? 'Release to pause pouring' : 'Hold to pour water'"
            @pointerdown.prevent="startFullWaterPour"
            @pointerup="stopFullWaterPour"
            @pointercancel="stopFullWaterPour"
            @keydown.space.prevent="startFullWaterPour"
            @keyup.space.prevent="stopFullWaterPour"
            @keydown.enter.prevent="startFullWaterPour"
            @keyup.enter.prevent="stopFullWaterPour"
          >
            {{ fullWaterPourHeld ? 'Release to Pause' : 'Hold to Pour' }}
          </button>
          <button v-if="canFinishFullWaterTurn" class="full-water-finish" type="button" @click="finishFullWaterTurn">Finish</button>
        </div>
      </div>

      <section class="full-water-players" aria-label="Players">
        <article
          v-for="player in fullWaterGame?.players || []"
          :key="player.playerId"
          :data-full-water-player-id="player.playerId"
          :class="{
            'full-water-player--warning': player.warningCount > 0 && !player.eliminated,
            'full-water-player--current': ['waiting_to_pour', 'pouring'].includes(fullWaterGame?.phase) && player.playerId === fullWaterGame?.currentPlayerId && !player.eliminated,
            'full-water-player--afk-out': player.eliminatedByAfk,
            'full-water-player--out': player.eliminated && !player.eliminatedByAfk,
          }"
        >
          <span class="full-water-player__bottle" aria-hidden="true"><i></i></span>
          <strong>{{ player.playerName }}</strong>
          <span>{{ player.eliminated ? 'Out' : player.playerId === fullWaterGame?.currentPlayerId ? fullWaterGame?.phase === 'pouring' ? 'Pouring' : 'Pour' : 'Safe' }}</span>
          <small v-if="isRankingFormat">{{ tournamentPoints(player.playerId) }} pts</small>
        </article>
      </section>
    </section>
  </main>

  <main v-else-if="currentView === 'impostor-color' || gameInstructions?.game?.id === 'impostor_color'" class="reaction-page impostor-color-page" aria-labelledby="impostor-color-title">
    <header class="reaction-page__header">
      <button
        class="reaction-menu-trigger"
        type="button"
        aria-label="Open game menu"
        aria-controls="impostor-color-game-menu"
        :aria-expanded="showReactionMenu"
        @click="toggleReactionMenu"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div>
        <p>Let's Play!</p>
        <h1 id="impostor-color-title">Impostor Color</h1>
      </div>
      <p class="reaction-page__round">{{ impostorColorGame?.redBottlesPicked ?? 0 }} / {{ impostorColorGame?.totalRedBottles ?? 2 }} red bottles</p>
      <p v-if="isOvertimeGame" class="reaction-page__overtime">{{ overtimeLabel }}</p>

      <section v-if="showReactionMenu" id="impostor-color-game-menu" class="reaction-menu" aria-label="Game menu">
        <button type="button" @click="resumeReaction">Resume</button>
        <button type="button" @click="openReactionSettings">Settings</button>
        <button class="reaction-menu__quit" type="button" @click="quitActiveGame">Quit</button>
      </section>
    </header>

    <section
      class="impostor-color-field"
      :class="{ 'impostor-color-field--with-status': impostorColorStatus }"
      aria-live="polite"
    >
      <p v-if="impostorColorStatus" class="impostor-color-field__status">{{ impostorColorStatus }}</p>
      <div class="impostor-color-board">
        <div class="impostor-color-grid" aria-label="Bottle selection grid">
          <button
            v-for="bottle in impostorColorGame?.bottles || []"
            :key="bottle.index"
            class="impostor-bottle"
            :class="{
              'impostor-bottle--selected': bottle.index === impostorColorGame?.selectedBottleIndex,
              'impostor-bottle--revealed': bottle.state === 'revealed',
              'impostor-bottle--green': bottle.color === 'green',
              'impostor-bottle--red': bottle.color === 'red',
            }"
            type="button"
            :disabled="!canPickImpostorBottle || bottle.state !== 'unpicked'"
            :aria-label="canPickImpostorBottle && bottle.state === 'unpicked' ? `Shake bottle ${bottle.index + 1}` : `Bottle ${bottle.index + 1}`"
            @click="pickImpostorBottle(bottle.index)"
          >
            <span class="impostor-bottle__cap"></span>
            <span class="impostor-bottle__glass"><span class="impostor-bottle__liquid"></span></span>
            <span class="impostor-bottle__number">{{ bottle.index + 1 }}</span>
          </button>
        </div>

        <div v-if="impostorSelectedBottle" class="impostor-bottle impostor-bottle--spotlight" :class="{
          'impostor-bottle--shaking': impostorColorGame?.phase === 'shaking',
          'impostor-bottle--returning': impostorColorGame?.phase === 'returning',
          'impostor-bottle--revealed': impostorSelectedBottle.state === 'revealed',
          'impostor-bottle--green': impostorSelectedBottle.color === 'green',
          'impostor-bottle--red': impostorSelectedBottle.color === 'red',
        }" aria-hidden="true">
          <span class="impostor-bottle__cap"></span>
          <span class="impostor-bottle__glass"><span class="impostor-bottle__liquid"></span></span>
        </div>
        <p v-if="impostorColorGame?.phase === 'aww'" class="impostor-color-aww">Aww...NT!</p>
        <p v-if="impostorColorGame?.phase === 'safe'" class="impostor-color-safe">SAFE</p>
        <p v-if="impostorColorGame?.phase === 'afk_eliminated'" class="impostor-color-afk">
          {{ impostorColorGame?.eliminatedPlayerName }} Eliminated due to AFK
        </p>
        <p v-if="impostorColorGame?.phase === 'farewell'" class="impostor-color-bye">
          Bye<br />{{ impostorColorGame?.farewellNames?.join(', ') }}
        </p>
      </div>

      <section class="impostor-color-players" aria-label="Players">
        <article
          v-for="player in impostorColorGame?.players || []"
          :key="player.playerId"
          :class="{
            'impostor-color-player--warning': player.warningCount > 0 && !player.eliminated,
            'impostor-color-player--current': impostorColorGame?.phase === 'picking'
              && player.playerId === impostorColorGame?.currentPlayerId
              && !player.eliminated,
            'impostor-color-player--afk-out': player.eliminatedByAfk,
            'impostor-color-player--out': player.eliminated && !player.eliminatedByAfk,
          }"
        >
          <strong>{{ player.playerName }}</strong>
          <span>{{ player.eliminated ? 'Out' : player.playerId === impostorColorGame?.currentPlayerId ? 'Choosing' : 'Safe' }}</span>
          <small v-if="isRankingFormat">{{ tournamentPoints(player.playerId) }} pts</small>
        </article>
      </section>
    </section>
  </main>

  <main v-else class="room-page" aria-labelledby="room-title">
    <div class="room-page__backdrop" aria-hidden="true"></div>

    <section class="room-layout">
      <aside class="room-pane room-pane--setup">
        <div class="room-title-row">
          <h1 id="room-title">Game Room</h1>
          <span class="room-title-row__count" :aria-label="`${playerCount} of 10 players joined`">{{ playerCount }} / 10</span>
        </div>

        <div class="room-field">
          <span class="room-field__label">Invite code</span>
          <div class="invite-code">
            <output>{{ inviteCode }}</output>
            <button class="room-action room-action--copy" type="button" @click="copyInviteCode">
              {{ copyLabel }}
            </button>
          </div>
        </div>

        <p class="room-connection" :class="`room-connection--${onlineStatus}`">
          {{ onlineStatus === 'online' ? 'Online room' : onlineStatus === 'connecting' ? 'Connecting…' : 'Offline' }}
        </p>

        <label class="room-field">
          <span class="room-field__label">Mode</span>
          <select v-model="roomMode" :disabled="!isRoomHost || !roomIsLobby" @change="updateRoomSettings">
            <option>Team</option>
            <option>Free For All</option>
            <option>For Fun</option>
          </select>
        </label>

        <label v-if="roomMode !== 'For Fun'" class="room-field">
          <span class="room-field__label">Max Games</span>
          <select v-model="maxGames" :disabled="!isRoomHost || !roomIsLobby" @change="updateRoomSettings">
            <option>3</option>
            <option>5</option>
            <option>8</option>
            <option>10</option>
          </select>
        </label>

        <label class="room-field">
          <span class="room-field__label">Format</span>
          <select v-model="roomFormat" :disabled="!isRoomHost || !roomIsLobby" @change="updateRoomSettings">
            <option>Elimination</option>
            <option>Ranking</option>
          </select>
        </label>

        <label class="manual-games-toggle">
          <input v-model="manualGames" type="checkbox" :disabled="!isRoomHost || !roomIsLobby" @change="updateManualGames" />
          <span>Choose Games Manually</span>
        </label>
        <button
          v-if="manualGames"
          class="room-action room-action--choose-games"
          type="button"
          :disabled="isRoomHost && !roomIsLobby"
          @click="isRoomHost ? openGameChooser() : openGameViewer()"
        >
          {{ isRoomHost ? 'Choose Games' : 'View Games' }}
        </button>

        <div class="room-actions" :class="{ 'room-actions--host': isRoomHost }">
          <button v-if="isRoomHost" class="room-action room-action--start" type="button" :disabled="!canStartGame" @click="sendRoom({ type: 'start_game' })">Start</button>
          <button class="room-action room-action--exit" type="button" @click="exitRoom">Exit</button>
        </div>
        <p v-if="onlineError" class="room-error" role="status">{{ onlineError }}</p>
      </aside>

      <section class="room-pane player-pane" :class="{ 'player-pane--blue': isTeamMode }" aria-label="First player group">
        <h2>{{ isTeamMode ? 'Blue Team' : 'Players 1–5' }}</h2>
        <ol class="player-slots">
          <li v-for="(player, index) in teamOne" :key="`one-${index}`" class="player-slot">
            <button
              v-if="player && isRoomHost && roomIsLobby && player.id !== clientId"
              class="player-slot__number player-slot__number--kick"
              type="button"
              :aria-label="`Remove ${player.name} from the room`"
              @click="kickPlayer(player)"
            >
              {{ index + 1 }}
            </button>
            <span v-else class="player-slot__number">{{ index + 1 }}</span>
            <template v-if="player">
              <input v-if="player.id === clientId || (isRoomHost && player.bot)" v-model.trim="player.name" maxlength="10" :aria-label="`Player ${index + 1} name`" @change="updateRoomName(player)" />
              <span v-else class="player-slot__name">{{ player.name }}</span>
              <button v-if="player.id === clientId && roomIsLobby" class="room-action player-slot__ready" type="button" @click="toggleReady">
                {{ player.ready ? 'Cancel' : 'Ready' }}
              </button>
              <span v-else-if="player.ready" class="player-slot__state">Ready</span>
              <span v-else-if="!player.connected" class="player-slot__state">Reconnecting…</span>
            </template>
            <template v-else>
              <span class="player-slot__placeholder">Waiting for a player...</span>
              <button v-if="isRoomHost && roomIsLobby" class="room-action player-slot__add-bot" type="button" @click="addBot('one', index)">Add bot</button>
            </template>
          </li>
        </ol>
      </section>

      <section class="room-pane player-pane" :class="{ 'player-pane--red': isTeamMode }" aria-label="Second player group">
        <h2>{{ isTeamMode ? 'Red Team' : 'Players 6–10' }}</h2>
        <ol class="player-slots" start="6">
          <li v-for="(player, index) in teamTwo" :key="`two-${index}`" class="player-slot">
            <button
              v-if="player && isRoomHost && roomIsLobby && player.id !== clientId"
              class="player-slot__number player-slot__number--kick"
              type="button"
              :aria-label="`Remove ${player.name} from the room`"
              @click="kickPlayer(player)"
            >
              {{ index + 6 }}
            </button>
            <span v-else class="player-slot__number">{{ index + 6 }}</span>
            <template v-if="player">
              <input v-if="player.id === clientId || (isRoomHost && player.bot)" v-model.trim="player.name" maxlength="10" :aria-label="`Player ${index + 6} name`" @change="updateRoomName(player)" />
              <span v-else class="player-slot__name">{{ player.name }}</span>
              <button v-if="player.id === clientId && roomIsLobby" class="room-action player-slot__ready" type="button" @click="toggleReady">
                {{ player.ready ? 'Cancel' : 'Ready' }}
              </button>
              <span v-else-if="player.ready" class="player-slot__state">Ready</span>
              <span v-else-if="!player.connected" class="player-slot__state">Reconnecting…</span>
            </template>
            <template v-else>
              <span class="player-slot__placeholder">Waiting for a player...</span>
              <button v-if="isRoomHost && roomIsLobby" class="room-action player-slot__add-bot" type="button" @click="addBot('two', index)">Add bot</button>
            </template>
          </li>
        </ol>
      </section>
    </section>

    <div v-if="showGameChooser" class="game-chooser__overlay">
      <section class="game-chooser" role="dialog" aria-modal="true" aria-labelledby="game-chooser-title">
        <header class="game-chooser__header">
          <div>
            <h2 id="game-chooser-title">{{ gameChooserIsReadOnly ? 'Selected Games' : 'Choose Games' }}</h2>
            <p>{{ gameChooserIsReadOnly ? 'The host\'s selected games are shown below.' : `Select up to ${maxGames} games.` }}</p>
          </div>
          <strong>{{ selectedGameCount }} / {{ maxGames }}</strong>
        </header>

        <ul class="game-chooser__list">
          <li v-for="game in gameCatalog" :key="game.id">
            <label
              class="game-chooser__option"
              :class="{
                'game-chooser__option--disabled': !canSelectGame(game.id),
                'game-chooser__option--readonly': gameChooserIsReadOnly,
              }"
            >
              <input
                :checked="selectedGames.includes(game.id)"
                type="checkbox"
                :disabled="gameChooserIsReadOnly || !canSelectGame(game.id)"
                @change="toggleSelectedGame(game.id)"
              />
              <span>{{ game.name }}</span>
              <small v-if="!playableGameIds.has(game.id)">Coming soon</small>
            </label>
          </li>
        </ul>

        <div v-if="gameChooserIsReadOnly" class="game-chooser__actions game-chooser__actions--single">
          <button class="room-action game-chooser__done" type="button" @click="showGameChooser = false">Close</button>
        </div>
        <div v-else class="game-chooser__actions">
          <button class="room-action game-chooser__cancel" type="button" @click="cancelGameChooser">Cancel</button>
          <button class="room-action game-chooser__done" type="button" @click="showGameChooser = false">Done</button>
        </div>
      </section>
    </div>

  </main>

  <div v-if="gameInstructions" class="instructions-dialog__overlay">
    <section
      class="instructions-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructions-dialog-title"
      aria-describedby="instructions-dialog-summary"
    >
      <p class="instructions-dialog__eyebrow">{{ isOvertimeGame ? overtimeLabel : 'Get ready to play' }}</p>
      <h2 id="instructions-dialog-title">{{ gameInstructions.game.name }}</h2>
      <ul id="instructions-dialog-summary" class="instructions-dialog__list">
        <li><strong>Description:</strong> {{ gameInstructions.game.description }}</li>
        <li><strong>Win condition:</strong> {{ gameInstructions.game.winCondition }}</li>
        <li><strong>Lose condition:</strong> {{ gameInstructions.game.loseCondition }}</li>
      </ul>
      <p class="instructions-dialog__countdown" aria-live="polite">
        Game starts in {{ instructionCountdown }} second{{ instructionCountdown === 1 ? '' : 's' }}.
      </p>
      <button
        class="room-action instructions-dialog__close"
        type="button"
        :disabled="instructionsClosedByMe"
        @click="closeInstructions"
      >
        {{ instructionsClosedByMe ? 'Waiting for players…' : 'Close instructions' }}
      </button>
    </section>
  </div>

  <div v-if="gameIntermission" class="instructions-dialog__overlay">
    <section class="instructions-dialog intermission-dialog" role="dialog" aria-modal="true" aria-labelledby="intermission-dialog-title">
      <p class="instructions-dialog__eyebrow">{{ gameIntermission?.overtime ? 'Overtime next' : 'Game complete' }}</p>
      <h2 id="intermission-dialog-title">{{ gameIntermission?.overtime ? 'Overtime Leaderboard' : 'Leaderboard' }}</h2>
      <ol class="intermission-dialog__standings">
        <li
          v-for="(player, index) in onlineRoom?.tournament?.standings || []"
          :key="player.playerId"
          :class="{ 'intermission-dialog__player--eliminated': roomFormat === 'Elimination' && player.eliminated }"
        >
          <strong>{{ index + 1 }}. {{ player.playerName }}</strong>
          <span>{{ roomFormat === 'Ranking' ? `${player.points} pts` : player.eliminated ? 'Eliminated' : 'Active' }}</span>
        </li>
      </ol>
      <p class="instructions-dialog__countdown" aria-live="polite">
        {{ gameIntermission?.overtime ? 'Overtime starts' : 'Next game starts' }} in {{ intermissionCountdown }} second{{ intermissionCountdown === 1 ? '' : 's' }}.
      </p>
      <button class="room-action instructions-dialog__close" type="button" :disabled="intermissionSkippedByMe" @click="skipIntermission">
        {{ intermissionSkippedByMe ? 'Waiting for playersâ€¦' : 'Go to next game' }}
      </button>
    </section>
  </div>

  <div v-if="showTournamentPodium" class="instructions-dialog__overlay podium-overlay">
    <section class="instructions-dialog podium-dialog" role="dialog" aria-modal="true" aria-labelledby="podium-dialog-title">
      <template v-if="roomFormat === 'Elimination'">
        <p class="instructions-dialog__eyebrow">Tournament complete</p>
        <h2 id="podium-dialog-title">The Last Man Standing is</h2>
        <p v-if="noEliminationWinner || podiumElapsed >= 1_500" class="podium-dialog__winner">
          {{ noEliminationWinner ? 'No One!' : onlineRoom?.tournament?.winnerName }}
        </p>
        <div v-if="!noEliminationWinner && podiumElapsed >= 1_500" class="podium-confetti" aria-hidden="true"><i v-for="index in 18" :key="index"></i></div>
      </template>

      <template v-else>
        <p class="instructions-dialog__eyebrow">Tournament complete</p>
        <h2 id="podium-dialog-title">Final Podiums</h2>
        <section
          v-for="(group, groupIndex) in rankingPodiumGroups"
          v-show="groupIndex < rankingPodiumStage"
          :key="group.title"
          class="podium-dialog__group"
          :class="{ 'podium-dialog__group--winners': groupIndex === 0 }"
        >
          <h3>{{ group.title }}</h3>
          <ol>
            <li v-for="player in group.players" :key="player.playerId"><strong>{{ player.playerName }}</strong><span>{{ player.points }} pts</span></li>
            <li v-if="!group.players.length" class="podium-dialog__empty">No players</li>
          </ol>
          <div v-if="groupIndex === 0" class="podium-confetti" aria-hidden="true"><i v-for="index in 18" :key="index"></i></div>
        </section>
      </template>

      <button v-if="podiumExitAvailable" class="room-action instructions-dialog__close" type="button" @click="exitRoom">Exit</button>
    </section>
  </div>
</template>
