// src/hooks/useVoiceAssistantNative.js - Fixed Function Execution
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWebSocketConnection } from '../services/api';
import { useCart } from './useCart';
import useStore from '../store';

export const useVoiceAssistantNative = () => {
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExecutingFunction, setIsExecutingFunction] = useState(false);
  const [currentFunction, setCurrentFunction] = useState(null);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isUserTurn, setIsUserTurn] = useState(true);
  const [isAssistantActive, setIsAssistantActive] = useState(false); // Track if assistant is active
  
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { setSearchQuery } = useStore();
  
  const wsRef = useRef(null);
  const sessionIdRef = useRef(`session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const recognitionRef = useRef(null);
  const pendingFunctionRef = useRef(null);

  // Browser support check
  const browserSupportsSpeechRecognition = () => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  };

  // Execute AI Functions - ENHANCED
  const executeFunction = useCallback(async (functionName, parameters) => {
    console.log('🎯 Executing function:', functionName, parameters);
    setIsExecutingFunction(true);
    setCurrentFunction(functionName);
    
    // Stop listening during execution
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      setIsListening(false);
    }
    
    try {
      // Add delay to show execution state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      switch (functionName) {
        case 'navigate_to_page':
        case 'navigate':
          const pageMap = {
            'home': '/',
            'prodotti': '/products',
            'products': '/products',
            'offerte': '/offers',
            'offers': '/offers',
            'carrello': '/cart',
            'cart': '/cart',
          };
          const path = pageMap[parameters.page] || '/';
          console.log('📍 Navigating to:', path);
          navigate(path);
          break;
          
        case 'search_products':
          const query = parameters.query || parameters.filters?.query || '';
          console.log('🔍 Searching for:', query);
          
          // Navigate to products page with search
          navigate('/products');
          
          // Set search query after navigation
          setTimeout(() => {
            const searchInput = document.querySelector('input[placeholder="Cerca prodotti..."]');
            if (searchInput) {
              searchInput.value = query;
              searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            setSearchQuery(query);
          }, 100);
          break;
          
        case 'get_product_details':
          const productId = parameters.product_id;
          console.log('📦 Showing product:', productId);
          navigate(`/products/${productId}`);
          break;
          
        case 'add_to_cart':
          console.log('🛒 Adding to cart:', parameters);
          // Get product from store or create mock
          const mockProduct = {
            id: parameters.product_id || '550e8400-0001-41d4-a716-446655440001',
            name: parameters.product_name || 'Prodotto',
            price: parameters.price || 49.90,
            brand: 'Fashion Brand'
          };
          
          await addToCart(
            mockProduct,
            parameters.size || 'M',
            parameters.color || 'nero',
            parameters.quantity || 1
          );
          
          // Show success feedback
          setTimeout(() => {
            alert('Prodotto aggiunto al carrello!');
          }, 500);
          break;
          
        case 'get_cart_summary':
        case 'view_cart':
          console.log('🛒 Opening cart');
          navigate('/cart');
          break;
          
        case 'get_current_promotions':
        case 'show_offers':
          console.log('🏷️ Showing offers');
          navigate('/offers');
          break;
          
        case 'get_recommendations':
          console.log('💡 Getting recommendations');
          navigate('/products');
          break;
          
        default:
          console.warn('❓ Unknown function:', functionName);
      }
      
    } catch (error) {
      console.error('❌ Error executing function:', error);
      setError('Errore nell\'esecuzione del comando');
    } finally {
      // Clear execution state
      setTimeout(() => {
        setIsExecutingFunction(false);
        setCurrentFunction(null);
        
        // Restart listening if needed
        if (!isSpeaking) {
          restartListening();
        }
      }, 1000);
    }
  }, [navigate, addToCart, setSearchQuery, isSpeaking]);

  // Initialize speech recognition
  const initializeSpeechRecognition = useCallback(() => {
    if (!browserSupportsSpeechRecognition()) {
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'it-IT';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('🎤 Recognition started');
      setIsListening(true);
      setError(null);
      setIsUserTurn(true);
    };

    recognition.onresult = (event) => {
      if (!isSpeaking && isUserTurn && !isExecutingFunction) {
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }

        if (finalTranscript) {
          console.log('💬 User said:', finalTranscript);
          setTranscript(finalTranscript);
          handleVoiceCommand(finalTranscript);
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      
      console.error('❌ Recognition error:', event.error);
      setIsListening(false);
      
      if (event.error === 'no-speech') {
        restartListening();
      } else if (event.error !== 'aborted') {
        setError(`Errore: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('🔚 Recognition ended');
      setIsListening(false);
      
      if (isUserTurn && !isSpeaking && !isExecutingFunction) {
        restartListening();
      }
    };

    return recognition;
  }, [isSpeaking, isUserTurn, isExecutingFunction]);

  // Restart listening
  const restartListening = useCallback(() => {
    if (!isSpeaking && isUserTurn && !isExecutingFunction) {
      setTimeout(() => {
        if (recognitionRef.current && !isSpeaking && !isExecutingFunction) {
          try {
            recognitionRef.current.start();
            console.log('🔄 Restarted listening');
          } catch (e) {
            console.log('Already listening');
          }
        }
      }, 500);
    }
  }, [isSpeaking, isUserTurn, isExecutingFunction]);

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = createWebSocketConnection(sessionIdRef.current);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('🔌 WebSocket connected');
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (error) {
            console.error('Parse error:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setError('Errore di connessione');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          attemptReconnect();
        };
      } catch (error) {
        console.error('Connection failed:', error);
        setError('Impossibile connettersi');
      }
    };

    const attemptReconnect = () => {
      if (reconnectAttemptsRef.current < 5) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

  // Text-to-Speech
  const speak = useCallback((text, callback, isWelcomeMessage = false) => {
    if ('speechSynthesis' in window) {
      // CRITICAL: Completely stop recognition and clear reference
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          console.log('Error aborting recognition:', e);
        }
        recognitionRef.current = null; // Clear reference completely
      }
      setIsListening(false);
      
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'it-IT';
      utterance.rate = 1.0;
      utterance.pitch = 1.3;
      utterance.volume = 0.9;
      
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        const italianVoice = voices.find(v => v.lang.startsWith('it'));
        if (italianVoice) {
          utterance.voice = italianVoice;
        }
      };
      
      loadVoices();
      
      utterance.onstart = () => {
        console.log('🔊 Speaking:', text);
        setIsSpeaking(true);
        setIsUserTurn(false);
        // Ensure microphone is completely off
        if (recognitionRef.current) {
          recognitionRef.current.abort();
          recognitionRef.current = null;
        }
      };
      
      utterance.onend = () => {
        console.log('🔇 Finished speaking');
        setIsSpeaking(false);
        setIsUserTurn(true);
        
        // Execute pending function if any
        if (pendingFunctionRef.current) {
          const { name, params } = pendingFunctionRef.current;
          pendingFunctionRef.current = null;
          executeFunction(name, params);
        } else if (isWelcomeMessage) {
          // Restart listening after welcome message to allow user response
          console.log('🎤 Restarting listening for user response');
          setTimeout(() => {
            if (!recognitionRef.current) {
              recognitionRef.current = initializeSpeechRecognition();
            }
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start();
                console.log('🎤 Listening for user response');
              } catch (e) {
                console.log('Could not restart listening:', e.message);
              }
            }
          }, 1000); // 1 second delay to allow AI to finish
        } else {
          // For regular AI responses, don't restart automatically
          console.log('🎤 Waiting for user to click microphone to continue');
        }
        
        if (callback) callback();
      };
      
      window.speechSynthesis.speak(utterance);
    }
  }, [executeFunction, initializeSpeechRecognition]);

  // Handle WebSocket messages - ENHANCED
  const handleWebSocketMessage = (data) => {
    console.log('📨 WebSocket message:', data);
    setMessages(prev => [...prev, data]);
    
    switch (data.type) {
      case 'processing_start':
        setIsProcessing(true);
        break;
        
      case 'function_start':
        setIsProcessing(false);
        if (data.message) {
          speak(data.message);
        }
        break;
        
      case 'function_complete':
      case 'complete':
        setIsProcessing(false);
        
        // Store function to execute after speaking
        if (data.function && data.parameters) {
          console.log('📋 Function ready:', data.function);
          pendingFunctionRef.current = {
            name: data.function,
            params: data.parameters
          };
        }
        
        // Speak response if any
        const message = data.message || data.text;
        if (message) {
          speak(message);
        } else if (pendingFunctionRef.current) {
          // If no message, execute function immediately
          const { name, params } = pendingFunctionRef.current;
          pendingFunctionRef.current = null;
          executeFunction(name, params);
        }
        break;
        
      case 'response':
        setIsProcessing(false);
        if (data.message || data.text) {
          speak(data.message || data.text);
        }
        break;
        
      case 'error':
        setIsProcessing(false);
        setError(data.message || 'Errore');
        break;
    }
  };

  // Send message to WebSocket
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('📤 Sending:', message);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
      setError('Connessione persa');
    }
  }, []);

  // Handle voice command
  const handleVoiceCommand = useCallback((text) => {
    if (!text.trim()) return;

    setMessages(prev => [...prev, { 
      type: 'user', 
      text,
      timestamp: new Date().toISOString()
    }]);
    
    setTranscript('');
    
    sendMessage({
      type: 'voice_command',
      text: text,
      context: {
        session_id: sessionIdRef.current,
        timestamp: new Date().toISOString(),
        current_page: window.location.pathname
      }
    });
  }, [sendMessage]);

  // Toggle listening
  const toggleListening = useCallback(async () => {
    console.log('🎤 Toggle listening:', isListening);
    
    if (!browserSupportsSpeechRecognition()) {
      setError('Browser non supporta il riconoscimento vocale');
      return;
    }

    setError(null);

    if (isListening) {
      // Stop everything
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsListening(false);
      setIsSpeaking(false);
      setIsExecutingFunction(false);
      setIsAssistantActive(false); // Deactivate assistant
    } else {
      // Start listening
      setIsAssistantActive(true); // Activate assistant first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        
        recognitionRef.current = initializeSpeechRecognition();
        if (recognitionRef.current) {
          recognitionRef.current.start();
          speak("Ciao! Sono AIVA. Come posso aiutarti con lo shopping?", null, true); // true = welcome message
        }
      } catch (error) {
        console.error('Microphone error:', error);
        setError('Permessi microfono negati');
        setIsAssistantActive(false); // Deactivate on error
      }
    }
  }, [isListening, initializeSpeechRecognition, speak]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    // States
    isListening,
    isConnected,
    messages,
    isProcessing,
    isExecutingFunction,
    currentFunction,
    error,
    transcript,
    isSpeaking,
    isUserTurn,
    isAssistantActive, // Expose assistant active state
    
    // Actions
    toggleListening,
    clearError: () => setError(null),
    
    // Capabilities
    browserSupportsSpeechRecognition: browserSupportsSpeechRecognition(),
  };
};