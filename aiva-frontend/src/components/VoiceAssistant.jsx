// VoiceAssistant.jsx - Advanced Voice Integration Component for AIVA
import React, { useState, useEffect, useRef, useCallback } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, Loader, X, Sparkles, ShoppingBag, User } from 'lucide-react';

// Configuration
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';

// Custom Hook for WebSocket connection
const useAIVAWebSocket = (sessionId) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);

        ws.onopen = () => {
          console.log('WebSocket connected');
          setIsConnected(true);
          setSocket(ws);
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          setSocket(null);
          attemptReconnect();
        };

        return ws;
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        attemptReconnect();
      }
    };

    const attemptReconnect = () => {
      if (reconnectAttemptsRef.current < 5) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      }
    };

    const handleWebSocketMessage = (data) => {
      setMessages(prev => [...prev, data]);
      
      switch (data.type) {
        case 'processing_start':
          setIsProcessing(true);
          break;
        case 'response':
        case 'function_complete':
        case 'stream_complete':
          setIsProcessing(false);
          break;
        case 'error':
          setIsProcessing(false);
          console.error('AI Error:', data.message);
          break;
      }
    };

    const ws = connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [sessionId]);

  const sendMessage = useCallback((message) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
    }
  }, [socket]);

  return { isConnected, messages, sendMessage, isProcessing };
};

// Voice Visualizer Component
const VoiceVisualizer = ({ isListening, audioLevel = 0 }) => {
  const bars = 5;
  
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {[...Array(bars)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full"
          animate={{
            height: isListening 
              ? [8, 20 + Math.random() * 20, 8]
              : 8,
            opacity: isListening ? 1 : 0.3
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

// Chat Message Component
const ChatMessage = ({ message, type }) => {
  const isUser = type === 'user';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`flex items-start gap-2 max-w-[80%] ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`p-2 rounded-full ${isUser ? 'bg-blue-100' : 'bg-purple-100'}`}>
          {isUser ? <User size={16} /> : <ShoppingBag size={16} />}
        </div>
        <div 
          className={`px-4 py-2 rounded-2xl ${
            isUser 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          <p className="text-sm">{message}</p>
        </div>
      </div>
    </motion.div>
  );
};

// Main Voice Assistant Component
const VoiceAssistant = ({ 
  onProductSearch, 
  onNavigate, 
  onAddToCart,
  onShowProduct 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [sessionId] = useState(`session-${Date.now()}`);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef(null);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();

  const { 
    isConnected, 
    messages: wsMessages, 
    sendMessage, 
    isProcessing 
  } = useAIVAWebSocket(sessionId);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle transcript changes
  useEffect(() => {
    if (transcript && transcript !== currentTranscript) {
      setCurrentTranscript(transcript);
      
      // Debounce sending to backend
      const timeoutId = setTimeout(() => {
        if (transcript.trim()) {
          handleVoiceCommand(transcript);
        }
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [transcript]);

  // Handle WebSocket messages
  useEffect(() => {
    wsMessages.forEach(msg => {
      handleAIResponse(msg);
    });
  }, [wsMessages]);

  const handleVoiceCommand = async (text) => {
    // Add user message to chat
    setMessages(prev => [...prev, { type: 'user', text }]);
    
    // Send to backend via WebSocket
    sendMessage({
      type: 'voice_command',
      text: text,
      context: {
        session_id: sessionId,
        timestamp: new Date().toISOString()
      }
    });
    
    // Reset transcript
    resetTranscript();
  };

  const handleAIResponse = (response) => {
    switch (response.type) {
      case 'response':
      case 'text_chunk':
        // Add AI message to chat
        setMessages(prev => [...prev, { 
          type: 'ai', 
          text: response.message || response.content 
        }]);
        
        // Speak the response
        if (response.message) {
          speakText(response.message);
        }
        break;

      case 'function_complete':
        handleFunctionCall(response.function, response.parameters);
        break;

      case 'error':
        setMessages(prev => [...prev, { 
          type: 'ai', 
          text: 'Mi dispiace, ho avuto un problema. Riprova.' 
        }]);
        break;
    }
  };

  const handleFunctionCall = (functionName, parameters) => {
    switch (functionName) {
      case 'search_products':
        if (onProductSearch) {
          onProductSearch(parameters.query, parameters.filters);
        }
        break;
      
      case 'navigate_to_page':
        if (onNavigate) {
          onNavigate(parameters.page);
        }
        setIsOpen(false);
        break;
      
      case 'add_to_cart':
        if (onAddToCart) {
          onAddToCart(
            parameters.product_id,
            parameters.size,
            parameters.color,
            parameters.quantity
          );
        }
        break;
      
      case 'get_product_details':
        if (onShowProduct) {
          onShowProduct(parameters.product_id);
        }
        break;
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'it-IT';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();
      setIsListening(false);
    } else {
      SpeechRecognition.startListening({ 
        continuous: true, 
        language: 'it-IT' 
      });
      setIsListening(true);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    // Auto-start listening when opened
    setTimeout(() => {
      if (!listening && browserSupportsSpeechRecognition && isMicrophoneAvailable) {
        toggleListening();
      }
    }, 500);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (listening) {
      SpeechRecognition.stopListening();
      setIsListening(false);
    }
    // Stop any ongoing speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="fixed bottom-8 right-8 z-50 bg-red-100 text-red-700 px-4 py-2 rounded-lg">
        Il tuo browser non supporta il riconoscimento vocale. Usa Chrome o Edge.
      </div>
    );
  }

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        onClick={handleOpen}
        className="fixed bottom-8 right-8 z-50 group"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="relative">
          {/* Main Button */}
          <div className="relative w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full shadow-lg flex items-center justify-center overflow-hidden">
            {/* Animated Background */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600"
              animate={{
                rotate: 360
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear"
              }}
              style={{ scale: 1.5 }}
            />
            
            {/* Icon */}
            <div className="relative z-10 text-white">
              <Mic size={24} />
            </div>
            
            {/* Pulse Effect */}
            <motion.span
              className="absolute inset-0 rounded-full border-4 border-white opacity-30"
              animate={{
                scale: [1, 1.5],
                opacity: [0.3, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity
              }}
            />
          </div>
          
          {/* Connection Status */}
          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${
            isConnected ? 'bg-green-400' : 'bg-red-400'
          } border-2 border-white`} />
          
          {/* Tooltip */}
          <div className="absolute bottom-full mb-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-gray-900 text-white text-sm py-2 px-3 rounded-lg whitespace-nowrap">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-yellow-300" />
                <span>Parla con AIVA</span>
              </div>
            </div>
          </div>
        </div>
      </motion.button>

      {/* Voice Assistant Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-black/50 z-50"
            />
            
            {/* Assistant Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed bottom-8 right-8 w-96 h-[600px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <ShoppingBag size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold">AIVA</h3>
                      <p className="text-xs opacity-90">Il tuo Personal Shopper AI</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-1 hover:bg-white/20 rounded-lg transition"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                {/* Connection Status */}
                <div className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  <span className="opacity-90">
                    {isConnected ? 'Connesso' : 'Connessione...'}
                  </span>
                </div>
              </div>
              
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.length === 0 && (
                  <div className="text-center text-gray-400 mt-8">
                    <Sparkles className="mx-auto mb-3 text-purple-300" size={32} />
                    <p className="text-sm">Ciao! Sono AIVA, il tuo assistente shopping.</p>
                    <p className="text-sm mt-2">Dimmi cosa stai cercando!</p>
                  </div>
                )}
                
                {messages.map((msg, index) => (
                  <ChatMessage 
                    key={index} 
                    message={msg.text} 
                    type={msg.type} 
                  />
                ))}
                
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl px-4 py-2">
                      <Loader className="animate-spin text-gray-600" size={16} />
                    </div>
                  </div>
                )}
                
                {currentTranscript && isListening && (
                  <div className="flex justify-end">
                    <div className="bg-blue-100 text-blue-700 rounded-2xl px-4 py-2 italic">
                      {currentTranscript}...
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
              
              {/* Voice Input Section */}
              <div className="border-t p-4">
                {/* Visualizer */}
                <div className="mb-4">
                  <VoiceVisualizer isListening={isListening} />
                </div>
                
                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  {/* Microphone Button */}
                  <motion.button
                    onClick={toggleListening}
                    className={`p-4 rounded-full shadow-lg ${
                      isListening 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-blue-600 hover:bg-blue-700'
                    } text-white transition`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {isListening ? <MicOff size={24} /> : <Mic size={24} />}
                  </motion.button>
                  
                  {/* Speaker Status */}
                  {isSpeaking && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-3 bg-purple-100 rounded-full"
                    >
                      <Volume2 className="text-purple-600 animate-pulse" size={20} />
                    </motion.div>
                  )}
                </div>
                
                {/* Status Text */}
                <p className="text-center text-sm text-gray-500 mt-3">
                  {isListening 
                    ? 'Sto ascoltando... parla pure!' 
                    : 'Clicca il microfono per parlare'}
                </p>
                
                {/* Microphone Permission Warning */}
                {!isMicrophoneAvailable && (
                  <div className="mt-2 text-xs text-red-500 text-center">
                    Permetti l'accesso al microfono per usare l'assistente vocale
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default VoiceAssistant;