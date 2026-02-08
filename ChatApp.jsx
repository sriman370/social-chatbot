import React, { useState, useRef, useEffect } from 'react';
import { Phone, Video, Send, Mic, MicOff, VideoOff as VideoOffIcon, PhoneOff, Menu, Search, MessageCircle, LogOut, User, Settings, TestTube } from 'lucide-react';
import io from 'socket.io-client';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const ChatApp = () => {
  // Test mode state
  const [testMode, setTestMode] = useState(false);
  const [activeAccount, setActiveAccount] = useState(1); // 1 or 2
  
  // Authentication state for both accounts
  const [account1, setAccount1] = useState({ isAuthenticated: false, user: null, token: null });
  const [account2, setAccount2] = useState({ isAuthenticated: false, user: null, token: null });
  
  // Get current active account
  const currentAccount = activeAccount === 1 ? account1 : account2;
  const setCurrentAccount = activeAccount === 1 ? setAccount1 : setAccount2;
  
  const [authMode, setAuthMode] = useState('login');
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  
  // Chat state
  const [users, setUsers] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState({});
  
  // Call state
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [currentCallId, setCurrentCallId] = useState(null);
  
  // Refs
  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Check for saved accounts on mount
  useEffect(() => {
    const saved1 = localStorage.getItem('account1');
    const saved2 = localStorage.getItem('account2');
    
    if (saved1) {
      const data = JSON.parse(saved1);
      verifyToken(data.token, 1);
    }
    if (saved2) {
      const data = JSON.parse(saved2);
      verifyToken(data.token, 2);
    }
  }, []);

  // Socket.io setup
  useEffect(() => {
    if (currentAccount.isAuthenticated && currentAccount.user) {
      socketRef.current = io(API_URL);
      
      socketRef.current.on('connect', () => {
        console.log('Socket connected for account', activeAccount);
        socketRef.current.emit('user:join', currentAccount.user.id);
      });

      socketRef.current.on('user:status', (data) => {
        setUsers(prev => prev.map(user => 
          user._id === data.userId ? { ...user, status: data.status } : user
        ));
      });

      socketRef.current.on('message:received', (data) => {
        setMessages(prev => ({
          ...prev,
          [data.conversationId]: [...(prev[data.conversationId] || []), data.message]
        }));
      });

      socketRef.current.on('typing:update', (data) => {
        setIsTyping(prev => ({
          ...prev,
          [data.userId]: data.isTyping
        }));
      });

      socketRef.current.on('call:incoming', (data) => {
        setIncomingCall(data);
      });

      socketRef.current.on('call:accepted', async (data) => {
        console.log('Call accepted');
      });

      socketRef.current.on('call:rejected', () => {
        alert('Call was rejected');
        endCall();
      });

      socketRef.current.on('call:ended', () => {
        endCall();
      });

      socketRef.current.on('webrtc:offer', async (data) => {
        await handleReceiveOffer(data);
      });

      socketRef.current.on('webrtc:answer', async (data) => {
        await handleReceiveAnswer(data);
      });

      socketRef.current.on('webrtc:ice-candidate', async (data) => {
        await handleReceiveIceCandidate(data);
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    }
  }, [currentAccount.isAuthenticated, currentAccount.user, activeAccount]);

  // Auto-fetch users and conversations when switching accounts
  useEffect(() => {
    if (currentAccount.isAuthenticated && currentAccount.token) {
      fetchUsers(currentAccount.token);
      fetchConversations(currentAccount.token);
    }
  }, [activeAccount, currentAccount.isAuthenticated]);

  const verifyToken = async (token, accountNum) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const accountData = { isAuthenticated: true, user: data.user, token };
        
        if (accountNum === 1) {
          setAccount1(accountData);
        } else {
          setAccount2(accountData);
        }
      } else {
        localStorage.removeItem(`account${accountNum}`);
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      localStorage.removeItem(`account${accountNum}`);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login' 
        ? { email, password }
        : { username, email, password };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok) {
        const accountData = { isAuthenticated: true, user: data.user, token: data.token };
        
        if (activeAccount === 1) {
          setAccount1(accountData);
          localStorage.setItem('account1', JSON.stringify({ token: data.token }));
        } else {
          setAccount2(accountData);
          localStorage.setItem('account2', JSON.stringify({ token: data.token }));
        }
        
        // Clear form
        setEmail('');
        setPassword('');
        setUsername('');
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Auth error:', error);
      alert('Authentication failed. Please try again.');
    }
  };

  const handleLogout = async (accountNum = activeAccount) => {
    const account = accountNum === 1 ? account1 : account2;
    
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${account.token}` }
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    localStorage.removeItem(`account${accountNum}`);
    
    if (accountNum === 1) {
      setAccount1({ isAuthenticated: false, user: null, token: null });
    } else {
      setAccount2({ isAuthenticated: false, user: null, token: null });
    }
    
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const fetchUsers = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchConversations = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/messages/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const selectChat = async (user) => {
    setActiveChat(user);
    
    try {
      const response = await fetch(`${API_URL}/api/messages/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentAccount.token}`
        },
        body: JSON.stringify({ participantId: user._id })
      });

      if (response.ok) {
        const data = await response.json();
        fetchMessages(data.conversation._id);
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  const fetchMessages = async (conversationId) => {
    try {
      const response = await fetch(
        `${API_URL}/api/messages/conversations/${conversationId}/messages`,
        { headers: { 'Authorization': `Bearer ${currentAccount.token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => ({
          ...prev,
          [conversationId]: data.messages
        }));
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const sendMessage = () => {
    if (!message.trim() || !activeChat) return;

    const conversationId = conversations.find(conv => 
      conv.participants.some(p => p._id === activeChat._id)
    )?._id;

    if (!conversationId) return;

    socketRef.current.emit('message:send', {
      senderId: currentAccount.user.id,
      receiverId: activeChat._id,
      text: message,
      conversationId
    });

    setMessage('');
    stopTyping();
  };

  const startTyping = () => {
    if (!activeChat) return;
    
    socketRef.current.emit('typing:start', {
      senderId: currentAccount.user.id,
      receiverId: activeChat._id
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(stopTyping, 3000);
  };

  const stopTyping = () => {
    if (!activeChat) return;
    
    socketRef.current.emit('typing:stop', {
      senderId: currentAccount.user.id,
      receiverId: activeChat._id
    });
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(rtcConfig);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('webrtc:ice-candidate', {
          receiverId: activeChat._id,
          candidate: event.candidate,
          callId: currentCallId
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    return pc;
  };

  const startCall = async (type) => {
    if (!activeChat) return;

    try {
      setCallType(type);
      setInCall(true);

      const constraints = {
        audio: true,
        video: type === 'video'
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const callId = `${currentAccount.user.id}-${activeChat._id}-${Date.now()}`;
      setCurrentCallId(callId);

      peerConnectionRef.current = createPeerConnection();
      
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });

      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      socketRef.current.emit('call:initiate', {
        callerId: currentAccount.user.id,
        receiverId: activeChat._id,
        callType: type,
        callerName: currentAccount.user.username
      });

      socketRef.current.emit('webrtc:offer', {
        receiverId: activeChat._id,
        offer: offer,
        callId: callId
      });

    } catch (error) {
      console.error('Error starting call:', error);
      alert('Could not access camera/microphone. Please grant permissions.');
      endCall();
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      setCallType(incomingCall.callType);
      setInCall(true);
      setCurrentCallId(incomingCall.callId);

      const constraints = {
        audio: true,
        video: incomingCall.callType === 'video'
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      socketRef.current.emit('call:accept', { callId: incomingCall.callId });
      setIncomingCall(null);

    } catch (error) {
      console.error('Error accepting call:', error);
      alert('Could not access camera/microphone');
      rejectCall();
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      socketRef.current.emit('call:reject', { callId: incomingCall.callId });
      setIncomingCall(null);
    }
  };

  const endCall = () => {
    if (currentCallId) {
      socketRef.current.emit('call:end', { callId: currentCallId });
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    setInCall(false);
    setCallType(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setCurrentCallId(null);
    setIncomingCall(null);
  };

  const handleReceiveOffer = async (data) => {
    try {
      peerConnectionRef.current = createPeerConnection();
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          peerConnectionRef.current.addTrack(track, localStreamRef.current);
        });
      }

      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      socketRef.current.emit('webrtc:answer', {
        receiverId: data.senderId,
        answer: answer,
        callId: data.callId
      });

    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleReceiveAnswer = async (data) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleReceiveIceCandidate = async (data) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const filteredUsers = users.filter(user =>
    user.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Quick setup for test mode
  const quickSetupTestAccounts = async () => {
    const timestamp = Date.now();
    
    // Setup Account 1
    const acc1 = {
      username: `TestUser1_${timestamp}`,
      email: `user1_${timestamp}@test.com`,
      password: 'test123'
    };
    
    // Setup Account 2
    const acc2 = {
      username: `TestUser2_${timestamp}`,
      email: `user2_${timestamp}@test.com`,
      password: 'test123'
    };

    try {
      // Register both accounts
      const res1 = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc1)
      });
      
      const res2 = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc2)
      });

      if (res1.ok && res2.ok) {
        const data1 = await res1.json();
        const data2 = await res2.json();
        
        setAccount1({ isAuthenticated: true, user: data1.user, token: data1.token });
        setAccount2({ isAuthenticated: true, user: data2.user, token: data2.token });
        
        localStorage.setItem('account1', JSON.stringify({ token: data1.token }));
        localStorage.setItem('account2', JSON.stringify({ token: data2.token }));
        
        setTestMode(true);
        alert('✅ Test accounts created! Switch between Account 1 and Account 2 to test.');
      }
    } catch (error) {
      console.error('Error setting up test accounts:', error);
      alert('Failed to create test accounts. Make sure backend is running.');
    }
  };

  // Show test mode setup if no accounts logged in
  if (!account1.isAuthenticated && !account2.isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <MessageCircle className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800">Chat App</h1>
            <p className="text-gray-600 mt-2">Connect with friends instantly</p>
          </div>

          {/* Test Mode Option */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <TestTube className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-blue-800">Test Mode</h3>
            </div>
            <p className="text-sm text-blue-700 mb-3">
              Create 2 test accounts instantly and switch between them to test messaging and calls!
            </p>
            <button
              onClick={quickSetupTestAccounts}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              🚀 Quick Setup Test Accounts
            </button>
          </div>

          <div className="text-center text-gray-500 mb-4">OR</div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setAuthMode('login'); setActiveAccount(1); }}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                authMode === 'login' && activeAccount === 1
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => { setAuthMode('register'); setActiveAccount(1); }}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                authMode === 'register' && activeAccount === 1
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'register' && (
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition"
            >
              {authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main Chat Interface
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Account Switcher Bar (Test Mode) */}
      {(account1.isAuthenticated || account2.isAuthenticated) && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-400 text-gray-900 py-2 px-4 z-50 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <TestTube className="w-5 h-5" />
            <span className="font-semibold">Test Mode Active</span>
          </div>
          <div className="flex items-center gap-2">
            {account1.isAuthenticated && (
              <button
                onClick={() => setActiveAccount(1)}
                className={`px-4 py-1 rounded-lg font-semibold transition ${
                  activeAccount === 1
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-900 hover:bg-gray-100'
                }`}
              >
                👤 {account1.user.username}
              </button>
            )}
            {account2.isAuthenticated && (
              <button
                onClick={() => setActiveAccount(2)}
                className={`px-4 py-1 rounded-lg font-semibold transition ${
                  activeAccount === 2
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-900 hover:bg-gray-100'
                }`}
              >
                👤 {account2.user.username}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 text-center max-w-sm">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-4xl mx-auto mb-4">
              📞
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              Incoming {incomingCall.callType} call
            </h3>
            <p className="text-gray-600 mb-6">{incomingCall.callerName}</p>
            <div className="flex gap-4">
              <button
                onClick={rejectCall}
                className="flex-1 py-3 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition"
              >
                Decline
              </button>
              <button
                onClick={acceptCall}
                className="flex-1 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col" style={{ marginTop: (account1.isAuthenticated || account2.isAuthenticated) ? '44px' : '0' }}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xl">
                {currentAccount.user?.avatar || '👤'}
              </div>
              <div>
                <h2 className="font-semibold text-gray-800">{currentAccount.user?.username}</h2>
                <p className="text-xs text-green-500">● Online</p>
              </div>
            </div>
            <button
              onClick={() => handleLogout()}
              className="p-2 hover:bg-gray-100 rounded-full transition"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredUsers.map(user => (
            <div
              key={user._id}
              onClick={() => selectChat(user)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition ${
                activeChat?._id === user._id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-2xl">
                    {user.avatar || '👤'}
                  </div>
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                    user.status === 'online' ? 'bg-green-500' :
                    user.status === 'away' ? 'bg-yellow-500' : 'bg-gray-400'
                  }`} />
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="font-semibold text-gray-800">{user.username}</h3>
                  <p className="text-sm text-gray-500">
                    {isTyping[user._id] ? 'Typing...' : user.bio || 'Available'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col" style={{ marginTop: (account1.isAuthenticated || account2.isAuthenticated) ? '44px' : '0' }}>
        {activeChat ? (
          <>
            <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xl">
                  {activeChat.avatar || '👤'}
                </div>
                <div className="ml-3">
                  <h2 className="font-semibold text-gray-800">{activeChat.username}</h2>
                  <p className={`text-sm ${
                    activeChat.status === 'online' ? 'text-green-500' : 'text-gray-500'
                  }`}>
                    {activeChat.status === 'online' ? '● Online' : 'Offline'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => startCall('audio')}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                  title="Voice call"
                >
                  <Phone className="w-5 h-5 text-gray-600" />
                </button>
                <button
                  onClick={() => startCall('video')}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                  title="Video call"
                >
                  <Video className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {inCall && (
              <div className="absolute inset-0 bg-gray-900 z-50 flex items-center justify-center">
                <div className="relative w-full h-full">
                  {callType === 'video' ? (
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center text-6xl mb-4 mx-auto">
                          {activeChat.avatar || '👤'}
                        </div>
                        <h2 className="text-white text-2xl font-semibold">{activeChat.username}</h2>
                        <p className="text-white/80 mt-2">In call...</p>
                      </div>
                    </div>
                  )}

                  {callType === 'video' && (
                    <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4">
                    <button
                      onClick={toggleMute}
                      className={`p-4 rounded-full ${
                        isMuted ? 'bg-red-500' : 'bg-gray-700'
                      } hover:opacity-80 transition`}
                    >
                      {isMuted ? (
                        <MicOff className="w-6 h-6 text-white" />
                      ) : (
                        <Mic className="w-6 h-6 text-white" />
                      )}
                    </button>

                    {callType === 'video' && (
                      <button
                        onClick={toggleVideo}
                        className={`p-4 rounded-full ${
                          isVideoOff ? 'bg-red-500' : 'bg-gray-700'
                        } hover:opacity-80 transition`}
                      >
                        {isVideoOff ? (
                          <VideoOffIcon className="w-6 h-6 text-white" />
                        ) : (
                          <Video className="w-6 h-6 text-white" />
                        )}
                      </button>
                    )}

                    <button
                      onClick={endCall}
                      className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition"
                    >
                      <PhoneOff className="w-6 h-6 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {(messages[conversations.find(c => c.participants.some(p => p._id === activeChat._id))?._id] || []).map((msg) => (
                <div
                  key={msg._id}
                  className={`mb-4 flex ${
                    msg.sender._id === currentAccount.user.id ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-2xl ${
                      msg.sender._id === currentAccount.user.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-800'
                    }`}
                  >
                    <p>{msg.text}</p>
                    <p className={`text-xs mt-1 ${
                      msg.sender._id === currentAccount.user.id ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    startTyping();
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  className="px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <MessageCircle className="w-24 h-24 text-gray-300 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-gray-600 mb-2">Welcome, {currentAccount.user?.username}!</h2>
              <p className="text-gray-500">Select a contact to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatApp;
