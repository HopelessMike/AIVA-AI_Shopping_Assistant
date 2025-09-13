// src/hooks/useVoiceAssistantNative.js - VERSIONE DEFINITIVA FIXATA
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWebSocketConnection, productAPI } from '../services/api';
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
  const [sessionCount, setSessionCount] = useState(0);
  
  const navigate = useNavigate();
  const { addToCart, removeFromCart, clearCart: clearCartAction, removeLastItem, updateQuantity } = useCart();
  const { setSearchQuery, filterProducts, setMultipleFilters, clearFilters } = useStore();

  const wsRef = useRef(null);
  const sessionIdRef = useRef(`session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const recognitionRef = useRef(null);
  const functionQueueRef = useRef([]);      // ⬅️ nuova coda
  const isProcessingRef = useRef(false);    // usata per gating ASR
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  const processingOwnedBySpeechRef = useRef(false);
  // Listener WS aggiornabile senza dipendenze cicliche
  const handleWSMessageRef = useRef(null);

  const queuedMessagesRef = useRef([]);
  const inactivityTimeoutRef = useRef(null);
  const streamBufferRef = useRef('');
  const isAssistantActiveRef = useRef(false);
  const lastInteractionRef = useRef(Date.now());
  const isRestartingRef = useRef(false); // ✅ NUOVO: Previene riavvii multipli
  const selectedVoiceRef = useRef(null); // ✅ NUOVO: Memorizza la voce selezionata

  // 🔧 nuove ref in cima, vicino agli altri useRef:
  const isSpeakingRef = useRef(false);
  const isUserTurnRef = useRef(true);
  const isExecutingFunctionRef = useRef(false);
  // isProcessingRef e functionQueueRef già dichiarate sopra

  // 🔔 Beep pronto-a-parlare + WS dev guard
  const hasConnectedRef = useRef(false);
  const audioCtxRef = useRef(null);
  const lastBeepAtRef = useRef(0);
  const playReadyBeep = useCallback(() => {
    try {
      // Throttle beep and only when not processing
      if (isProcessingRef.current) return;
      const now = Date.now();
      if (now - lastBeepAtRef.current < 2000) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.18);
      lastBeepAtRef.current = now;
    } catch {}
  }, []);

  const safeStopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        // Evita che onend scateni restart mentre stiamo stoppando volontariamente
        const r = recognitionRef.current;
        recognitionRef.current = null;
        try { r.onend = null; } catch {}
        try { r.stop(); } catch {}
      } catch {}
    }
    setIsListening(false);
  }, []);

  // 🔧 tieni le ref aggiornate quando cambia lo stato:
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { isUserTurnRef.current = isUserTurn; }, [isUserTurn]);
  useEffect(() => { isExecutingFunctionRef.current = isExecutingFunction; }, [isExecutingFunction]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  // drainFunctionQueue is defined after executeFunction to avoid TDZ

  // ✅ TIMEOUT ESTESO - 60 secondi invece di 30
  const INACTIVITY_TIMEOUT = 60000; // 60 seconds
  const INTERACTION_CHECK_INTERVAL = 10000; // Check every 10 seconds

  // Welcome messages
  const getWelcomeMessage = useCallback(() => {
    const welcomeMessages = [
      "Ciao! Sono AIVA, il tuo personal shopper AI. Come posso aiutarti oggi?",
      "Benvenuto! Sono qui per aiutarti a trovare l'outfit perfetto. Cosa stai cercando?",
      "Eccomi! Sono AIVA, dimmi cosa posso fare per te.",
      "Ciao! Sono pronta ad assisterti con il tuo shopping. Di cosa hai bisogno?"
    ];
    
    const shortMessages = [
      "Eccomi di nuovo! Come posso aiutarti?",
      "Bentornato! Cosa cerchi oggi?",
      "Sono qui! Dimmi cosa ti serve."
    ];
    
    if (sessionCount === 0) {
      setSessionCount(1);
      return welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    } else {
      return shortMessages[Math.floor(Math.random() * shortMessages.length)];
    }
  }, [sessionCount]);

  // Browser support check
  useEffect(() => {
    isAssistantActiveRef.current = isAssistantActive;
  }, [isAssistantActive]);

  const browserSupportsSpeechRecognition = () => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  };

  // ✅ SELEZIONE VOCE ITALIANA FEMMINILE MIGLIORATA
  const selectBestItalianVoice = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    
    // Priorità voci italiane femminili
    const voicePreferences = [
      // Google voci femminili italiane
      { name: 'Google italiano', lang: 'it-IT', gender: 'female' },
      { name: 'Alice', lang: 'it-IT' },
      { name: 'Elsa', lang: 'it-IT' },
      { name: 'Carla', lang: 'it-IT' },
      // Microsoft voci femminili italiane
      { name: 'Microsoft Elsa', lang: 'it-IT' },
      { name: 'Microsoft Cosimo', lang: 'it-IT' },
      // Voci generiche italiane femminili
      { lang: 'it-IT', gender: 'female' },
      // Qualsiasi voce italiana
      { lang: 'it-IT' },
      { lang: 'it' }
    ];

    // Cerca la miglior voce disponibile
    for (const pref of voicePreferences) {
      const matchingVoice = voices.find(voice => {
        const langMatch = voice.lang.toLowerCase().startsWith(pref.lang?.toLowerCase() || 'it');
        const nameMatch = !pref.name || voice.name.toLowerCase().includes(pref.name.toLowerCase());
        const genderMatch = !pref.gender || 
          voice.name.toLowerCase().includes('female') || 
          voice.name.toLowerCase().includes('donna') ||
          voice.name.toLowerCase().includes('alice') ||
          voice.name.toLowerCase().includes('elsa') ||
          voice.name.toLowerCase().includes('carla');
        
        return langMatch && nameMatch && genderMatch;
      });
      
      if (matchingVoice) {
        console.log('🎤 Selected voice:', matchingVoice.name, matchingVoice.lang);
        selectedVoiceRef.current = matchingVoice;
        return matchingVoice;
      }
    }
    
    // Fallback: prima voce italiana disponibile
    const italianVoice = voices.find(v => v.lang.toLowerCase().startsWith('it'));
    if (italianVoice) {
      console.log('🎤 Fallback Italian voice:', italianVoice.name);
      selectedVoiceRef.current = italianVoice;
      return italianVoice;
    }
    
    return null;
  }, []);

  // ✅ CARICA VOCI ALL'AVVIO
  useEffect(() => {
    const loadVoices = () => {
      selectBestItalianVoice();
    };
    
    // Carica voci immediatamente
    loadVoices();
    
    // Ricarica quando le voci sono disponibili
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    // Fallback: riprova dopo un delay
    setTimeout(loadVoices, 100);
    setTimeout(loadVoices, 500);
    
    return () => {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [selectBestItalianVoice]);

  // ✅ EXECUTE FUNCTION - Unchanged from previous version
  const executeFunction = useCallback(async (functionName, parameters) => {
    console.log('🎯 Executing function:', functionName, parameters);
    setIsExecutingFunction(true);
    setCurrentFunction(functionName);
    lastInteractionRef.current = Date.now();
    
    // Stop listening during execution
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log('Could not stop recognition:', e.message);
      }
      setIsListening(false);
    }
    
    try {
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
          const query = parameters.query || '';
          const filters = parameters.filters || {};
          
          console.log('🔍 Searching:', query, 'Filters:', filters);
          
          const onSale = !!filters.on_sale;
          const currentPath = window.location.pathname;
          
          if (onSale) {
            if (currentPath !== '/offers') navigate('/offers');
            // Notifica la OffersPage (anche se al momento non usa filtri locali)
            try {
              window.dispatchEvent(new CustomEvent('offers-apply-filters', { detail: { filters, query } }));
            } catch {}
          } else {
            if (currentPath !== '/products') navigate('/products');
            setTimeout(() => {
              if (query) {
                setSearchQuery(query);
                const searchInput = document.querySelector('input[placeholder="Cerca prodotti..."]');
                if (searchInput) {
                  searchInput.value = query;
                  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }
              
              if (Object.keys(filters).length > 0) {
                setMultipleFilters(filters);
                if (parameters.applyUIFilters !== false) {
                  applyUIFilters(filters);
                }
              }
            }, 500);
          }
          break;

        
          
        case 'apply_ui_filters':
          console.log('🎨 Applying UI filters:', parameters.filters);
          if (window.applyProductFilters) {
            window.applyProductFilters(parameters.filters || {});
          } else {
            applyUIFilters(parameters.filters || {});
          }
          break;
          
        case 'get_product_details':
          const productId = parameters.product_id;
          console.log('📦 Showing product:', productId);
          navigate(`/products/${productId}`);
          break;

        case 'open_product_by_name': {
          const name = (parameters?.name || '').toLowerCase().trim();
          const id = window.visibleProductsMap?.[name];
          if (id) {
            navigate(`/products/${id}`);
          } else {
            // fallback: porta sulla lista e applica query
            navigate('/products');
            setTimeout(() => {
              if (window.applyProductFilters) window.applyProductFilters({ query: parameters?.name });
            }, 300);
          }
          break;
        }
          
        case 'add_to_cart':
          console.log('🛒 Adding to cart:', parameters);
          
          try {
            const currentPath = window.location.pathname;
            if (currentPath.includes('/products/')) {
              const size = parameters.size || 'M';
              const color = parameters.color || 'nero';
              
              setTimeout(() => {
                const sizeButtons = document.querySelectorAll('button');
                for (let btn of sizeButtons) {
                  if (btn.textContent.trim().toUpperCase() === size.toUpperCase()) {
                    btn.click();
                    break;
                  }
                }
                
                setTimeout(() => {
                  for (let btn of document.querySelectorAll('button')) {
                    if (btn.textContent.toLowerCase().includes(color.toLowerCase())) {
                      btn.click();
                      break;
                    }
                  }
                  
                  setTimeout(() => {
                    const addBtn = Array.from(document.querySelectorAll('button'))
                      .find(btn => btn.textContent.includes('Aggiungi al Carrello'));
                    if (addBtn) addBtn.click();
                  }, 300);
                }, 300);
              }, 200);
            } else {
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
            }
          } catch (error) {
            console.error('Error adding to cart:', error);
          }
          break;
          
        case 'remove_from_cart':
          console.log('🗑️ Removing from cart:', parameters.item_id);
          if (parameters.item_id) {
            await removeFromCart(parameters.item_id);
          }
          break;
          
        case 'remove_last_cart_item':
          console.log('🗑️ Removing last cart item');
          await removeLastItem();
          break;
          
        case 'update_cart_quantity':
          console.log('📝 Updating quantity:', parameters);
          if (parameters.item_id && parameters.quantity) {
            await updateQuantity(parameters.item_id, parameters.quantity);
          }
          break;
          
        case 'get_cart_summary':
        case 'view_cart':
          console.log('🛒 Opening cart');
          navigate('/cart');
          break;
          
        case 'clear_cart':
          console.log('🗑️ Clearing cart');
          await clearCartAction();
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
            const event = new CustomEvent('show-recommendations');
            window.dispatchEvent(event);
          }, 300);
          break;
          
        case 'close_conversation':
          console.log('👋 Closing conversation');
          stopAssistant();
          break;
          
        case 'get_size_guide':
          try {
            const guide = await productAPI.getSizeGuide(parameters.category || 'pantaloni');
            const parts = [];
            for (const [gender, table] of Object.entries(guide)) {
              parts.push(`${gender}: ${Object.entries(table).map(([k,v])=>`${k}=${v}`).join(', ')}`);
            }
            speak(`Ecco la guida taglie per ${parameters.category}: ${parts.join('. ')}`);
          } catch (e) {
            speak('Non sono riuscita a recuperare la guida taglie al momento.');
          }
          break;

        default:
          console.warn('❓ Unknown function:', functionName);
      }
      
    } catch (error) {
      console.error('❌ Error executing function:', error);
      setError('Errore nell\'esecuzione del comando');
    } finally {
        setTimeout(() => {
          setIsExecutingFunction(false);
          setCurrentFunction(null);
          // passa alla prossima function in coda
          drainFunctionQueue();
          // se non ci sono altre function, riapri il mic
          if (isAssistantActiveRef.current && !isSpeaking && functionQueueRef.current.length === 0) {
            restartListening();
          }
        }, 200); // ⬅️ più reattivo
    }
  }, [navigate, addToCart, removeFromCart, clearCartAction, removeLastItem, updateQuantity, 
      setSearchQuery, setMultipleFilters, isSpeaking]);

  // Now define drainFunctionQueue after executeFunction to avoid TDZ
  const drainFunctionQueue = useCallback(() => {
    if (functionQueueRef.current.length === 0) return;
    const { name, params } = functionQueueRef.current.shift();
    executeFunction(name, params);
  }, [executeFunction]);

  // Apply UI filters helper
  const applyUIFilters = useCallback((filters) => {
    console.log('🎨 Applying UI filters:', filters);
    
    setTimeout(() => {
      if (filters.category) {
        const categorySelect = document.querySelector('select');
        if (categorySelect) {
          for (let option of categorySelect.options) {
            if (option.value.toLowerCase() === filters.category.toLowerCase()) {
              categorySelect.value = option.value;
              categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
      
      if (filters.price_range) {
        const sortSelect = document.querySelectorAll('select')[1];
        if (sortSelect) {
          if (filters.price_range === 'low-to-high') {
            sortSelect.value = 'price-low';
          } else if (filters.price_range === 'high-to-low') {
            sortSelect.value = 'price-high';
          }
          sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      
      filterProducts(filters);
    }, 300);
  }, [filterProducts]);

  // ✅ SPEECH RECOGNITION CORRETTO - NON CONTINUOUS
  const initializeSpeechRecognition = useCallback(() => {
    if (!browserSupportsSpeechRecognition()) {
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false; // ✅ IMPORTANTE: false per evitare loop
    recognition.interimResults = true;
    recognition.lang = 'it-IT';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('🎤 Recognition started');
      setIsListening(true);
      setError(null);
      setIsUserTurn(true);
      lastInteractionRef.current = Date.now();
      isRestartingRef.current = false; // ✅ Reset flag
    };

    recognition.onresult = (event) => {
      if (!isSpeakingRef.current && isUserTurnRef.current && !isExecutingFunctionRef.current) {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Show interim results
        if (interimTranscript) {
          setTranscript(interimTranscript);
        }

        if (finalTranscript) {
          console.log('💬 User said:', finalTranscript);
          setTranscript(finalTranscript);
          resetInactivityTimeout();
          handleVoiceCommand(finalTranscript);
          
          // Stop recognition after getting final result
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'no-speech') {
        if (isAssistantActiveRef.current && !isProcessingRef.current) {
          setTimeout(() => restartListening(), 600);
        }
        return;
      }
      // altri errori
      if (event.error === 'network') {
        setError('Errore di connessione. Riprova.');
      } else {
        setError(`Errore microfono: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log('🔚 Recognition ended');
      setIsListening(false);
      if (
        isAssistantActiveRef.current &&
        !isSpeaking &&
        !isExecutingFunction &&
        !isRestartingRef.current &&
        !isProcessingRef.current &&
        !window.speechSynthesis.speaking &&
        functionQueueRef.current.length === 0
      ) {
        restartListening();
      }
    };

    return recognition;
  }, [isSpeaking, isUserTurn, isExecutingFunction]);

  // ✅ RESTART LISTENING CORRETTO - PREVIENE LOOP
  const restartListening = useCallback(() => {
    if (
      isRestartingRef.current ||
      !isAssistantActiveRef.current ||
      isSpeaking ||
      isExecutingFunction ||
      isProcessingRef.current ||                  // ⬅️ non riaprire durante processing
      functionQueueRef.current.length > 0 ||      // ⬅️ se ci sono function in coda
      window.speechSynthesis.speaking             // ⬅️ non durante TTS
    ) {
      return;
    }

    // Beep "pronto a parlare" (non durante processing)
    playReadyBeep();

    isRestartingRef.current = true;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    setTimeout(() => {
      if (
        isAssistantActiveRef.current &&
        !isSpeaking &&
        !isExecutingFunction &&
        !isProcessingRef.current
      ) {
        try {
          recognitionRef.current = initializeSpeechRecognition();
          if (recognitionRef.current) recognitionRef.current.start();
        } catch (e) {
          console.error('Failed to restart:', e);
        }
      }
      isRestartingRef.current = false;
    }, 220); // piccolo delay per non catturare il beep
  }, [isSpeaking, isExecutingFunction, initializeSpeechRecognition, playReadyBeep]);

  // ✅ STOP ASSISTANT
  const stopAssistant = useCallback(() => {
    console.log('🛑 Stopping assistant');
    
    // Clear recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    
    // Cancel speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    // Clear timeouts
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    
    // Reset all states
    setIsListening(false);
    setIsSpeaking(false);
    setIsExecutingFunction(false);
    setIsProcessing(false);
    setIsAssistantActive(false);
    setIsUserTurn(true);
    isAssistantActiveRef.current = false;
    isRestartingRef.current = false;
    pendingFunctionRef.current = null;
    
    console.log('✅ Assistant stopped');
  }, []);

  // ✅ INACTIVITY TIMEOUT
  const resetInactivityTimeout = useCallback(() => {
    lastInteractionRef.current = Date.now();
    
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    
    if (isAssistantActiveRef.current) {
      inactivityTimeoutRef.current = setTimeout(() => {
        const timeSinceLastInteraction = Date.now() - lastInteractionRef.current;
        
        if (timeSinceLastInteraction >= INACTIVITY_TIMEOUT) {
          console.log('⏰ Inactivity timeout reached');
          speak("Sono ancora qui se hai bisogno. Dì qualcosa o chiuderò la conversazione.", () => {
            setTimeout(() => {
              if (Date.now() - lastInteractionRef.current >= INACTIVITY_TIMEOUT + 10000) {
                stopAssistant();
              }
            }, 10000);
          });
        } else {
          resetInactivityTimeout();
        }
      }, INTERACTION_CHECK_INTERVAL);
    }
  }, [stopAssistant]);

  // Singleton WS & deduper globale (sopravvive all'HMR)
  if (!window.__AIVA_SINGLETON__) {
    window.__AIVA_SINGLETON__ = { ws: null, listeners: new Set(), lastFnSigTs: new Map() };
  }
  const WS_SINGLETON = window.__AIVA_SINGLETON__;

  // WebSocket connection (singleton & HMR-proof)
  useEffect(() => {
    if (WS_SINGLETON.ws && WS_SINGLETON.ws.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket reusing existing connection');
      setIsConnected(true);
    } else {
      const connectWebSocket = () => {
        try {
          const ws = createWebSocketConnection(sessionIdRef.current);
          WS_SINGLETON.ws = ws;

          ws.onopen = () => {
            console.log('🔌 WebSocket connected');
            setIsConnected(true);
            if (queuedMessagesRef.current.length > 0) {
              for (const msg of queuedMessagesRef.current) {
                ws.send(JSON.stringify(msg));
              }
              queuedMessagesRef.current = [];
            }
          };

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              WS_SINGLETON.listeners.forEach(fn => fn(data));
            } catch (error) {
              console.error('Parse error:', error);
            }
          };

          ws.onerror = (error) => {
            console.error('WebSocket error:', error);
          };

          ws.onclose = () => {
            console.log('WebSocket disconnected');
            setIsConnected(false);
            let attempts = 0;
            const attemptReconnect = () => {
              if (attempts >= 5) return;
              attempts += 1;
              const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
              setTimeout(() => { connectWebSocket(); }, delay);
            };
            attemptReconnect();
          };
        } catch (error) {
          console.error('Connection failed:', error);
        }
      };

      connectWebSocket();
    }

    const listener = (data) => {
      if (handleWSMessageRef.current) {
        try { handleWSMessageRef.current(data); } catch (e) { console.error(e); }
      }
    };
    WS_SINGLETON.listeners.add(listener);
    return () => {
      WS_SINGLETON.listeners.delete(listener);
    };
  }, []);

  // ✅ TEXT-TO-SPEECH CON VOCE ITALIANA FEMMINILE
  const sanitizeTextForTTS = (s) => (s || '')
    // blocchi di codice
    .replace(/```[\s\S]*?```/g, ' ')
    // inline code
    .replace(/`[^`]*`/g, ' ')
    // markdown base (*, **, _, ~, #, >, -)
    .replace(/[\*_~>#-]+/g, ' ')
    // link [testo](url) -> testo
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    // spazi multipli
    .replace(/\s{2,}/g, ' ')
    .trim();

  const speak = useCallback((text, callback) => {
    if ('speechSynthesis' in window) {
      safeStopRecognition(); // assicura mic off
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(sanitizeTextForTTS(text));
      utterance.lang = 'it-IT';
      utterance.rate = 1.0;
      utterance.pitch = 1.1;
      utterance.volume = 0.9;

      if (selectedVoiceRef.current) utterance.voice = selectedVoiceRef.current;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsUserTurn(false);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsUserTurn(true);

        // se lo stream/complete ha preso possesso del processing, chiudilo ora
        if (processingOwnedBySpeechRef.current) {
          setIsProcessing(false);
          isProcessingRef.current = false; // ✅ allinea subito la ref
          processingOwnedBySpeechRef.current = false;
        }

        // se ci sono altre function in coda, esegui; altrimenti riapri il mic
        if (functionQueueRef.current.length > 0) {
          drainFunctionQueue();
        } else if (
          isAssistantActiveRef.current &&
          !isRestartingRef.current &&
          !isProcessingRef.current &&
          !window.speechSynthesis.speaking
        ) {
          restartListening();
        }

        if (callback) callback();
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setIsUserTurn(true);
        if (processingOwnedBySpeechRef.current) {
          setIsProcessing(false);
          processingOwnedBySpeechRef.current = false;
        }
        if (callback) callback();
      };

      window.speechSynthesis.speak(utterance);
    }
  }, [safeStopRecognition, drainFunctionQueue]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data) => {
    console.log('📨 WebSocket message:', data.type);
    setMessages(prev => [...prev, data]);
    lastInteractionRef.current = Date.now();
    
    switch (data.type) {
      case 'processing_start': {
        setIsProcessing(true);
        setIsUserTurn(false);
        safeStopRecognition(); // mic OFF
        break;
      }

      case 'function_start': {
        // Rimaniamo in processing finché non completiamo la funzione/risposta
        break;
      }

      case 'stream_start': {
        streamBufferRef.current = '';
        break;
      }

      case 'text_chunk': {
        if (typeof data.content === 'string') {
          streamBufferRef.current += data.content;
        }
        break;
      }

      case 'stream_complete': {
        if (streamBufferRef.current.trim()) {
          const text = streamBufferRef.current;
          streamBufferRef.current = '';
          // parleremo; lo stato processing sarà chiuso al termine del TTS (vedi speak.onend)
          processingOwnedBySpeechRef.current = true;
          speak(text);
        }
        break;
      }

      case 'function_complete': {
        // de-dup in finestra 1.5s
        const fnSignature = (name, params) => {
          try { return `${name}:${JSON.stringify(params)}`; } catch { return `${name}:<unserializable>`; }
        };
        const sig = fnSignature(data.function, data.parameters || {});
        const now = Date.now();
        const last = (window.__AIVA_SINGLETON__?.lastFnSigTs || new Map()).get(sig) || 0;
        if (window.__AIVA_SINGLETON__) {
          if (now - last < 1500) {
            break; // duplicato ravvicinato -> ignora
          }
          window.__AIVA_SINGLETON__.lastFnSigTs.set(sig, now);
        }

        setIsProcessing(true);
        if (data.function && data.parameters) {
          functionQueueRef.current.push({ name: data.function, params: data.parameters });
          drainFunctionQueue();
        }
        break;
      }

      case 'response': {
        // brevi risposte non-streaming
        if (data.message) {
          setIsProcessing(true); // busy durante TTS
          processingOwnedBySpeechRef.current = true;
          speak(data.message);
        }
        break;
      }

      case 'complete': {
        // Se c'è un messaggio residuo, parlalo; altrimenti prosegui con la coda
        if (data.message) {
          processingOwnedBySpeechRef.current = true;
          speak(data.message);
        } else {
          // Fine turno senza parlato: possiamo liberare il processing
          setIsProcessing(false);
          isProcessingRef.current = false; // ✅ allinea la ref
          drainFunctionQueue();
          // Se non ci sono function da eseguire, riapri il microfono
          if (
            functionQueueRef.current.length === 0 &&
            isAssistantActiveRef.current &&
            !window.speechSynthesis.speaking
          ) {
            restartListening();
          }
        }
        break;
      }

      case 'error':
        setIsProcessing(false);
        setError(data.message || 'Errore');
        break;
    }
  }, [speak, executeFunction, stopAssistant]);

  // Aggiorna la ref del listener dopo ogni render utile
  useEffect(() => {
    handleWSMessageRef.current = handleWebSocketMessage;
  }, [handleWebSocketMessage]);

  // Send message to WebSocket
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('📤 Sending message');
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, queueing message');
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
        cart_count: useStore.getState().cartCount,
        preferences: useStore.getState().preferences,
        session_count: sessionCount,
        // 🔊 nuovo contesto UI
        current_product: (window.currentProductContext || null),
        visible_products: (window.visibleProductIds || []),
        visible_products_map: (window.visibleProductsMap || {}),
        ui_filters: {
          q: (window.productsSearchQuery || ''),
          category: (window.productsSelectedCategory || '')
        }
      }
    });
  }, [sendMessage, sessionCount]);

  // ✅ TOGGLE LISTENING
  const toggleListening = useCallback(async () => {
    console.log('🎤 Toggle listening:', isListening, 'Active:', isAssistantActive);
    
    if (!browserSupportsSpeechRecognition()) {
      setError('Browser non supporta il riconoscimento vocale');
      return;
    }

    setError(null);

    if (isListening || isAssistantActive) {
      stopAssistant();
    } else {
      console.log('▶️ Starting assistant');
      setIsAssistantActive(true);
      isAssistantActiveRef.current = true;
      isRestartingRef.current = false;
      
      resetInactivityTimeout();
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());

        // Parla prima, poi l'ascolto ripartirà da speak().onend
        const welcomeMsg = getWelcomeMessage();
        speak(welcomeMsg, undefined, true);
      } catch (error) {
        console.error('Microphone error:', error);
        setError('Permessi microfono negati');
        setIsAssistantActive(false);
        isAssistantActiveRef.current = false;
      }
    }
  }, [isListening, isAssistantActive, initializeSpeechRecognition, speak, getWelcomeMessage, 
      stopAssistant, resetInactivityTimeout]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
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