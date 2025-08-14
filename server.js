const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const cors = require("cors")

const app = express()
const server = http.createServer(app)

const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://flush-rush.onrender.com", // Add your Render frontend URL here
      /\.vercel\.app$/, // Allow Vercel deployments
      /\.onrender\.com$/, // Allow Render deployments
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
})

// Middleware
app.use(cors())
app.use(express.json())

// Game state management
class GameRoom {
  constructor(id) {
    this.id = id
    this.players = new Map()
    this.gameState = "lobby" // lobby, playing, ended
    this.currentMiniGame = null
    this.miniGameTimer = null
    this.gameTimer = 0
    this.gameInterval = null
  }

  addPlayer(socket, playerData) {
    const player = {
      id: socket.id,
      socketId: socket.id,
      name: playerData.name,
      avatar: playerData.avatar,
      position: this.players.size,
      energy: 100,
      isConnected: true,
      score: 0,
      sabotageEffects: [],
    }

    this.players.set(socket.id, player)
    socket.join(this.id)

    console.log(`Player ${player.name} joined room ${this.id}`)
    this.broadcastPlayerUpdate()

    return player
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId)
    if (player) {
      console.log(`Player ${player.name} left room ${this.id}`)
      this.players.delete(socketId)
      this.rebalancePositions()
      this.broadcastPlayerUpdate()
    }
  }

  rebalancePositions() {
    const playerArray = Array.from(this.players.values())
    playerArray.sort((a, b) => a.position - b.position)

    playerArray.forEach((player, index) => {
      player.position = index
      this.players.set(player.id, player)
    })
  }

  startGame() {
    if (this.gameState !== "lobby") return

    this.gameState = "playing"
    this.gameTimer = 0

    // Start game timer
    this.gameInterval = setInterval(() => {
      this.gameTimer++
      this.broadcastGameState()
    }, 1000)

    // Start mini-game timer
    this.scheduleMiniGame()

    // Start energy regeneration
    this.startEnergyRegeneration()

    console.log(`Game started in room ${this.id}`)
    this.broadcastGameState()
  }

  scheduleMiniGame() {
    if (this.gameState !== "playing") return

    const delay = 10000 + Math.random() * 10000 // 10-20 seconds

    this.miniGameTimer = setTimeout(() => {
      this.triggerMiniGame()
    }, delay)
  }

  triggerMiniGame() {
    if (this.gameState !== "playing" || this.players.size === 0) return

    const games = ["plunger-toss", "toilet-paper-dash", "soap-bubble-match"]
    const selectedGame = games[Math.floor(Math.random() * games.length)]

    this.currentMiniGame = {
      type: selectedGame,
      startTime: Date.now(),
      duration: 15000, // 15 seconds
      participants: Array.from(this.players.keys()),
      scores: {},
    }

    console.log(`Mini-game started: ${selectedGame} in room ${this.id}`)

    // Broadcast mini-game start
    io.to(this.id).emit("miniGameStart", {
      gameType: selectedGame,
      duration: 15000,
    })

    // End mini-game after duration
    setTimeout(() => {
      this.endMiniGame()
    }, 15000)
  }

  endMiniGame() {
    if (!this.currentMiniGame) return

    // Determine winner
    const scores = Object.entries(this.currentMiniGame.scores)
    if (scores.length > 0) {
      scores.sort(([, a], [, b]) => b - a)
      const winnerId = scores[0][0]

      // Move winner forward in queue
      this.movePlayerForward(winnerId)
    }

    // Broadcast results
    io.to(this.id).emit("miniGameEnd", {
      scores: this.currentMiniGame.scores,
      winner: scores.length > 0 ? scores[0][0] : null,
    })

    this.currentMiniGame = null

    // Schedule next mini-game
    this.scheduleMiniGame()

    // Check for victory condition
    this.checkVictoryCondition()
  }

  movePlayerForward(playerId) {
    const player = this.players.get(playerId)
    if (!player || player.position === 0) return

    // Find player in front
    const playerInFront = Array.from(this.players.values()).find((p) => p.position === player.position - 1)

    if (playerInFront) {
      // Swap positions
      const tempPosition = player.position
      player.position = playerInFront.position
      playerInFront.position = tempPosition

      this.players.set(playerId, player)
      this.players.set(playerInFront.id, playerInFront)
    }

    this.broadcastPlayerUpdate()
  }

  checkVictoryCondition() {
    const leader = Array.from(this.players.values()).find((p) => p.position === 0)

    if (leader && Math.random() > 0.8) {
      // 20% chance to win when in first place
      this.endGame(leader)
    }
  }

  endGame(winner) {
    this.gameState = "ended"

    // Clear timers
    if (this.gameInterval) {
      clearInterval(this.gameInterval)
      this.gameInterval = null
    }
    if (this.miniGameTimer) {
      clearTimeout(this.miniGameTimer)
      this.miniGameTimer = null
    }

    console.log(`Game ended in room ${this.id}. Winner: ${winner.name}`)

    // Broadcast victory
    io.to(this.id).emit("gameEnd", {
      winner: winner,
      finalScores: Array.from(this.players.values()).sort((a, b) => a.position - b.position),
    })
  }

  handleSabotage(attackerId, targetId, sabotageType) {
    const attacker = this.players.get(attackerId)
    const target = this.players.get(targetId)

    if (!attacker || !target) return false

    const sabotageData = {
      "mystery-smell": { cost: 20, duration: 5000 },
      "phantom-flush": { cost: 30, duration: 4000 },
      "drip-of-doom": { cost: 25, duration: 6000 },
    }

    const sabotage = sabotageData[sabotageType]
    if (!sabotage || attacker.energy < sabotage.cost) return false

    // Deduct energy
    attacker.energy -= sabotage.cost
    this.players.set(attackerId, attacker)

    // Apply sabotage effect
    const effect = {
      id: Math.random().toString(36).substr(2, 9),
      type: sabotageType,
      startTime: Date.now(),
      duration: sabotage.duration,
      attackerId: attackerId,
    }

    target.sabotageEffects.push(effect)
    this.players.set(targetId, target)

    console.log(`${attacker.name} sabotaged ${target.name} with ${sabotageType}`)

    // Broadcast sabotage event
    io.to(this.id).emit("sabotageEvent", {
      attacker: attacker,
      target: target,
      sabotageType: sabotageType,
      effect: effect,
    })

    // Remove effect after duration
    setTimeout(() => {
      const currentTarget = this.players.get(targetId)
      if (currentTarget) {
        currentTarget.sabotageEffects = currentTarget.sabotageEffects.filter((e) => e.id !== effect.id)
        this.players.set(targetId, currentTarget)
      }
    }, sabotage.duration)

    this.broadcastPlayerUpdate()
    return true
  }

  startEnergyRegeneration() {
    const energyInterval = setInterval(() => {
      if (this.gameState !== "playing") {
        clearInterval(energyInterval)
        return
      }

      // Regenerate energy for all players
      for (const [playerId, player] of this.players) {
        if (player.energy < 100) {
          player.energy = Math.min(100, player.energy + 2)
          this.players.set(playerId, player)
        }
      }

      this.broadcastPlayerUpdate()
    }, 1000)
  }

  broadcastPlayerUpdate() {
    const playerArray = Array.from(this.players.values()).sort((a, b) => a.position - b.position)

    io.to(this.id).emit("playersUpdate", playerArray)
  }

  broadcastGameState() {
    io.to(this.id).emit("gameStateUpdate", {
      gameState: this.gameState,
      gameTimer: this.gameTimer,
      currentMiniGame: this.currentMiniGame,
      playerCount: this.players.size,
    })
  }
}

// Room management
const rooms = new Map()
const playerRooms = new Map() // Track which room each player is in

function getOrCreateRoom(roomId = "default") {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new GameRoom(roomId))
  }
  return rooms.get(roomId)
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`)

  // Player joins game
  socket.on("joinGame", (playerData) => {
    try {
      const roomId = playerData.roomId || "default"
      const room = getOrCreateRoom(roomId)

      const player = room.addPlayer(socket, playerData)
      playerRooms.set(socket.id, roomId)

      // Send player their data
      socket.emit("playerJoined", player)

      // Send current game state
      socket.emit("gameStateUpdate", {
        gameState: room.gameState,
        gameTimer: room.gameTimer,
        currentMiniGame: room.currentMiniGame,
        playerCount: room.players.size,
      })
    } catch (error) {
      console.error("Error joining game:", error)
      socket.emit("error", { message: "Failed to join game" })
    }
  })

  // Start game
  socket.on("startGame", () => {
    const roomId = playerRooms.get(socket.id)
    if (roomId) {
      const room = rooms.get(roomId)
      if (room) {
        room.startGame()
      }
    }
  })

  // Mini-game score update
  socket.on("miniGameScore", (data) => {
    const roomId = playerRooms.get(socket.id)
    if (roomId) {
      const room = rooms.get(roomId)
      if (room && room.currentMiniGame) {
        room.currentMiniGame.scores[socket.id] = data.score

        // Broadcast score update
        io.to(roomId).emit("miniGameScoreUpdate", {
          playerId: socket.id,
          score: data.score,
          gameType: room.currentMiniGame.type,
        })
      }
    }
  })

  // Sabotage action
  socket.on("sabotage", (data) => {
    const roomId = playerRooms.get(socket.id)
    if (roomId) {
      const room = rooms.get(roomId)
      if (room) {
        const success = room.handleSabotage(socket.id, data.targetId, data.sabotageType)
        socket.emit("sabotageResult", { success })
      }
    }
  })

  // Player movement (for queue position changes)
  socket.on("movePlayer", (data) => {
    const roomId = playerRooms.get(socket.id)
    if (roomId) {
      const room = rooms.get(roomId)
      if (room && data.direction) {
        // Handle player movement logic here if needed
        room.broadcastPlayerUpdate()
      }
    }
  })

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`)

    const roomId = playerRooms.get(socket.id)
    if (roomId) {
      const room = rooms.get(roomId)
      if (room) {
        room.removePlayer(socket.id)

        // Clean up empty rooms
        if (room.players.size === 0) {
          rooms.delete(roomId)
          console.log(`Room ${roomId} deleted (empty)`)
        }
      }
      playerRooms.delete(socket.id)
    }
  })

  // Ping/pong for connection health
  socket.on("ping", () => {
    socket.emit("pong")
  })
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    rooms: rooms.size,
    totalPlayers: Array.from(rooms.values()).reduce((sum, room) => sum + room.players.size, 0),
    uptime: process.uptime(),
  })
})

// Start server
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`🚽 Flush Rush Server running on port ${PORT}`)
  console.log(`🎮 Ready for bathroom battle royale!`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully")
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})
