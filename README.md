# Flush Rush Server

WebSocket server for the Flush Rush multiplayer bathroom battle royale game.

## Features

- Real-time multiplayer with Socket.IO
- Room-based game sessions
- Player queue management
- Mini-game coordination
- Sabotage system with effects
- Energy regeneration
- Victory condition handling
- Connection health monitoring

## Setup

1. Install dependencies:
\`\`\`bash
cd server
npm install
\`\`\`

2. Start the server:
\`\`\`bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
\`\`\`

The server will run on port 3001 by default.

## API Endpoints

### Health Check
- `GET /health` - Server health and statistics

## Socket Events

### Client to Server

- `joinGame` - Join a game room
  \`\`\`js
  socket.emit('joinGame', {
    name: 'Player Name',
    avatar: '🚽',
    roomId: 'optional-room-id'
  });
  \`\`\`

- `startGame` - Start the game (if in lobby)
- `miniGameScore` - Update mini-game score
  \`\`\`js
  socket.emit('miniGameScore', { score: 100 });
  \`\`\`

- `sabotage` - Perform sabotage action
  \`\`\`js
  socket.emit('sabotage', {
    targetId: 'target-player-id',
    sabotageType: 'mystery-smell'
  });
  \`\`\`

### Server to Client

- `playerJoined` - Confirmation of joining
- `playersUpdate` - Updated player list and positions
- `gameStateUpdate` - Game state changes
- `miniGameStart` - Mini-game begins
- `miniGameEnd` - Mini-game results
- `sabotageEvent` - Sabotage action occurred
- `gameEnd` - Game finished with winner

## Game Flow

1. **Lobby Phase**: Players join and wait
2. **Game Start**: Timer begins, mini-games scheduled
3. **Mini-Games**: Random games every 10-20 seconds
4. **Sabotage**: Players can sabotage others using energy
5. **Victory**: First player to reach front and win final challenge

## Room Management

- Rooms are created automatically when players join
- Empty rooms are cleaned up when all players leave
- Default room is 'default' if no roomId specified

## Configuration

Environment variables:
- `PORT` - Server port (default: 3001)

## Logging

The server logs:
- Player connections/disconnections
- Game state changes
- Mini-game events
- Sabotage actions
- Room management

## Testing

You can test the server by opening multiple browser tabs to simulate different players joining the same game room.
