const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:8081",
    methods: ["GET", "POST"],
  },
});

let rooms = {};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        moves: {},
        scores: {},
        rounds: 0,
        roundInProgress: false,
      };
    }

    rooms[roomId].players.push(socket.id);
    rooms[roomId].scores[socket.id] = 0;

    console.log(`Player ${socket.id} joined room ${roomId}`);
    console.log("Current players in room:", rooms[roomId].players);

    if (rooms[roomId].players.length === 2) {
      console.log(`Room ${roomId} is full. Starting game...`);
      io.to(roomId).emit("start-game", "Game starting!");
      startRound(roomId);
    }

    if (rooms[roomId].players.length > 2) {
      console.log(`Room ${roomId} is full. Rejecting ${socket.id}`);
      socket.emit(
        "room-full",
        "Room is already full. Please try another room."
      );
      socket.disconnect();
    }
  });

  socket.on("player-move", ({ roomId, move }) => {
    const room = rooms[roomId];
    if (!room || !room.roundInProgress) {
      console.error(`Invalid move from player ${socket.id} in room ${roomId}`);
      return;
    }

    room.moves[socket.id] = move;
    console.log(`Player ${socket.id} made a move: ${move}`);

    if (Object.keys(room.moves).length === 2) {
      room.roundInProgress = false;

      const [player1, player2] = room.players;
      const move1 = room.moves[player1];
      const move2 = room.moves[player2];

      let roundResult;
      let winner;

      if (move1 === move2) {
        roundResult = "draw";
      } else if (
        (move1 === "rock" && move2 === "scissors") ||
        (move1 === "paper" && move2 === "rock") ||
        (move1 === "scissors" && move2 === "paper")
      ) {
        roundResult = player1;
        room.scores[player1]++;
        winner = player1;
      } else {
        roundResult = player2;
        room.scores[player2]++;
        winner = player2;
      }

      room.rounds++;
      room.moves = {};

      io.to(roomId).emit("round-result", {
        roundResult,
        winnerSocketId: winner,
        scores: room.scores,
        rounds: room.rounds,
      });

      if (room.rounds === 5) {
        const score1 = room.scores[player1];
        const score2 = room.scores[player2];
        let gameResult;

        if (score1 === score2) {
          gameResult = "draw";
        } else if (score1 > score2) {
          gameResult = player1;
        } else {
          gameResult = player2;
        }

        io.to(roomId).emit("game-result", {
          gameResult,
          winnerSocketId: gameResult,
          scores: room.scores,
        });
        delete rooms[roomId];
      } else {
        startRound(roomId);
      }
    }
  });

  function startRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    room.roundInProgress = true;
    const roundDuration = 5;
    io.to(roomId).emit("start-round", { roundDuration: roundDuration });
  }

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter((id) => id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
