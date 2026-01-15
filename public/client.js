const socket = io();

let currentRoomId = null;
let currentPlayerId = null;
let isDrawer = false;
let currentWord = null;

const lobbyEl = document.getElementById("lobby");
const gameEl = document.getElementById("game");
const nameInput = document.getElementById("name-input");
const roomInput = document.getElementById("room-input");
const joinBtn = document.getElementById("join-btn");
const gameControls = document.getElementById("game-controls");
const roleLabel = document.getElementById("role-label");
const startBtn = document.getElementById("start-btn");
const roundLabel = document.getElementById("round-label");
const wordLabel = document.getElementById("word-label");
const wordReveal = document.getElementById("word-reveal");
const playersEl = document.getElementById("players");
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let drawing = false;
let lastX = 0;
let lastY = 0;

function appendChatLine(text, variant) {
  const line = document.createElement("div");
  if (variant === "system") {
    line.style.color = "#9ca3af";
  }
  if (variant === "success") {
    line.style.color = "#22c55e";
  }
  line.textContent = text;
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function drawLineSegment(x0, y0, x1, y1, color = "#111827", size = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function handlePointerDown(x, y) {
  if (!isDrawer) {
    return;
  }
  drawing = true;
  lastX = x;
  lastY = y;
}

function handlePointerMove(x, y) {
  if (!drawing || !isDrawer) {
    return;
  }
  drawLineSegment(lastX, lastY, x, y);
  if (currentRoomId) {
    socket.emit("draw", {
      roomId: currentRoomId,
      x0: lastX,
      y0: lastY,
      x1: x,
      y1: y
    });
  }
  lastX = x;
  lastY = y;
}

function handlePointerUp() {
  drawing = false;
}

canvas.addEventListener("mousedown", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  handlePointerDown(x, y);
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  handlePointerMove(x, y);
});

window.addEventListener("mouseup", () => {
  handlePointerUp();
});

canvas.addEventListener(
  "touchstart",
  (event) => {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    handlePointerDown(x, y);
  },
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  (event) => {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    handlePointerMove(x, y);
    event.preventDefault();
  },
  { passive: false }
);

window.addEventListener(
  "touchend",
  () => {
    handlePointerUp();
  },
  { passive: false }
);

joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  let roomId = roomInput.value.trim();
  if (!name) {
    alert("Enter a name first");
    return;
  }
  if (!roomId) {
    roomId = Math.random().toString(36).slice(2, 7);
    roomInput.value = roomId;
  }

  currentRoomId = roomId;
  socket.emit("joinRoom", { roomId, playerName: name });
});

startBtn.addEventListener("click", () => {
  if (!currentRoomId) {
    return;
  }
  socket.emit("startGame", { roomId: currentRoomId });
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentRoomId) {
    return;
  }
  const message = chatInput.value.trim();
  if (!message) {
    return;
  }
  socket.emit("guessWord", { roomId: currentRoomId, guess: message });
  chatInput.value = "";
});

socket.on("connect", () => {
  currentPlayerId = socket.id;
});

socket.on("roomState", (state) => {
  if (!state) {
    return;
  }

  lobbyEl.style.display = "none";
  gameEl.style.display = "flex";
  gameControls.style.display = "flex";

  const players = state.players || [];
  playersEl.innerHTML = "";
  players.forEach((p) => {
    const row = document.createElement("div");
    row.className = "player";
    if (p.isDrawer) {
      row.classList.add("drawer");
    }
    if (p.guessed) {
      row.classList.add("guessed");
    }

    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.name;

    const rightSpan = document.createElement("span");
    const score = state.scores && state.scores[p.id] ? state.scores[p.id] : 0;
    rightSpan.textContent = score;
    rightSpan.className = "badge";

    row.appendChild(nameSpan);
    row.appendChild(rightSpan);
    playersEl.appendChild(row);
  });

  roundLabel.textContent = `${state.round} / ${state.maxRounds}`;

  const drawer = players.find((p) => p.isDrawer);
  isDrawer = drawer ? drawer.id === currentPlayerId : false;
  roleLabel.textContent = isDrawer ? "You are drawing" : "You are guessing";

  if (!isDrawer) {
    wordReveal.textContent = "";
    if (state.round === 0) {
      wordLabel.textContent = "?";
    }
  }
});

socket.on("draw", (data) => {
  if (!data) {
    return;
  }
  drawLineSegment(data.x0, data.y0, data.x1, data.y1);
});

socket.on("newTurn", (payload) => {
  if (!payload) {
    return;
  }
  clearCanvas();
  currentWord = null;
  roundLabel.textContent = `${payload.round} / ${payload.maxRounds}`;
  const blanks = Array.from({ length: payload.wordLength })
    .map(() => "_")
    .join(" ");
  wordLabel.textContent = blanks;
  appendChatLine(
    `New turn: ${payload.drawerName} is drawing (${payload.wordLength} letters)`,
    "system"
  );
});

socket.on("yourWord", ({ word }) => {
  currentWord = word;
  wordReveal.textContent = `Your word: ${word}`;
  wordLabel.textContent = word;
});

socket.on("chatMessage", ({ playerName, message }) => {
  appendChatLine(`${playerName}: ${message}`);
});

socket.on("correctGuess", ({ playerName, scores }) => {
  appendChatLine(`${playerName} guessed the word!`, "success");
});

socket.on("gameOver", ({ scores }) => {
  appendChatLine("Game over!", "system");
  if (!scores) {
    return;
  }
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return;
  }
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const lines = sorted.map(([id, score]) => `${id.slice(0, 4)}: ${score}`);
  appendChatLine(`Final scores: ${lines.join(", ")}`, "system");
});
