import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Plus, 
  Shield, 
  User, 
  Briefcase, 
  Camera, 
  Dog, 
  Baby, 
  Home, 
  ShoppingBag, 
  AlertTriangle,
  CheckCircle,
  X,
  CreditCard,
  LayoutGrid,
  List,
  MessageSquare,
  Send,
  Bot,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { moderateContent, ModerationResult } from './services/geminiService';
import { User as UserType, Listing, Transaction, Message } from './types';
import { GoogleGenAI } from "@google/genai";

const CATEGORIES = [
  { name: 'Pet Care', icon: Dog },
  { name: 'Child Minding', icon: Baby },
  { name: 'Home Assistance', icon: Home },
  { name: 'Personal Shopping', icon: ShoppingBag },
  { name: 'Equipment', icon: Camera },
  { name: 'Other', icon: Briefcase },
];

export default function App() {
  const [user, setUser] = useState<UserType | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [view, setView] = useState<'landing' | 'login' | 'browse' | 'post' | 'verify' | 'restricted' | 'my-stuff'>('landing');
  const [filter, setFilter] = useState<'all' | 'task' | 'rental'>('all');
  const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null);
  const [verificationStep, setVerificationStep] = useState(1);
  const [loginData, setLoginData] = useState({ username: '', email: '', password: '', age: '' });
  const [myStuff, setMyStuff] = useState<Transaction[]>([]);
  const [activeChat, setActiveChat] = useState<{ listing: Listing; messages: Message[] } | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; content: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [captchaChallenge, setCaptchaChallenge] = useState<{ id: number; isLogo: boolean }[]>([]);
  const [captchaSolved, setCaptchaSolved] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [moderationStatus, setModerationStatus] = useState<ModerationResult | null>(null);
  const [formData, setFormData] = useState({
    type: 'task' as 'task' | 'rental',
    title: '',
    description: '',
    price: '',
    category: 'Other',
    image_url: ''
  });

  useEffect(() => {
    fetchUser();
    fetchListings();
  }, []);

  useEffect(() => {
    if (user && !socket) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}?userId=${user.id}`);
      
      ws.onmessage = (event) => {
        const newMessage = JSON.parse(event.data);
        setActiveChat(prev => {
          if (prev && prev.listing.id === newMessage.listing_id) {
            // Check if message already exists to avoid duplicates (idempotency)
            if (prev.messages.some(m => m.id === newMessage.id)) return prev;
            return {
              ...prev,
              messages: [...prev.messages, newMessage]
            };
          }
          return prev;
        });
      };

      setSocket(ws);
      return () => ws.close();
    }
  }, [user]);

  const fetchUser = async () => {
    const res = await fetch('/api/users/me');
    const data = await res.json();
    setUser(data);
  };

  const fetchListings = async () => {
    const res = await fetch('/api/listings');
    const data = await res.json();
    setListings(data);
  };

  const fetchMyStuff = async () => {
    if (!user) return;
    const res = await fetch(`/api/my-stuff?userId=${user.id}`);
    const data = await res.json();
    setMyStuff(data);
  };

  const handleEngage = async (listing: Listing) => {
    if (!user) {
      setView('login');
      return;
    }
    
    const duration = listing.type === 'task' ? '2 hours' : '3 days';
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (listing.type === 'task' ? 0 : 3));
    
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_id: listing.id,
        buyer_id: user.id,
        amount: listing.price,
        duration,
        due_date: dueDate.toLocaleDateString()
      })
    });

    if (res.ok) {
      fetchMyStuff();
      setView('my-stuff');
    }
  };

  const openChat = async (listing: Listing) => {
    if (!user) {
      setView('login');
      return;
    }
    
    const res = await fetch(`/api/messages?listing_id=${listing.id}&user1_id=${user.id}&user2_id=${listing.user_id}`);
    const messages = await res.json();
    setActiveChat({ listing, messages });
  };

  const sendMessage = () => {
    if (!socket || !activeChat || !chatInput.trim() || !user) return;

    const message = {
      sender_id: user.id,
      receiver_id: activeChat.listing.user_id,
      listing_id: activeChat.listing.id,
      content: chatInput.trim()
    };

    socket.send(JSON.stringify(message));
    setChatInput('');
  };

  const handleAiChat = async (input: string) => {
    if (!input.trim()) return;
    
    const userMsg = { role: 'user' as const, content: input };
    setAiMessages(prev => [...prev, userMsg]);
    setAiInput('');
    setAiLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: input,
        config: {
          systemInstruction: "You are the Huslr AI Assistant. Huslr is a local marketplace for tasks (services) and rentals. Key info: 5% commission on transactions, users must be verified, payments are in Rupees (₹). Be helpful, concise, and professional.",
        },
      });

      const aiMsg = { role: 'ai' as const, content: response.text || "I'm sorry, I couldn't process that." };
      setAiMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error("AI Chat Error:", error);
      setAiMessages(prev => [...prev, { role: 'ai', content: "Sorry, I'm having trouble connecting right now." }]);
    } finally {
      setAiLoading(false);
    }
  };

  const startCaptcha = () => {
    const grid = Array.from({ length: 9 }, (_, i) => ({
      id: i,
      isLogo: Math.random() > 0.7
    }));
    // Ensure at least one logo
    if (!grid.some(item => item.isLogo)) {
      grid[Math.floor(Math.random() * 9)].isLogo = true;
    }
    setCaptchaChallenge(grid);
  };

  const handleCaptchaClick = (id: number) => {
    const item = captchaChallenge.find(c => c.id === id);
    if (item?.isLogo) {
      setCaptchaSolved(true);
      setTimeout(() => setVerificationStep(3), 1500);
    } else {
      // Shake effect or reset
      startCaptcha();
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsPosting(true);
    setModerationStatus(null);

    // AI Moderation
    const contentToModerate = `${formData.title} ${formData.description}`;
    const moderation = await moderateContent(contentToModerate);
    
    if (!moderation.safe) {
      setModerationStatus(moderation);
      setIsPosting(false);
      
      // If it's a severe violation (bot or scam), ban the user
      if (moderation.is_bot || moderation.reason.toLowerCase().includes('scam')) {
        await fetch('/api/users/ban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id })
        });
        fetchUser(); // Refresh user status
      }
      return;
    }

    const res = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        user_id: user.id,
        price: parseFloat(formData.price)
      })
    });

    if (res.ok) {
      setFormData({ type: 'task', title: '', description: '', price: '', category: 'Other', image_url: '' });
      setView('browse');
      fetchListings();
    }
    setIsPosting(false);
  };

  if (user?.is_banned) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md text-center border-2 border-red-200">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Banned</h1>
          <p className="text-gray-600">
            Your account has been suspended for violating our community guidelines (detected suspicious or inappropriate activity).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans text-gray-900 transition-colors duration-700 relative overflow-hidden ${
      view === 'browse' && filter === 'task' ? 'bg-orange-50' : 
      view === 'browse' && filter === 'rental' ? 'bg-purple-50' : 
      view === 'browse' && filter === 'all' ? 'bg-white' :
      view === 'landing' ? 'bg-white' :
      view === 'my-stuff' ? 'bg-blue-50' :
      'bg-[#f5f5f0]'
    }`}>
      {view === 'browse' && filter === 'all' && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(249,115,22,0.05),rgba(147,51,234,0.05))]" />
      )}
      {/* Navigation */}
      <nav className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors duration-500 px-6 py-4 ${
        view === 'browse' && filter === 'task' ? 'bg-orange-50/80 border-orange-100' :
        view === 'browse' && filter === 'rental' ? 'bg-purple-50/80 border-purple-100' :
        view === 'browse' && filter === 'all' ? 'bg-white/40 border-gray-200' :
        view === 'my-stuff' ? 'bg-blue-50/80 border-blue-100' :
        'bg-white/80 border-gray-200'
      }`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div 
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => setView('landing')}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xl transition-all group-hover:scale-110 ${
              view === 'browse' && filter === 'task' ? 'bg-orange-500 shadow-orange-200 shadow-lg' :
              view === 'browse' && filter === 'rental' ? 'bg-purple-600 shadow-purple-200 shadow-lg' :
              view === 'my-stuff' ? 'bg-blue-600 shadow-blue-200 shadow-lg' :
              'bg-black'
            }`}>
              h.
            </div>
            <span className="text-2xl font-black tracking-tighter">HUSLR</span>
          </div>
          <div className="flex items-center gap-6">
            {user && view !== 'landing' && view !== 'login' && view !== 'verify' && (
              <>
                <button 
                  onClick={() => { setFilter('all'); setView('browse'); }}
                  className={`text-sm font-semibold uppercase tracking-wider transition-colors ${
                    view === 'browse' ? 'text-black' : 'text-gray-500'
                  }`}
                >
                  Browse
                </button>
                <button 
                  onClick={() => { fetchMyStuff(); setView('my-stuff'); }}
                  className={`text-sm font-semibold uppercase tracking-wider transition-colors ${
                    view === 'my-stuff' ? 'text-black' : 'text-gray-500'
                  }`}
                >
                  My Stuff
                </button>
                <button 
                  onClick={() => setView('post')}
                  className={`bg-black text-white px-6 py-2 rounded-full text-sm font-bold transition-colors flex items-center gap-2 ${
                    filter === 'task' ? 'hover:bg-orange-600' : 
                    filter === 'rental' ? 'hover:bg-purple-600' : 
                    'hover:bg-gray-800'
                  }`}
                >
                  <Plus size={18} /> Post Ad
                </button>
              </>
            )}
            {user && (
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <User size={20} className="text-gray-400" />
                {user.name}
              </div>
            )}
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {activeChat && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col h-[600px]"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center text-white font-bold">
                    {activeChat.listing.owner_name?.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">{activeChat.listing.owner_name}</h4>
                    <p className="text-xs text-gray-500 uppercase font-black tracking-widest">{activeChat.listing.title}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveChat(null)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
                {activeChat.messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${
                      msg.sender_id === user?.id 
                        ? 'bg-black text-white rounded-tr-none' 
                        : 'bg-white border border-gray-100 rounded-tl-none shadow-sm'
                    }`}>
                      {msg.content}
                      <p className={`text-[10px] mt-1 opacity-50 ${msg.sender_id === user?.id ? 'text-right' : 'text-left'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 bg-white border-t">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  <button 
                    onClick={sendMessage}
                    className="bg-black text-white p-4 rounded-2xl hover:bg-gray-800 transition-colors"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAiOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-24 right-6 z-[100] w-[400px] h-[600px] bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          >
            <div className="p-6 bg-black text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Bot size={20} />
                </div>
                <div>
                  <h4 className="font-bold">Huslr AI Help</h4>
                  <p className="text-[10px] uppercase font-black tracking-widest opacity-60">Always Online</p>
                </div>
              </div>
              <button onClick={() => setIsAiOpen(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
              {aiMessages.length === 0 && (
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <Sparkles className="text-orange-500" />
                  </div>
                  <h5 className="font-bold text-lg mb-2">How can I help?</h5>
                  <p className="text-sm text-gray-500 mb-6 px-6">Ask me anything about using Huslr, fees, or how to get started.</p>
                  
                  <div className="grid grid-cols-1 gap-2 px-4">
                    {[
                      "How do I post a task?",
                      "What is the 5% commission?",
                      "How do I rent an item?",
                      "Is my data safe on Huslr?"
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleAiChat(prompt)}
                        className="text-left p-3 bg-white border border-gray-100 rounded-xl text-sm font-medium hover:border-black transition-all"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-black text-white rounded-tr-none' 
                      : 'bg-white border border-gray-100 rounded-tl-none shadow-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiChat(aiInput)}
                  placeholder="Ask Huslr AI..."
                  className="flex-1 px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-black"
                />
                <button
                  onClick={() => handleAiChat(aiInput)}
                  disabled={aiLoading}
                  className="bg-black text-white p-4 rounded-2xl hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsAiOpen(!isAiOpen)}
        className="fixed bottom-6 right-6 z-[100] w-14 h-14 bg-black text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all group"
      >
        <HelpCircle className="group-hover:rotate-12 transition-transform" />
      </button>

      <AnimatePresence mode="wait">
        {view === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[calc(100vh-80px)] flex flex-col md:flex-row overflow-hidden relative"
          >
            {/* Central Logo */}
            <motion.div 
              animate={{ 
                left: hoveredSide === 'left' ? '58.33%' : hoveredSide === 'right' ? '41.66%' : '50%' 
              }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              onClick={() => setView('landing')}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden md:block cursor-pointer group/logo"
            >
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', damping: 12, delay: 0.5 }}
                className="w-32 h-32 bg-white rounded-full shadow-2xl flex items-center justify-center border-8 border-white/20 backdrop-blur-sm group-hover/logo:border-white/40 transition-all"
              >
                <span className="text-5xl font-black tracking-tighter text-black">h.</span>
              </motion.div>
            </motion.div>

            {/* Left Side: Tasks (Orange) */}
            <motion.div 
              animate={{ flex: hoveredSide === 'left' ? 1.4 : 1 }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              onMouseEnter={() => setHoveredSide('left')}
              onMouseLeave={() => setHoveredSide(null)}
              onClick={() => { 
                if (user?.is_verified) {
                  setFilter('task'); 
                  setView('browse'); 
                } else if (user) {
                  setView('verify');
                  setVerificationStep(1);
                } else {
                  setView('login');
                }
              }}
              className="flex-1 relative group cursor-pointer overflow-hidden bg-orange-500"
            >
              <img 
                src="https://picsum.photos/seed/task-hero/1200/1200" 
                alt="Tasks" 
                className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-700 mix-blend-overlay"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-orange-600/80 to-transparent" />
              <div className="absolute inset-0 flex flex-col justify-center items-center p-12 text-center">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="text-7xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-lg">Find Tasks</h2>
                  <p className="text-xl text-white font-medium max-w-md mb-8 drop-shadow-md">
                    Help your neighbors and earn. Walk dogs, help with events, or assist with heavy lifting.
                  </p>
                  <button className="bg-white text-orange-600 px-8 py-3 rounded-full font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-all shadow-lg">
                    Show me tasks
                  </button>
                </motion.div>
              </div>
            </motion.div>

            {/* Right Side: Rentals (Purple) */}
            <motion.div 
              animate={{ flex: hoveredSide === 'right' ? 1.4 : 1 }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              onMouseEnter={() => setHoveredSide('right')}
              onMouseLeave={() => setHoveredSide(null)}
              onClick={() => { 
                if (user?.is_verified) {
                  setFilter('rental'); 
                  setView('browse'); 
                } else if (user) {
                  setView('verify');
                  setVerificationStep(1);
                } else {
                  setView('login');
                }
              }}
              className="flex-1 relative group cursor-pointer overflow-hidden bg-purple-600"
            >
              <img 
                src="https://picsum.photos/seed/rental-hero/1200/1200" 
                alt="Rentals" 
                className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-700 mix-blend-overlay"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-purple-700/80 to-transparent" />
              <div className="absolute inset-0 flex flex-col justify-center items-center p-12 text-center">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <h2 className="text-7xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-lg">Rent Items</h2>
                  <p className="text-xl text-white font-medium max-w-md mb-8 drop-shadow-md">
                    Need a tool for a day? Rent cameras, equipment, or spaces from people in your community.
                  </p>
                  <button className="bg-white text-purple-600 px-8 py-3 rounded-full font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-all shadow-lg">
                    Show me rentals
                  </button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {view === 'browse' && (
          <motion.div
            key="browse"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full"
          >
            <div className="max-w-7xl mx-auto px-6 py-20">
              <div className="flex justify-between items-end mb-12">
                <div>
                  <h2 className={`text-8xl font-black uppercase tracking-tighter mb-4 leading-[0.8] ${
                    filter === 'all' ? 'bg-gradient-to-r from-orange-600 to-purple-600 bg-clip-text text-transparent' : ''
                  }`}>
                    {filter === 'all' ? 'Marketplace' : filter === 'task' ? 'Tasks' : 'Rentals'}
                  </h2>
                  <p className={`text-lg transition-colors ${filter === 'all' ? 'text-gray-600 font-medium' : 'text-gray-500'}`}>
                    {filter === 'all' ? 'Find tasks to complete or items to rent nearby.' : filter === 'task' ? 'Help your neighbors and earn extra income.' : 'Rent quality items from your community.'}
                  </p>
                </div>
                  <div className="flex gap-4">
                    <div className="relative group">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" size={24} />
                      <input 
                        type="text" 
                        placeholder="Search anything..." 
                        className={`pl-16 pr-8 py-6 bg-white rounded-[2rem] border border-gray-100 shadow-xl focus:outline-none focus:ring-4 w-[32rem] text-lg transition-all ${
                          filter === 'task' ? 'focus:ring-orange-500/20' : 
                          filter === 'rental' ? 'focus:ring-purple-600/20' : 
                          'focus:ring-black/5'
                        }`}
                      />
                    </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {listings
                  .filter(l => filter === 'all' || l.type === filter)
                  .map((listing) => (
                  <motion.div 
                    key={listing.id}
                    whileHover={{ y: -10 }}
                    className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-2xl transition-all border border-gray-100 group"
                  >
                    <div className="h-64 bg-gray-100 relative overflow-hidden">
                      <img 
                        src={listing.image_url || `https://picsum.photos/seed/${listing.id}/800/600`} 
                        alt={listing.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        referrerPolicy="no-referrer"
                      />
                      <div className={`absolute top-6 right-6 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white ${listing.type === 'task' ? 'bg-orange-500' : 'bg-purple-600'}`}>
                        {listing.type}
                      </div>
                    </div>
                    <div className="p-8">
                      <div className="flex justify-between items-start mb-4 gap-4">
                        <h3 className="text-2xl font-bold leading-tight group-hover:text-orange-600 transition-colors">{listing.title}</h3>
                        <span className={`text-3xl font-black ${listing.type === 'task' ? 'text-orange-600' : 'text-purple-600'}`}>₹{listing.price}</span>
                      </div>
                      <p className="text-gray-500 text-sm mb-8 line-clamp-3 leading-relaxed">{listing.description}</p>
                      <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${listing.type === 'task' ? 'bg-orange-500' : 'bg-purple-600'}`}>
                            {listing.owner_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Owner</p>
                            <p className="text-sm font-bold text-gray-800">{listing.owner_name}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEngage(listing)}
                            className={`flex-1 text-xs font-black uppercase tracking-widest px-6 py-3 rounded-full border-2 transition-all ${listing.type === 'task' ? 'border-orange-100 text-orange-600 hover:bg-orange-600 hover:text-white hover:border-orange-600' : 'border-purple-100 text-purple-600 hover:bg-purple-600 hover:text-white hover:border-purple-600'}`}
                          >
                            {listing.type === 'task' ? 'Accept Task' : 'Rent Now'}
                          </button>
                          <button 
                            onClick={() => openChat(listing)}
                            className="p-3 rounded-full border-2 border-gray-100 text-gray-400 hover:border-black hover:text-black transition-all"
                          >
                            <MessageSquare size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {view === 'login' && (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-md mx-auto px-6 py-20"
          >
            <div className="bg-white rounded-[3rem] p-12 shadow-2xl border border-gray-100">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center text-white font-black text-3xl mx-auto mb-4">
                  h.
                </div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">Welcome to Huslr</h2>
                <p className="text-gray-500">Create your account to get started</p>
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const age = parseInt(loginData.age);
                  if (age < 16) {
                    setView('restricted');
                    return;
                  }
                  // Mock login/signup
                  setUser({
                    id: 1,
                    name: loginData.username,
                    email: loginData.email,
                    is_banned: 0,
                    is_verified: 0,
                    balance: 0
                  });
                  setView('verify');
                  setVerificationStep(1);
                }} 
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Username</label>
                  <input 
                    required
                    type="text" 
                    value={loginData.username}
                    onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                    placeholder="johndoe"
                    className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Email Address</label>
                    <input 
                      required
                      type="email" 
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      placeholder="john@example.com"
                      className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Age</label>
                    <input 
                      required
                      type="number" 
                      min="1"
                      max="120"
                      value={loginData.age}
                      onChange={(e) => setLoginData({ ...loginData, age: e.target.value })}
                      placeholder="18"
                      className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Password</label>
                  <input 
                    required
                    type="password" 
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <button type="submit" className="w-full bg-black text-white py-5 rounded-full text-lg font-bold hover:bg-orange-600 transition-all mt-4">
                  Create Account
                </button>
              </form>
              <p className="text-center text-xs text-gray-400 mt-6">
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          </motion.div>
        )}

        {view === 'restricted' && (
          <motion.div
            key="restricted"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-md mx-auto px-6 py-20"
          >
            <div className="bg-white rounded-[3rem] p-12 shadow-2xl border-4 border-red-100 text-center">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500 mx-auto mb-6">
                <AlertTriangle size={40} />
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-gray-900">Access Restricted</h2>
              <p className="text-gray-500 mb-8 leading-relaxed">
                We're sorry, but you must be at least <span className="font-bold text-black">16 years old</span> to use Huslr. Our community guidelines require users to meet this minimum age requirement for safety and legal reasons.
              </p>
              <button 
                onClick={() => setView('landing')}
                className="w-full bg-black text-white py-5 rounded-full text-lg font-bold hover:bg-gray-800 transition-all"
              >
                Return to Home
              </button>
            </div>
          </motion.div>
        )}

        {view === 'verify' && (
          <motion.div
            key="verify"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-2xl mx-auto px-6 py-20"
          >
            <div className="bg-white rounded-[3rem] p-12 shadow-2xl border border-gray-100">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tighter">User Verification</h2>
                  <p className="text-gray-500">Step {verificationStep} of 4</p>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(s => (
                    <div key={s} className={`w-3 h-3 rounded-full ${verificationStep >= s ? 'bg-orange-600' : 'bg-gray-200'}`} />
                  ))}
                </div>
              </div>

              {verificationStep === 1 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold">Personal Details & Aadhar</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="text" placeholder="Full Name" className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100" />
                    <input type="number" placeholder="Age" className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100" />
                  </div>
                  <input type="text" placeholder="Full Address" className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100" />
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center">
                    <Camera className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm font-bold text-gray-500 uppercase">Upload Aadhar Card Photo</p>
                    <input type="file" className="hidden" id="aadhar-upload" />
                    <label htmlFor="aadhar-upload" className="mt-4 inline-block bg-black text-white px-6 py-2 rounded-full text-xs font-bold cursor-pointer">Choose File</label>
                  </div>
                  <button onClick={() => setVerificationStep(2)} className="w-full bg-black text-white py-5 rounded-full text-lg font-bold">Continue</button>
                </div>
              )}

              {verificationStep === 2 && (
                <div className="space-y-6 text-center">
                  <h3 className="text-xl font-bold">Security Check</h3>
                  {!captchaChallenge.length ? (
                    <div 
                      onClick={startCaptcha}
                      className="p-8 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center gap-4 cursor-pointer hover:bg-gray-100 transition-colors group"
                    >
                      <div className="w-6 h-6 border-2 border-gray-300 rounded group-hover:border-orange-600 transition-colors flex items-center justify-center">
                        {captchaSolved && <CheckCircle className="text-orange-600" size={16} />}
                      </div>
                      <label className="text-lg font-medium cursor-pointer">I am not a robot</label>
                      <div className="ml-auto">
                        <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" alt="reCAPTCHA" className="w-8 h-8 opacity-50" />
                      </div>
                    </div>
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-6 bg-white rounded-2xl border border-gray-200 shadow-inner"
                    >
                      <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Select the Huslr "h." logo to verify</p>
                      <div className="grid grid-cols-3 gap-2">
                        {captchaChallenge.map((item) => (
                          <motion.button
                            key={item.id}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleCaptchaClick(item.id)}
                            className="aspect-square bg-gray-50 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
                          >
                            {item.isLogo ? (
                              <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white font-black text-xs">h.</div>
                            ) : (
                              <div className="w-2 h-2 bg-gray-200 rounded-full" />
                            )}
                          </motion.button>
                        ))}
                      </div>
                      {captchaSolved && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 text-orange-600 font-bold flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={18} /> Verification Successful
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                  <p className="text-sm text-gray-400">Please complete the security check to proceed.</p>
                </div>
              )}

              {verificationStep === 3 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold">Contact Verification</h3>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input type="email" placeholder="Email Address" className="flex-1 px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100" />
                      <button className="bg-orange-100 text-orange-600 px-6 rounded-2xl font-bold text-sm">Verify</button>
                    </div>
                    <div className="flex gap-2">
                      <input type="tel" placeholder="Phone Number" className="flex-1 px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100" />
                      <button className="bg-orange-100 text-orange-600 px-6 rounded-2xl font-bold text-sm">Verify</button>
                    </div>
                  </div>
                  <button onClick={() => setVerificationStep(4)} className="w-full bg-black text-white py-5 rounded-full text-lg font-bold">Continue</button>
                </div>
              )}

              {verificationStep === 4 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold">Aadhar OTP Verification</h3>
                  <p className="text-sm text-gray-500">We've sent a 6-digit OTP to the mobile number linked with your Aadhar card.</p>
                  <div className="flex gap-2 justify-center">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <input key={i} type="text" maxLength={1} className="w-12 h-16 text-center text-2xl font-bold bg-gray-50 border border-gray-100 rounded-xl" />
                    ))}
                  </div>
                  <button 
                    onClick={async () => {
                      // Mock verification success
                      if (user) {
                        setUser({ ...user, is_verified: 1 });
                        setView('browse');
                      }
                    }} 
                    className="w-full bg-black text-white py-5 rounded-full text-lg font-bold"
                  >
                    Complete Verification
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
        {view === 'my-stuff' && (
          <motion.div
            key="my-stuff"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-7xl mx-auto px-6 py-20"
          >
            <div className="flex justify-between items-end mb-12">
              <div>
                <h2 className="text-8xl font-black uppercase tracking-tighter mb-4 leading-[0.8] bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  My Stuff
                </h2>
                <p className="text-gray-600 font-medium text-lg">
                  Track your active tasks and rentals in one place.
                </p>
              </div>
            </div>

            {myStuff.length === 0 ? (
              <div className="bg-white rounded-[3rem] p-20 text-center border border-gray-100 shadow-xl">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 mx-auto mb-6">
                  <ShoppingBag size={40} />
                </div>
                <h3 className="text-2xl font-bold mb-2">Nothing here yet</h3>
                <p className="text-gray-500 mb-8">Start browsing the marketplace to find tasks or items to rent.</p>
                <button 
                  onClick={() => setView('browse')}
                  className="bg-black text-white px-8 py-4 rounded-full font-bold hover:bg-gray-800 transition-all"
                >
                  Go to Marketplace
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {myStuff.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-2xl transition-all border border-gray-100 group"
                  >
                    <div className="h-48 bg-gray-100 relative overflow-hidden">
                      <img 
                        src={item.image_url || `https://picsum.photos/seed/${item.listing_id}/800/600`} 
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        referrerPolicy="no-referrer"
                      />
                      <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white ${item.type === 'task' ? 'bg-orange-500' : 'bg-purple-600'}`}>
                        {item.type}
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold mb-4 leading-tight">{item.title}</h3>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <span className="text-xs font-black uppercase tracking-widest text-gray-400">
                            {item.type === 'task' ? 'Time Taken' : 'Rental Duration'}
                          </span>
                          <span className="text-sm font-bold text-gray-800">{item.duration}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <span className="text-xs font-black uppercase tracking-widest text-gray-400">
                            {item.type === 'task' ? 'Date of Work' : 'Last Day to Rent'}
                          </span>
                          <span className="text-sm font-bold text-gray-800">{item.due_date}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Owner</p>
                          <p className="text-sm font-bold text-gray-800">{item.owner_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Paid</p>
                          <p className="text-lg font-black text-black">₹{item.amount}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {view === 'post' && (
          <motion.div
            key="post"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-2xl mx-auto px-6 py-12"
          >
            <div className="bg-white rounded-[3rem] p-12 shadow-2xl border border-gray-100">
              <h2 className="text-4xl font-black uppercase tracking-tighter mb-2">Create Listing</h2>
              <p className="text-gray-500 mb-8">Huslr charges a 5% commission on all successful transactions.</p>

              <form onSubmit={handlePost} className="space-y-6">
                <div className="flex p-1 bg-gray-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'task' })}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${formData.type === 'task' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500'}`}
                  >
                    Task Service
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'rental' })}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${formData.type === 'rental' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500'}`}
                  >
                    Item Rental
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Category</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: cat.name })}
                        className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${formData.category === cat.name ? 'border-orange-600 bg-orange-50 text-orange-600' : 'border-gray-100 hover:border-gray-200'}`}
                      >
                        <cat.icon size={20} />
                        <span className="text-[10px] font-bold uppercase">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Title</label>
                  <input 
                    required
                    type="text" 
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Professional Dog Walking"
                    className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Description</label>
                  <textarea 
                    required
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe your service or item. Do not include phone numbers or emails."
                    className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Price (₹)</label>
                    <input 
                      required
                      type="number" 
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Commission (5%)</label>
                    <div className="w-full px-6 py-4 bg-orange-50 rounded-2xl border border-orange-100 text-orange-600 font-bold">
                      ₹{formData.price ? (parseFloat(formData.price) * 0.05).toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Listing Image</label>
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center relative overflow-hidden group hover:border-orange-600 transition-colors">
                    {formData.image_url ? (
                      <div className="relative h-48 w-full">
                        <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover rounded-xl" />
                        <button 
                          type="button"
                          onClick={() => setFormData({ ...formData, image_url: '' })}
                          className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-black transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Camera className="mx-auto text-gray-400 mb-2 group-hover:text-orange-600 transition-colors" />
                        <p className="text-sm font-bold text-gray-500 uppercase">Upload Listing Photo</p>
                        <input 
                          type="file" 
                          accept="image/*"
                          className="hidden" 
                          id="listing-image-upload" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setFormData({ ...formData, image_url: reader.result as string });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        <label htmlFor="listing-image-upload" className="mt-4 inline-block bg-black text-white px-6 py-2 rounded-full text-xs font-bold cursor-pointer hover:bg-orange-600 transition-colors">Choose File</label>
                      </>
                    )}
                  </div>
                </div>

                {moderationStatus && !moderationStatus.safe && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 bg-red-50 border border-red-100 rounded-2xl flex gap-3"
                  >
                    <AlertTriangle className="text-red-500 shrink-0" size={20} />
                    <div>
                      <p className="text-sm font-bold text-red-600">Content Rejected</p>
                      <p className="text-xs text-red-500">{moderationStatus.reason}</p>
                    </div>
                  </motion.div>
                )}

                <button 
                  disabled={isPosting}
                  type="submit"
                  className="w-full bg-black text-white py-5 rounded-full text-lg font-bold hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {isPosting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      AI Moderating...
                    </>
                  ) : (
                    'Publish Listing'
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-12 px-6 mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-2xl font-black tracking-tighter">HUSLR</div>
          <div className="flex gap-8 text-sm font-bold uppercase tracking-widest text-gray-400">
            <a href="#" className="hover:text-black">Terms</a>
            <a href="#" className="hover:text-black">Privacy</a>
            <a href="#" className="hover:text-black">Safety</a>
            <a href="#" className="hover:text-black">Contact</a>
          </div>
          <div className="text-sm text-gray-400">
            © 2026 Huslr Marketplace. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
