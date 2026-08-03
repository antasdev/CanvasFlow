import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: {
    token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YTZiOTRhYzdkMzZhOTMxYzEwYzU3ZDEiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc4NTc2MDkxNSwiZXhwIjoxNzg1NzYxODE1fQ.JnbmzO_JbvpAia-u_yqWLPsMlAuYKV3FFRl3W590dTY",
  },
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);

  socket.emit("board:join", {
  boardId: "6a6e08636bbb21750acca3c5",
  canvasId: "6a6e09066bbb21750acca3c7",
});
socket.on("canvas:sync", (payload) => {
  console.log(
    "Canvas synchronized:",
    payload
  );
});
 socket.emit("cursor:move", {
  boardId: "6a6e08636bbb21750acca3c5",
  position: {
    x: 250,
    y: 150,
  },
});
});

socket.on("cursor:moved", (payload) => {
  console.log("Cursor moved:", payload);
});


socket.on("user:joined", (payload) => {
  console.log("User joined:", payload);
});

socket.on("user:left", (payload) => {
  console.log("User left:", payload);
});

socket.on("connect_error", (err) => {
  console.log("Connect Error:", err.message);
});

socket.on("error", (message) => {
  console.log("Socket error:", message);
});