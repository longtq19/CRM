import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { connectDB } from './config/database';
import { initSocket } from './socket';
import { initLogCleanup } from './cron/logCleanup';
import { initContractExpiryReminder } from './cron/contractExpiryReminder';
import { initLeadDistributionCron } from './cron/leadDistribution';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();

  initSocket(io);
  initLogCleanup();
  initContractExpiryReminder();
  initLeadDistributionCron();

  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[HCRM] Failed to start server:", err);
  process.exit(1);
});
