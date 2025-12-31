import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const allowedOrigins = [
  process.env.API_URL,
  process.env.API_DEV
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server & health checks
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is running');
});

interface User {
  id: string;
  username: string;
}

interface Message {
  type: 'message' | 'notification';
  user?: string;
  to?: string;
  text: string;
  timestamp: string;
}

const users: Record<string, string> = {};
const messageHistory: Message[] = [];
const MAX_HISTORY = 50;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username: string) => {
    users[socket.id] = username;
    
    // Send global history to user? DISABLED per user request for fresh session
    // socket.emit('history', messageHistory);

    // Notifications disabled per user request
    // const joinMsg: Message = {
    //   type: 'notification',
    //   text: `${username} has joined the chat`,
    //   timestamp: new Date().toISOString()
    // };
    // io.emit('message', joinMsg);
    
    io.emit('users', Object.values(users));
  });

  socket.on('sendMessage', (data: { text: string, to?: string }) => {
    const username = users[socket.id];
    if (username) {
       const msg: Message = {
        type: 'message',
        user: username,
        to: data.to,
        text: data.text,
        timestamp: new Date().toISOString()
      };
      
      if (data.to) {
        // Private Message
        // Find ALL socket IDs for the recipient (handle multiple tabs/reloads)
        const recipientSocketIds = Object.keys(users).filter(id => users[id] === data.to);
        // Find ALL socket IDs for the sender (so they see their own sent message on all tabs)
        const senderSocketIds = Object.keys(users).filter(id => users[id] === username);

        // Deduplicate IDs in case sender IS recipient (talking to self)
        const allTargetIds = [...new Set([...recipientSocketIds, ...senderSocketIds])];

        allTargetIds.forEach(id => {
            io.to(id).emit('message', msg);
        });
        
        console.log(`Private message from ${username} to ${data.to}. Targets: ${allTargetIds.length}`);

      } else {
        // Global Message
        messageHistory.push(msg);
        if (messageHistory.length > MAX_HISTORY) {
            messageHistory.shift();
        }
        io.emit('message', msg);
      }
    }
  });

  socket.on('disconnect', () => {
    const username = users[socket.id];
    if (username) {
      delete users[socket.id];
      // Notifications disabled
      // io.emit('message', {
      //   type: 'notification',
      //   text: `${username} has left the chat`,
      //   timestamp: new Date().toISOString()
      // });
      io.emit('users', Object.values(users));
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
