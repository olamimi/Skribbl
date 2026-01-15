const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const WORDS = [
  "cat",
  "dog",
  "house",
  "tree",
  "car",
  "sun",
  "moon",
  "phone",
  "pizza",
  "star"
];

function createRoom(roomId) {
  const room = {
    roomId,
    players: [],
    currentDrawerIndex: 0,
    word: null,
    scores: {},
    round: 0,
    maxRounds: 5
  };
  rooms.set(roomId, room);
  return room;
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    return createRoom(roomId);
  }
  return rooms.get(roomId);
}

function removePlayerFromRooms(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    const index = room.players.findIndex((p) => p.id === socketId);
    if (index !== -1) {
      const [removed] = room.players.splice(index, 1);
      delete room.scores[removed.id];
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        if (room.currentDrawerIndex >= room.players.length) {
          room.currentDrawerIndex = 0;
        }
        io.to(roomId).emit("roomState", serializeRoom(room));
      }
      break;
    }
  }
}

function pickWord() {
  const index = Math.floor(Math.random() * WORDS.length);
  return WORDS[index];
}

function startNextTurn(room) {
  if (!room || room.players.length === 0) {
    return;
  }

  room.round += 1;
  if (room.round > room.maxRounds) {
    io.to(room.roomId).emit("gameOver", {
      scores: room.scores
    });
    room.round = 0;
    room.currentDrawerIndex = 0;
    room.word = null;
    return;
  }

  if (room.currentDrawerIndex >= room.players.length) {
    room.currentDrawerIndex = 0;
  }

  const drawer = room.players[room.currentDrawerIndex];
  room.word = pickWord();

  room.players.forEach((p) => {
    p.guessed = false;
  });

  io.to(room.roomId).emit("newTurn", {
    roomId: room.roomId,
    drawerId: drawer.id,
    drawerName: drawer.name,
    round: room.round,
    maxRounds: room.maxRounds,
    wordLength: room.word.length
  });

  io.to(drawer.id).emit("yourWord", {
    word: room.word
  });
}

function serializeRoom(room) {
  return {
    roomId: room.roomId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      guessed: p.guessed || false,
      isDrawer:
        room.players[room.currentDrawerIndex] &&
        room.players[room.currentDrawerIndex].id === p.id
    })),
    scores: room.scores,
    round: room.round,
    maxRounds: room.maxRounds
  };
}

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ roomId, playerName }) => {
    if (!roomId || !playerName) {
      return;
    }

    const room = getOrCreateRoom(roomId);
    if (!room.players.find((p) => p.id === socket.id)) {
      const player = {
        id: socket.id,
        name: playerName,
        guessed: false
      };
      room.players.push(player);
      if (!room.scores[player.id]) {
        room.scores[player.id] = 0;
      }
    }

    socket.join(roomId);

    io.to(roomId).emit("roomState", serializeRoom(room));
  });

  socket.on("startGame", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }
    room.round = 0;
    room.currentDrawerIndex = 0;
    startNextTurn(room);
  });

  socket.on("nextTurn", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }
    room.currentDrawerIndex += 1;
    startNextTurn(room);
  });

  socket.on("draw", (data) => {
    const { roomId } = data;
    if (!roomId) {
      return;
    }
    socket.to(roomId).emit("draw", data);
  });

  socket.on("guessWord", ({ roomId, guess }) => {
    const room = rooms.get(roomId);
    if (!room || !guess) {
      return;
    }

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) {
      return;
    }

    const normalizedGuess = String(guess).trim().toLowerCase();

    const isCorrect =
      room.word &&
      normalizedGuess.length > 0 &&
      normalizedGuess === room.word.toLowerCase();

    io.to(roomId).emit("chatMessage", {
      playerId: player.id,
      playerName: player.name,
      message: guess
    });

    if (isCorrect && !player.guessed) {
      player.guessed = true;
      room.scores[player.id] = (room.scores[player.id] || 0) + 100;

      io.to(roomId).emit("correctGuess", {
        playerId: player.id,
        playerName: player.name,
        scores: room.scores
      });

      io.to(roomId).emit("roomState", serializeRoom(room));

      const nonDrawers = room.players.filter(
        (p, index) => index !== room.currentDrawerIndex
      );
      const allGuessed = nonDrawers.length > 0 && nonDrawers.every((p) => p.guessed);

      if (allGuessed) {
        room.currentDrawerIndex += 1;
        startNextTurn(room);
      }
    }
  });

  socket.on("disconnect", () => {
    removePlayerFromRooms(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
