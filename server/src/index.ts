import { createServer } from "http";

import mongoose from "mongoose";

import app from "./app";
import env from "./config/env";
import connectDatabase from "./config/database";

import { initializeSocket } from "./socket";

const httpServer = createServer(app);

const startServer = async (): Promise<void> => {
  await connectDatabase();

  initializeSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(
      `Server running on http://localhost:${env.PORT}`
    );
  });
};

startServer();


// Listen for the SIGINT signal (triggered when we press Ctrl + C)
process.on("SIGINT", async () => {
  // Close the MongoDB connection gracefully before shutting down
  await mongoose.connection.close();

  // Log a message to confirm the database connection is closed
  console.log("🛑 MongoDB connection closed");

  // Exit the Node.js process with status code 0 (successful shutdown)
  process.exit(0);
});