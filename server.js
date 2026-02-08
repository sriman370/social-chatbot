const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Import models
const User = require('./models/User');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Store active users and their socket connections
const activeUsers = new Map();
const activeCalls = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  // User joins
  socket.on('user:join', async (userId) => {
    try {
      activeUsers.set(userId, socket.id);
      socket.userId = userId;
      
      // Update user status to online
      await User.findByIdAndUpdate(userId, { 
        status: 'online',
        lastSeen: new Date()
      });

      // Broadcast to all users that this user is online
      io.emit('user:status', { userId, status: 'online' });
      
      console.log(`✅ User ${userId} joined`);
    } catch (error) {
      console.error('Error in user:join:', error);
    }
  });

  // Send message
  socket.on('message:send', async (data) => {
    try {
      const { senderId, receiverId, text, conversationId } = data;

      // Create new message
      const message = new Message({
        conversation: conversationId,
        sender: senderId,
        text,
        timestamp: new Date()
      });
      await message.save();

      // Update conversation's last message
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        updatedAt: new Date()
      });

      // Emit to receiver if they're online
      const receiverSocketId = activeUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('message:received', {
          message: message,
          conversationId
        });
      }

      // Confirm to sender
      socket.emit('message:sent', { message });
      
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message:error', { error: 'Failed to send message' });
    }
  });

  // Typing indicator
  socket.on('typing:start', (data) => {
    const { receiverId, senderId } = data;
    const receiverSocketId = activeUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing:update', { userId: senderId, isTyping: true });
    }
  });

  socket.on('typing:stop', (data) => {
    const { receiverId, senderId } = data;
    const receiverSocketId = activeUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing:update', { userId: senderId, isTyping: false });
    }
  });

  // WebRTC Signaling for Voice/Video Calls
  
  // Initiate call
  socket.on('call:initiate', (data) => {
    const { callerId, receiverId, callType } = data; // callType: 'audio' or 'video'
    const receiverSocketId = activeUsers.get(receiverId);
    
    if (receiverSocketId) {
      const callId = `${callerId}-${receiverId}-${Date.now()}`;
      activeCalls.set(callId, { callerId, receiverId, callType, status: 'ringing' });
      
      io.to(receiverSocketId).emit('call:incoming', {
        callId,
        callerId,
        callerName: data.callerName,
        callType
      });
      
      socket.emit('call:initiated', { callId });
    } else {
      socket.emit('call:error', { error: 'User is offline' });
    }
  });

  // Accept call
  socket.on('call:accept', (data) => {
    const { callId } = data;
    const call = activeCalls.get(callId);
    
    if (call) {
      call.status = 'active';
      const callerSocketId = activeUsers.get(call.callerId);
      
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:accepted', { callId });
      }
    }
  });

  // Reject call
  socket.on('call:reject', (data) => {
    const { callId } = data;
    const call = activeCalls.get(callId);
    
    if (call) {
      const callerSocketId = activeUsers.get(call.callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:rejected', { callId });
      }
      activeCalls.delete(callId);
    }
  });

  // End call
  socket.on('call:end', (data) => {
    const { callId } = data;
    const call = activeCalls.get(callId);
    
    if (call) {
      // Notify the other party
      const otherUserId = socket.userId === call.callerId ? call.receiverId : call.callerId;
      const otherSocketId = activeUsers.get(otherUserId);
      
      if (otherSocketId) {
        io.to(otherSocketId).emit('call:ended', { callId });
      }
      
      activeCalls.delete(callId);
    }
  });

  // WebRTC signaling - exchange ICE candidates and SDP offers/answers
  socket.on('webrtc:offer', (data) => {
    const { receiverId, offer, callId } = data;
    const receiverSocketId = activeUsers.get(receiverId);
    
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('webrtc:offer', {
        offer,
        callId,
        senderId: socket.userId
      });
    }
  });

  socket.on('webrtc:answer', (data) => {
    const { receiverId, answer, callId } = data;
    const receiverSocketId = activeUsers.get(receiverId);
    
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('webrtc:answer', {
        answer,
        callId,
        senderId: socket.userId
      });
    }
  });

  socket.on('webrtc:ice-candidate', (data) => {
    const { receiverId, candidate, callId } = data;
    const receiverSocketId = activeUsers.get(receiverId);
    
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('webrtc:ice-candidate', {
        candidate,
        callId,
        senderId: socket.userId
      });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    console.log('🔌 Client disconnected:', socket.id);
    
    if (socket.userId) {
      try {
        // Update user status to offline
        await User.findByIdAndUpdate(socket.userId, { 
          status: 'offline',
          lastSeen: new Date()
        });

        // Remove from active users
        activeUsers.delete(socket.userId);
        
        // Broadcast offline status
        io.emit('user:status', { userId: socket.userId, status: 'offline' });

        // End any active calls
        activeCalls.forEach((call, callId) => {
          if (call.callerId === socket.userId || call.receiverId === socket.userId) {
            const otherUserId = call.callerId === socket.userId ? call.receiverId : call.callerId;
            const otherSocketId = activeUsers.get(otherUserId);
            
            if (otherSocketId) {
              io.to(otherSocketId).emit('call:ended', { callId, reason: 'disconnect' });
            }
            
            activeCalls.delete(callId);
          }
        });
      } catch (error) {
        console.error('Error in disconnect:', error);
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeUsers: activeUsers.size,
    activeCalls: activeCalls.size 
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = { app, io };
