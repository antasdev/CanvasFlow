import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: {
    token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YTZiOTRhYzdkMzZhOTMxYzEwYzU3ZDEiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc4NTY3Mzg5MSwiZXhwIjoxNzg1Njc0NzkxfQ.z9yRHgRee32VGkWGTst9dYAOTw8IE1Ay_C1rF5wIj20",
  },
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);

  socket.emit("board:join", {
    boardId: "6a6e08636bbb21750acca3c5",
  });

 socket.emit("shape:delete", {
  shapeId: "6a6f2d6b6a5bcb65a58bcc84",
});
});

socket.on("shape:deleted", (payload) => {
  console.log("Shape deleted:", payload);
});

socket.on("error", (message) => {
  console.log("Socket error:", message);
});