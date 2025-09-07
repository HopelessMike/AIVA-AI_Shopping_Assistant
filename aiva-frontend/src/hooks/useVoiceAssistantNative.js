// src/hooks/useVoiceAssistantNative.js - VERSIONE CORRETTA
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
  const [isAssistantActive, setIsAssistantActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(0); // Per variare i saluti
  
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { setSearchQuery, filterProducts } = useStore();
  
  const wsRef = useRef(null);
  const sessionIdRef = useRef(`session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const recognitionRef = useRef(null);
  const pendingFunctionRef = useRef(null);
  const queuedMessagesRef = useRef([]);
  const inactivityTimeoutRef = useRef(null); // ✅ Timeout per inattività
  const streamBufferRef = useRef(''); // ✅ Buffer per streaming testo
  const isAssistantActiveRef = useRef(false); // ✅ Stato live per evitare stale closures

  // ✅ FRASI DI BENVENUTO VARIATE
  const getWelcomeMessage = useCallback(() => {
    const welcomeMessages = [
      "Ehy Sono AIVA, il tuo personal shopper AI. Come posso aiutarti oggi?",
      "Benvenuto! Ecco AIVA, qui per aiutarti a trovare l'outfit perfetto. Cosa stai cercando?",
      "Eccomi! Dimmi cosa posso fare per te nel nostro negozio.",
      "Ciao! Sono qui per assisterti con il tuo shopping. Di cosa hai bisogno?",
      "Salve! Sono AIVA, l'assistente AI per il tuo shopping. Cosa posso fare per te?"
    ];
    
    const shortMessages = [
      "Eccomi! Di cosa hai bisogno?",
      "Dimmi cosa posso fare per te",
      "Come posso aiutarti?",
      "Sono qui per te, cosa cerchi?"
    ];
    
    // Prima volta o dopo pausa lunga = messaggio completo
    if (sessionCount === 0) {
      setSessionCount(1);
      return welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    } else {
      return shortMessages[Math.floor(Math.random() * shortMessages.length)];
    }
  }, [sessionCount]);

  // Browser support check
  // Mantieni sincronizzato il ref con lo stato
  useEffect(() => {
    isAssistantActiveRef.current = isAssistantActive;
  }, [isAssistantActive]);

  const browserSupportsSpeechRecognition = () => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  };

  // ✅ EXECUTE FUNCTION MIGLIORATA - Gestione Completa Parametri
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
      await new Promise(resolve => setTimeout(resolve, 300));
      
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
            'checkout': '/checkout'
          };
          const path = pageMap[parameters.page] || '/';
          console.log('📍 Navigating to:', path);
          navigate(path);
          break;
          
        case 'search_products':
          const query = parameters.query || parameters.filters?.query || parameters.q || '';
          const filters = parameters.filters || {};
          
          console.log('🔍 Searching with query:', query, 'filters:', filters);
          
          // Navigate to products page
          navigate('/products');
          
          // ✅ APPLICAZIONE FILTRI CORRETTA
          setTimeout(() => {
            // Imposta la query di ricerca
            if (query) {
              setSearchQuery(query);
              
              // Cerca nel campo di ricerca e aggiorna
              const searchInput = document.querySelector('input[placeholder="Cerca prodotti..."]');
              if (searchInput) {
                searchInput.value = query;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            
            // Applica filtri specifici
            if (Object.keys(filters).length > 0) {
              filterProducts(filters);
              
              // ✅ GESTIONE FILTRI UI AUTOMATICA
              if (filters.category) {
                const categorySelect = document.querySelector('select');
                if (categorySelect) {
                  categorySelect.value = filters.category;
                  categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
              
              if (filters.gender) {
                // Applica filtro gender se presente
                console.log('Applying gender filter:', filters.gender);
              }
            }
          }, 500);
          break;
          
        case 'get_product_details':
          const productId = parameters.product_id;
          console.log('📦 Showing product:', productId);
          navigate(`/products/${productId}`);
          break;
          
        case 'add_to_cart':
          console.log('🛒 Adding to cart:', parameters);
          
          // ✅ GESTIONE COMPLETA ADD TO CART CON VARIANTI
          try {
            // Se siamo nella pagina prodotto, usa il prodotto corrente
            const currentPath = window.location.pathname;
            if (currentPath.includes('/products/')) {
              const productIdFromUrl = currentPath.split('/products/')[1];
              
              // Simula selezione varianti dalla pagina
              const size = parameters.size || parameters.taglia || 'M';
              const color = parameters.color || parameters.colore || 'nero';
              const quantity = parameters.quantity || parameters.quantita || 1;
              
              // Trova bottoni per selezione automatica
              setTimeout(() => {
                // Seleziona taglia
                const sizeButtons = document.querySelectorAll('button');
                for (let btn of sizeButtons) {
                  if (btn.textContent.trim().toUpperCase() === size.toUpperCase()) {
                    btn.click();
                    break;
                  }
                }
                
                // Seleziona colore
                for (let btn of sizeButtons) {
                  if (btn.textContent.toLowerCase().includes(color.toLowerCase())) {
                    btn.click();
                    break;
                  }
                }
                
                // Clicca aggiungi al carrello
                setTimeout(() => {
                  const addToCartBtn = Array.from(document.querySelectorAll('button'))
                    .find(btn => btn.textContent.includes('Aggiungi al Carrello') || 
                                btn.textContent.includes('Add to Cart'));
                  if (addToCartBtn) {
                    addToCartBtn.click();
                  }
                }, 300);
              }, 200);
              
            } else {
              // Usa prodotto generico se non in pagina prodotto
              const mockProduct = {
                id: parameters.product_id || '550e8400-0001-41d4-a716-446655440001',
                name: parameters.product_name || 'Prodotto Selezionato',
                price: parameters.price || 49.90,
                brand: 'Fashion Brand'
              };
              
              await addToCart(
                mockProduct,
                parameters.size || 'M',
                parameters.color || 'nero',
                parameters.quantity || 1
              );
              
              // Mostra feedback immediato
              setTimeout(() => {
                const event = new CustomEvent('cart-updated', {
                  detail: { message: 'Prodotto aggiunto al carrello!', type: 'success' }
                });
                window.dispatchEvent(event);
              }, 500);
            }
          } catch (error) {
            console.error('Error adding to cart:', error);
          }
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
          setTimeout(() => {
            // Trigger recommendations logic
            const event = new CustomEvent('show-recommendations');
            window.dispatchEvent(event);
          }, 300);
          break;
          
        case 'clear_cart':
          console.log('🗑️ Clearing cart');
          const { clearCart } = useCart();
          await clearCart();
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
        // ✅ Ensure listening resumes after function execution when assistant is active
        if (isAssistantActive && !isSpeaking) {
          try {
            if (!recognitionRef.current) {
              recognitionRef.current = initializeSpeechRecognition();
            }
            if (recognitionRef.current) {
              recognitionRef.current.start();
              console.log('🎤 Listening resumed after function execution');
            }
          } catch (e) {
            console.log('Could not resume listening after function execution:', e.message);
          }
        }
      }, 800);
    }
  }, [navigate, addToCart, setSearchQuery, filterProducts]);

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
          // ✅ Reset timeout di inattività quando l'utente parla
          resetInactivityTimeout();
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
      
      // ✅ CONTROLLO MIGLIORATO PER RIAVVIO
      if (isUserTurn && !isSpeaking && !isExecutingFunction && isAssistantActive) {
        restartListening();
      }
    };

    return recognition;
  }, [isSpeaking, isUserTurn, isExecutingFunction, isAssistantActive]);

  // Restart listening - ✅ MIGLIORATO con controlli più robusti
  const restartListening = useCallback(() => {
    if (!isSpeaking && isUserTurn && !isExecutingFunction && isAssistantActive) {
      console.log('🔄 Attempting to restart listening...');
      setTimeout(() => {
        // ✅ Controlli più rigorosi prima del riavvio
        if (!recognitionRef.current && !isSpeaking && isUserTurn && !isExecutingFunction && isAssistantActive) {
          try {
            recognitionRef.current = initializeSpeechRecognition();
            if (recognitionRef.current) {
              recognitionRef.current.start();
              console.log('✅ Recognition restarted successfully');
            } else {
              console.error('❌ Failed to initialize recognition for restart');
              setError('Errore nel riavvio del riconoscimento vocale');
            }
          } catch (e) {
            console.error('❌ Failed to restart listening:', e.message);
            setError('Errore nel riavvio del riconoscimento vocale');
          }
        } else if (recognitionRef.current && !isSpeaking && isUserTurn && !isExecutingFunction && isAssistantActive) {
          try {
            recognitionRef.current.start();
            console.log('🔄 Recognition restarted (existing instance)');
          } catch (e) {
            console.error('❌ Failed to restart existing recognition:', e.message);
            // Se fallisce, prova a reinizializzare
            try {
              recognitionRef.current = initializeSpeechRecognition();
              if (recognitionRef.current) {
                recognitionRef.current.start();
                console.log('✅ Recognition restarted after reinitialization');
              }
            } catch (reinitError) {
              console.error('❌ Failed to reinitialize recognition:', reinitError.message);
              setError('Errore critico nel riconoscimento vocale');
            }
          }
        } else {
          console.log('🔄 Skipping restart - conditions not met:', {
            hasRecognition: !!recognitionRef.current,
            isSpeaking,
            isUserTurn,
            isExecutingFunction,
            isAssistantActive
          });
        }
      }, 800); // ✅ Aumentato il delay per stabilità
    }
  }, [isSpeaking, isUserTurn, isExecutingFunction, isAssistantActive, initializeSpeechRecognition]);

  // ✅ Stop assistant completely (estratto per evitare dipendenze circolari)
  const stopAssistant = useCallback(() => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    } catch (e) {
      console.warn('Abort recognition error:', e?.message || e);
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsSpeaking(false);
    setIsExecutingFunction(false);
    setIsProcessing(false);
    setIsAssistantActive(false);
    setIsUserTurn(true);
    pendingFunctionRef.current = null;
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    console.log('✅ Assistant completely stopped');
  }, []);

  // ✅ Gestione timeout di inattività
  const resetInactivityTimeout = useCallback(() => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    
    if (isAssistantActive) {
      inactivityTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Timeout di inattività raggiunto, chiudendo assistente');
        stopAssistant(); // Chiude l'assistente senza dipendenze circolari
      }, 30000); // 30 secondi di inattività
    }
  }, [isAssistantActive, stopAssistant]);

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
          // ✅ Flush any queued messages
          try {
            if (queuedMessagesRef.current.length > 0) {
              console.log('📬 Flushing queued messages:', queuedMessagesRef.current.length);
              for (const msg of queuedMessagesRef.current) {
                ws.send(JSON.stringify(msg));
              }
              queuedMessagesRef.current = [];
            }
          } catch (e) {
            console.error('Error flushing queued messages:', e);
          }
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

  // ✅ TEXT-TO-SPEECH MIGLIORATO - Voce più Fluida
  const speak = useCallback((text, callback, isWelcomeMessage = false) => {
    if ('speechSynthesis' in window) {
      // Stop completely any recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          console.log('Error aborting recognition:', e);
        }
        recognitionRef.current = null;
      }
      setIsListening(false);
      
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'it-IT';
      utterance.rate = 1.1; // ✅ Velocità più naturale
      utterance.pitch = 1.1; // ✅ Tono più gradevole  
      utterance.volume = 0.9;
      
      // ✅ SELEZIONE VOCE ITALIANA MIGLIORATA
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        // Cerca voci italiane in ordine di preferenza
        const preferredVoices = [
          voices.find(v => v.lang === 'it-IT' && v.name.includes('Google')),
          voices.find(v => v.lang === 'it-IT' && v.name.includes('Microsoft')),
          voices.find(v => v.lang.startsWith('it-IT')),
          voices.find(v => v.lang.startsWith('it'))
        ];
        
        const italianVoice = preferredVoices.find(v => v);
        if (italianVoice) {
          utterance.voice = italianVoice;
        }
      };
      
      loadVoices();
      
      utterance.onstart = () => {
        console.log('🔊 Speaking:', text);
        setIsSpeaking(true);
        setIsUserTurn(false);
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
        } else {
          // ✅ SEMPRE riavvia il riconoscimento quando l'assistente è attivo
          if (isAssistantActiveRef.current) {
            console.log('🎤 Preparing to restart listening after speaking');
            setTimeout(() => {
              if (!recognitionRef.current) {
                recognitionRef.current = initializeSpeechRecognition();
              }
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                  console.log('🎤 Listening resumed after speaking');
                  // ✅ Reset timeout di inattività quando inizia ad ascoltare
                  resetInactivityTimeout();
                } catch (e) {
                  console.log('Could not restart listening:', e.message);
                  // ✅ Fallback: prova a reinizializzare
                  try {
                    recognitionRef.current = initializeSpeechRecognition();
                    if (recognitionRef.current) {
                      recognitionRef.current.start();
                      console.log('🎤 Listening resumed after reinitialization');
                      // ✅ Reset timeout anche dopo reinizializzazione
                      resetInactivityTimeout();
                    }
                  } catch (reinitError) {
                    console.error('❌ Failed to restart listening completely:', reinitError.message);
                  }
                }
              }
            }, 800);
          }
        }
        
        if (callback) callback();
      };
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
        setIsUserTurn(true);
        if (callback) callback();
      };
      
      window.speechSynthesis.speak(utterance);
    }
  }, [executeFunction, initializeSpeechRecognition, isAssistantActive]);

  // Handle WebSocket messages - ENHANCED
  const handleWebSocketMessage = (data) => {
    console.log('📨 WebSocket message:', data);
    setMessages(prev => [...prev, data]);
    
    switch (data.type) {
      case 'processing_start':
        setIsProcessing(true);
        break;
      
      case 'stream_start':
        // Reset stream buffer at start
        streamBufferRef.current = '';
        break;
        
      case 'function_start':
        setIsProcessing(false);
        if (data.message) {
          speak(data.message);
        }
        break;
        
      case 'text_chunk':
        // Accumula testo e parla a fine stream
        if (typeof data.content === 'string') {
          streamBufferRef.current += data.content;
        }
        break;

      case 'stream_complete':
        if (streamBufferRef.current.trim()) {
          const text = streamBufferRef.current;
          streamBufferRef.current = '';
          speak(text);
        }
        break;

      case 'function_complete':
      case 'complete':
        setIsProcessing(false);
        
        // Store function to execute after speaking
        if (data.function && data.parameters) {
          console.log('📋 Function ready:', data.function, data.parameters);
          pendingFunctionRef.current = {
            name: data.function,
            params: data.parameters
          };
        }
        
        // Speak response if any
        const message = (streamBufferRef.current && streamBufferRef.current.trim()) || data.message || data.text;
        if (message) {
          // Se è rimasto contenuto stream non parlato, usalo
          streamBufferRef.current = '';
          speak(message);
        } else if (pendingFunctionRef.current) {
          // If no message, execute function immediately
          const { name, params } = pendingFunctionRef.current;
          pendingFunctionRef.current = null;
          executeFunction(name, params);
        } else {
          // ✅ Nothing to say or execute, ensure listening resumes
          console.log('🎤 Preparing to resume listening after completion...');
          setTimeout(() => {
            if (isAssistantActive && !isSpeaking && !isExecutingFunction && isUserTurn) {
              restartListening();
            } else {
              console.log('🎤 Skipping auto-resume - conditions not met:', {
                isAssistantActive,
                isSpeaking,
                isExecutingFunction,
                isUserTurn
              });
            }
          }, 600); // ✅ Delay leggermente aumentato
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
      console.warn('WebSocket not connected, queueing message');
      setError('Connessione in corso...');
      queuedMessagesRef.current.push(message);
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
        current_page: window.location.pathname,
        session_count: sessionCount
      }
    });
  }, [sendMessage, sessionCount]);

  // ✅ TOGGLE LISTENING MIGLIORATO - Chiusura Completa
  const toggleListening = useCallback(async () => {
    console.log('🎤 Toggle listening:', isListening, 'Active:', isAssistantActive);
    
    if (!browserSupportsSpeechRecognition()) {
      setError('Browser non supporta il riconoscimento vocale');
      return;
    }

    setError(null);

    if (isListening || isAssistantActive) {
      // ✅ CHIUSURA COMPLETA DELL'ASSISTENTE
      console.log('🛑 Stopping assistant completely');
      
      // Stop everything
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      
      // Reset all states
      setIsListening(false);
      setIsSpeaking(false);
      setIsExecutingFunction(false);
      setIsProcessing(false);
      setIsAssistantActive(false);
      setIsUserTurn(true);
      
      // Clear any pending functions
      pendingFunctionRef.current = null;
      
      // ✅ Clear inactivity timeout
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      
      console.log('✅ Assistant completely stopped');
      
    } else {
      // Start listening
      console.log('▶️ Starting assistant');
      setIsAssistantActive(true);
      
      // ✅ Avvia timeout di inattività
      resetInactivityTimeout();
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());

        // ✅ AVVIO IMMEDIATO DEL RICONOSCIMENTO SUL GESTO UTENTE (come versione funzionante)
        if (!recognitionRef.current) {
          recognitionRef.current = initializeSpeechRecognition();
        }
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
            console.log('🎤 Recognition started immediately on user gesture');
          } catch (e) {
            console.warn('Recognition start failed initially:', e?.message || e);
          }
        }

        // ✅ Poi riproduci il welcome; al termine si riavvia comunque il listening (fallback già in speak.onend)
        const welcomeMsg = getWelcomeMessage();
        speak(welcomeMsg, undefined, true);
      } catch (error) {
        console.error('Microphone error:', error);
        setError('Permessi microfono negati');
        setIsAssistantActive(false);
      }
    }
  }, [isListening, isAssistantActive, initializeSpeechRecognition, speak, getWelcomeMessage]);

  // ✅ CLEANUP MIGLIORATO
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (wsRef.current) {
        wsRef.current.close();
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
    isAssistantActive,
    
    // Actions
    toggleListening,
    clearError: () => setError(null),
    
    // Capabilities
    browserSupportsSpeechRecognition: browserSupportsSpeechRecognition(),
  };
};