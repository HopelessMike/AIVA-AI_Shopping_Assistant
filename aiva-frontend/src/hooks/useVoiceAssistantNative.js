// src/hooks/useVoiceAssistantNative.js - VERSIONE DEFINITIVA FIXATA
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWebSocketConnection, productAPI, infoAPI, voiceAPI } from '../services/api';
import { useCart } from './useCart';
import { buildCartSpeechSummary } from './useCart';
import useStore from '../store';

const randomFrom = (list = []) => {
  if (!Array.isArray(list) || list.length === 0) return '';
  const index = Math.floor(Math.random() * list.length);
  return list[index] ?? list[0];
};

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
  const restartListeningRef = useRef(null);

  const queuedMessagesRef = useRef([]);
  const inactivityTimeoutRef = useRef(null);
  const streamBufferRef = useRef('');
  const isStreamingTTSRef = useRef(false);
  const streamReleasePendingRef = useRef(false);
  const utterQueueRef = useRef([]);
  const ttsSafetyTimerRef = useRef(null);
  // ⛔ Scarta messaggi WS residui del turno precedente (attivo dopo barge-in)
  const dropStaleResponsesRef = useRef(false);
  const hasSpokenThisTurnRef = useRef(false);
  const isAssistantActiveRef = useRef(false);
  const isConnectedRef = useRef(false);
  const lastInteractionRef = useRef(Date.now());
  const lastUserTextRef = useRef('');
  const isRestartingRef = useRef(false); // ✅ NUOVO: Previene riavvii multipli
  const selectedVoiceRef = useRef(null); // ✅ NUOVO: Memorizza la voce selezionata
  // 🔊 Barge-in RMS
  const bargeInCtxRef = useRef(null);
  const bargeInStreamRef = useRef(null);
  const bargeInAnalyserRef = useRef(null);
  const bargeInRafRef = useRef(null);
  // Durate finestra di ascolto e chiusura
  const LISTENING_WINDOW_MS = 11000;
  const CLOSING_GRACE_MS = 3000;
  const NO_INPUT_MESSAGES = [
    "Se hai bisogno di altro, sono qui.",
    "Ok! Buon proseguimento, chiamami se ti serve aiuto.",
    "Resto a disposizione se ti serve altro.",
    "Quando vuoi riprendere, basta dirmelo.",
    "Sono qui se ti viene in mente qualcos'altro da vedere.",
    "Va bene, resto in ascolto per quando ti serve.",
    "Va benissimo, resto disponibile se vuoi continuare più tardi.",
    "Prenditi pure il tuo tempo, io rimango qui.",
    "Chiamami pure quando ti viene voglia di esplorare altri look.",
    "Se vuoi riprendere, basta dirmelo e continuiamo da dove eravamo."
  ];
  const listeningTimerRef = useRef(null);
  const activeListenSessionIdRef = useRef(null);
  const beepedThisSessionRef = useRef(false);
  const closingTimerRef = useRef(null);
  const turnLockRef = useRef(false);

  const NAV_ACK_DEFAULT = [
    "Eccoci qua!",
    "Perfetto, ti porto subito lì.",
    "Arriviamo immediatamente.",
    "Va bene, apriamo questa sezione."
  ];
  const NAV_ACK_CART = [
    "Ecco il carrello con ciò che hai scelto.",
    "Ti mostro subito il tuo carrello.",
    "Qui trovi i tuoi articoli in carrello.",
    "Carrello aperto, diamo un'occhiata."
  ];
  const NAV_ACK_OFFERS = [
    "Ecco le offerte del momento.",
    "Ti porto subito tra le promozioni.",
    "Ecco gli sconti attivi ora.",
    "Guarda qui le proposte in saldo."
  ];
  const SEARCH_ACK_MESSAGES = [
    "Ecco i risultati che ho trovato.",
    "Perfetto, ho selezionato alcune proposte per te.",
    "Dai un'occhiata a questi suggerimenti.",
    "Ho filtrato il catalogo per te, spero ti piacciano."
  ];
  const FILTER_ACK_MESSAGES = [
    "Filtri applicati, il catalogo è aggiornato.",
    "Perfetto, ho aggiornato la lista secondo le tue preferenze.",
    "Ecco i prodotti con i filtri richiesti.",
    "Tutto impostato come da indicazioni."
  ];
  const PRODUCT_ACK_MESSAGES = [
    "Ti apro subito la scheda del prodotto.",
    "Eccoci sulla scheda dettagliata.",
    "Ti mostro immediatamente questo articolo.",
    "Apriamo la pagina del prodotto così lo vedi meglio."
  ];
  const CART_ADD_ACK_MESSAGES = [
    "Perfetto, aggiunto al carrello.",
    "Articolo inserito nel carrello.",
    "Fatto, il prodotto è nel tuo carrello.",
    "Aggiunta completata, trovi tutto nel carrello."
  ];
  const CART_REMOVE_ACK_MESSAGES = [
    "Ok, l'ho tolto dal carrello.",
    "Fatto, quel prodotto non è più nel carrello.",
    "Rimosso! Ora il carrello è aggiornato.",
    "Va bene, l'ho eliminato dal carrello."
  ];
  const CART_CLEAR_ACK_MESSAGES = [
    "Carrello svuotato, partiamo da zero.",
    "Ho pulito il carrello, ora è vuoto.",
    "Tutto rimosso, il carrello è di nuovo libero.",
    "Ok, ho eliminato tutti gli articoli dal carrello."
  ];

  const clearListeningTimers = useCallback(() => {
    if (listeningTimerRef.current) { clearTimeout(listeningTimerRef.current); listeningTimerRef.current = null; }
    if (closingTimerRef.current) { clearTimeout(closingTimerRef.current); closingTimerRef.current = null; }
  }, []);

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

  // 🔊 Avvio/stop monitor barge-in: interrompe TTS se rileva voce per ~200ms
  const startBargeInMonitor = useCallback(async () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!bargeInCtxRef.current) bargeInCtxRef.current = new AudioCtx();
      const ctx = bargeInCtxRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      bargeInStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      bargeInAnalyserRef.current = analyser;
      src.connect(analyser);
      let above = 0;
      const thresh = 0.02; // RMS ≈ 2%
      const need = 12;     // ~12 * 16ms ≈ 200ms
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / data.length);
        above = rms > thresh ? above + 1 : 0;
        if (above >= need) {
          try { window.speechSynthesis.cancel(); } catch {}
          // 🔓 sblocca turno e scarta TUTTO il parlato/buffer pendente
          utterQueueRef.current = [];
          streamBufferRef.current = '';
          dropStaleResponsesRef.current = true;
          isStreamingTTSRef.current = false;
          setIsSpeaking(false);  isSpeakingRef.current = false;
          setIsProcessing(false); isProcessingRef.current = false;
          turnLockRef.current = false;
          stopBargeInMonitor();
          if (restartListeningRef.current) restartListeningRef.current();
          return;
        }
        bargeInRafRef.current = requestAnimationFrame(tick);
      };
      bargeInRafRef.current = requestAnimationFrame(tick);
    } catch {}
  }, []);

  const stopBargeInMonitor = useCallback(() => {
    try { if (bargeInRafRef.current) cancelAnimationFrame(bargeInRafRef.current); } catch {}
    bargeInRafRef.current = null;
    try { if (bargeInStreamRef.current) bargeInStreamRef.current.getTracks().forEach(t => t.stop()); } catch {}
    bargeInStreamRef.current = null;
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
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

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
      "Ciao! Sono pronta ad assisterti con il tuo shopping. Di cosa hai bisogno?",
      "Piacere di rivederti da AIVA Boutique! Cosa esploriamo insieme?",
      "Ben arrivato nella nostra vetrina digitale. Posso consigliarti qualcosa di speciale?",
      "Che bello averti qui! Ti va di scoprire qualche novità?",
      "Ciao e ben ritrovato! Possiamo iniziare con qualcosa che hai in mente?"
    ];

    const shortMessages = [
      "Eccomi di nuovo! Come posso aiutarti?",
      "Bentornato! Cosa cerchi oggi?",
      "Sono qui! Dimmi cosa ti serve.",
      "Dimmi pure, sono tutta orecchi.",
      "Hai voglia di dare un'occhiata a qualcosa di nuovo?",
      "Pronta quando vuoi tu!",
      "Tornata in linea! Vuoi che ripartiamo da dove eravamo?",
      "Dimmi pure come posso darti una mano adesso."
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

  // ✅ UTIL: segmenta testo in frasi per TTS enqueue
  const segmentTextIntoSentences = useCallback((text) => {
    const parts = (text || '').split(/(?<=[\.!?])\s+/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [(text || '').trim()].filter(Boolean);
  }, []);

  // ✅ RILASCIO TURNO SICURO post TTS
  const releaseTurnIfIdle = useCallback(() => {
    if (!window.speechSynthesis.speaking && !isSpeakingRef.current && utterQueueRef.current.length === 0) {
      turnLockRef.current = false;
      setIsProcessing(false);
      isProcessingRef.current = false;
      if (isAssistantActiveRef.current && functionQueueRef.current.length === 0) {
        if (restartListeningRef.current) restartListeningRef.current();
      }
    }
  }, []);

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
          // reset di sicurezza prima dell'ack
          streamBufferRef.current = '';
          dropStaleResponsesRef.current = false;
          const navAck = path === '/cart'
            ? randomFrom(NAV_ACK_CART)
            : path === '/offers'
              ? randomFrom(NAV_ACK_OFFERS)
              : randomFrom(NAV_ACK_DEFAULT);
          // conferma breve + rilascio turno in onEnd
          speak(
            navAck || 'Ecco!',
            () => {
              // fine ack → chiudi loading e riapri mic
              setIsProcessing(false); isProcessingRef.current = false;
              turnLockRef.current = false;
              if (restartListeningRef.current) restartListeningRef.current();
            },
            false,
            { enqueue: false }
          );
          // fallback: se l'ack fosse mutato, prova comunque dopo la nav
          scheduleListenAfterNav(1000);
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
          // Ack e rilascio del turno al termine
          speak(randomFrom(SEARCH_ACK_MESSAGES) || 'Ecco!', () => {
            setIsProcessing(false); isProcessingRef.current = false;
            turnLockRef.current = false;
            if (restartListeningRef.current) restartListeningRef.current();
          }, false, { enqueue: false });
          break;

        
          
        case 'apply_ui_filters':
          console.log('🎨 Applying UI filters:', parameters.filters);
          if (window.applyProductFilters) {
            window.applyProductFilters(parameters.filters || {});
          } else {
            applyUIFilters(parameters.filters || {});
          }
          speak(randomFrom(FILTER_ACK_MESSAGES) || 'Fatto.', () => {
            setIsProcessing(false); isProcessingRef.current = false;
            turnLockRef.current = false;
            if (restartListeningRef.current) restartListeningRef.current();
          }, false, { enqueue: false });
          break;
          
        case 'get_product_details':
          const productId = parameters.product_id;
          console.log('📦 Showing product:', productId);
          navigate(`/products/${productId}`);
          speak(randomFrom(PRODUCT_ACK_MESSAGES) || 'Ecco!', () => {
            setIsProcessing(false); isProcessingRef.current = false;
            turnLockRef.current = false;
            if (restartListeningRef.current) restartListeningRef.current();
          }, false, { enqueue: false });
          break;

        case 'open_product_by_name': {
          const name = (parameters?.name || '').toLowerCase().trim();
          const id = window.visibleProductsMap?.[name];
          if (id) {
            navigate(`/products/${id}`);
            scheduleListenAfterNav(800);
          } else {
            // fallback: porta sulla lista e applica query
            navigate('/products');
            setTimeout(() => {
              if (window.applyProductFilters) window.applyProductFilters({ query: parameters?.name });
            }, 300);
            scheduleListenAfterNav(800);
          }
          break;
        }
          
        case 'add_to_cart':
          console.log('🛒 Adding to cart:', parameters);
          
          try {
            const currentPath = window.location.pathname;
            if (currentPath.includes('/products/')) {
              const size = parameters.size || 'M';
              const canonColor = (raw='') => {
                const map = { 'nero':'nero','black':'nero','bianco':'bianco','white':'bianco','blu navy':'blu navy','navy':'blu navy','blu scuro':'blu navy','blu':'blu','azzurro':'azzurro','rosso':'rosso','borgogna':'bordeaux','bordeaux':'bordeaux','verde oliva':'verde oliva','oliva':'verde oliva','verde':'verde','grigio melange':'grigio melange','melange':'grigio melange','antracite':'grigio antracite','grigio':'grigio','beige':'beige','panna':'panna','crema':'panna','cammello':'cammello','marrone':'marrone','rosa':'rosa','giallo':'giallo','viola':'viola' };
                const s = (raw||'').toLowerCase();
                const keys = Object.keys(map).sort((a,b)=>b.length-a.length);
                for (const k of keys) if (s.includes(k)) return map[k];
                const parts = s.split(/[\s/,-]+/).filter(Boolean);
                for (const p of parts) if (map[p]) return map[p];
                return s || 'nero';
              };
              const color = canonColor(parameters.color || 'nero');
              
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
            speak(randomFrom(CART_ADD_ACK_MESSAGES) || 'Aggiunto al carrello.', () => {
              setIsProcessing(false); isProcessingRef.current = false;
              turnLockRef.current = false;
              if (restartListeningRef.current) restartListeningRef.current();
            }, false, { enqueue: false });
          } catch (error) {
            console.error('Error adding to cart:', error);
            speak('Non sono riuscita ad aggiungerlo al carrello.', () => {
              setIsProcessing(false); isProcessingRef.current = false;
              turnLockRef.current = false;
              if (restartListeningRef.current) restartListeningRef.current();
            }, false, { enqueue: false });
          }
          break;
          
        case 'remove_from_cart': {
          const { item_id, product_name, size, color } = parameters || {};
          let id = item_id;
          if (!id && product_name) {
            const key = (s => (s || '')
              .toString()
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, ' ')
              .trim())(`${product_name} ${size || ''} ${color || ''}`);
            id = window.cartItemsMap?.[key];
          }
          console.log('🗑️ Removing from cart:', id || item_id);
          if (id) {
            await removeFromCart(id);
            speak(randomFrom(CART_REMOVE_ACK_MESSAGES) || 'Rimosso dal carrello.');
          } else {
            speak('Non trovo quel prodotto nel carrello. Puoi ripetere il nome o dirmi la taglia e il colore?');
          }
          break;
        }
          
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
          speak(randomFrom(NAV_ACK_CART) || 'Ecco il carrello.', () => {
            setIsProcessing(false); isProcessingRef.current = false;
            turnLockRef.current = false;
            if (restartListeningRef.current) restartListeningRef.current();
          }, false, { enqueue: false });
          break;
          
        case 'clear_cart':
          console.log('🗑️ Clearing cart');
          await clearCartAction();
          speak(randomFrom(CART_CLEAR_ACK_MESSAGES) || 'Carrello svuotato.', () => {
            setIsProcessing(false); isProcessingRef.current = false;
            turnLockRef.current = false;
            if (restartListeningRef.current) restartListeningRef.current();
          }, false, { enqueue: false });
          break;
          
        case 'get_current_promotions':
        case 'show_offers':
          console.log('🏷️ Showing offers');
          navigate('/offers');
          speak('Ecco le offerte.', () => {
            setIsProcessing(false); isProcessingRef.current = false;
            turnLockRef.current = false;
            if (restartListeningRef.current) restartListeningRef.current();
          }, false, { enqueue: false });
          break;

        case 'get_shipping_info': {
          console.log('🚚 Fetching shipping info');
          try {
            const info = await infoAPI.getShippingInfo();
            const italyZone = (info.shipping_zones || []).find(z =>
              (z.zone || '').toLowerCase().includes('italia') ||
              (z.zone || '').toLowerCase().includes('penisola')
            ) || info.shipping_zones?.[0];

            const standard = italyZone?.standard || info.standard_shipping;
            const express = italyZone?.express || info.express_shipping;
            const pickup = info.pickup_point;

            const parts = [];
            if (info.free_shipping_threshold != null) {
              parts.push(`spedizione gratuita sopra i €${Number(info.free_shipping_threshold).toFixed(2)}`);
            }
            if (standard) {
              const price = typeof standard === 'object' ? standard.price : standard;
              const eta = typeof standard === 'object' ? standard.delivery_window || standard.delivery_time : info.delivery_time_standard;
              parts.push(`standard a €${Number(price).toFixed(2)} con consegna in ${eta || 'pochi giorni'}`);
            }
            if (express) {
              const price = typeof express === 'object' ? express.price : express;
              const eta = typeof express === 'object' ? express.delivery_window || express.delivery_time : info.delivery_time_express;
              parts.push(`express a €${Number(price).toFixed(2)} con arrivo in ${eta || '1-2 giorni'}`);
            }
            if (pickup && pickup.enabled !== false) {
              const pickupEta = pickup.delivery_window || pickup.delivery_time || '24 ore';
              parts.push(`ritiro gratuito in boutique disponibile entro ${pickupEta}`);
            }
            if (info.saturday_delivery?.enabled) {
              parts.push(`consegna il sabato a €${Number(info.saturday_delivery.price).toFixed(2)} su ${info.saturday_delivery.area}`);
            }

            const spoken = parts.length
              ? `Ecco le nostre opzioni di spedizione: ${parts.join(', ')}.`
              : 'Le nostre spedizioni sono attive, ma non riesco a recuperare tutti i dettagli in questo momento.';

            speak(spoken, () => {
              setIsProcessing(false); isProcessingRef.current = false;
              turnLockRef.current = false;
              if (restartListeningRef.current) restartListeningRef.current();
            }, false, { enqueue: false });
          } catch (err) {
            console.error('Errore recuperando le spedizioni', err);
            speak('Non riesco a recuperare le informazioni di spedizione ora, riprova tra qualche istante.', () => {
              setIsProcessing(false); isProcessingRef.current = false;
              turnLockRef.current = false;
              if (restartListeningRef.current) restartListeningRef.current();
            }, false, { enqueue: false });
          }
          break;
        }

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
            speak(`Ecco la guida taglie per ${parameters.category}: ${parts.join('. ')}` , () => {
              setIsProcessing(false); isProcessingRef.current = false;
              turnLockRef.current = false;
              if (restartListeningRef.current) restartListeningRef.current();
            }, false, { enqueue: false });
          } catch (e) {
            speak('Non sono riuscita a recuperare la guida taglie al momento.', () => {
              setIsProcessing(false); isProcessingRef.current = false;
              turnLockRef.current = false;
              if (restartListeningRef.current) restartListeningRef.current();
            }, false, { enqueue: false });
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
          // se non sta parlando nessuno ed è tutto fermo, rilascia il turno
          if (!isSpeaking && !window.speechSynthesis.speaking) {
            // safe release
            turnLockRef.current = false;
            setIsProcessing(false);
            isProcessingRef.current = false;
            if (
              isAssistantActiveRef.current &&
              !isRestartingRef.current &&
              functionQueueRef.current.length === 0
            ) {
              restartListening();
            }
          }
        }, 200); // ⬅️ più reattivo
    }
  }, [navigate, addToCart, removeFromCart, clearCartAction, removeLastItem, updateQuantity, 
      setSearchQuery, setMultipleFilters, isSpeaking]);

  // Now define drainFunctionQueue after executeFunction to avoid TDZ
  const drainFunctionQueue = useCallback(() => {
    if (isExecutingFunctionRef.current) return;
    const next = functionQueueRef.current.shift();
    if (!next) return;
    isExecutingFunctionRef.current = true;
    setTimeout(async () => {
      try {
        await executeFunction(next.name, next.params);
      } finally {
        isExecutingFunctionRef.current = false;
        if (functionQueueRef.current.length > 0) {
          drainFunctionQueue();
        } else {
          if (
            isAssistantActiveRef.current &&
            !window.speechSynthesis.speaking &&
            !isSpeakingRef.current &&
            !isProcessingRef.current
          ) {
            if (restartListeningRef.current) {
              restartListeningRef.current();
            }
          }
        }
      }
    }, 0);
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
      // NON azzerare la finestra se è un riavvio nella stessa sessione
      if (!listeningTimerRef.current) {
        listeningTimerRef.current = setTimeout(() => {
          if (!isSpeaking && !isProcessingRef.current) {
            speak(NO_INPUT_MESSAGES[Math.floor(Math.random()*NO_INPUT_MESSAGES.length)], () => {
              closingTimerRef.current = setTimeout(() => {
                if (!isSpeaking && !isProcessingRef.current) {
                  stopAssistant();
                }
              }, CLOSING_GRACE_MS);
            });
          }
        }, LISTENING_WINDOW_MS);
      }
    };

    recognition.onresult = (event) => {
      if (!isSpeakingRef.current && isUserTurnRef.current) {
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
          // chiudi la sessione corrente: niente più beep o timer
          clearListeningTimers();
          activeListenSessionIdRef.current = null;
          beepedThisSessionRef.current = false;
          setTranscript(finalTranscript);
          resetInactivityTimeout();
          // Prende il lock direttamente handleVoiceCommand
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
        return; // lascia scadere la finestra 11s
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
        !turnLockRef.current &&
        !closingTimerRef.current &&
        functionQueueRef.current.length === 0
      ) {
        setTimeout(() => {
          if (
            isAssistantActiveRef.current &&
            !isSpeaking &&
            !isProcessingRef.current &&
            !turnLockRef.current &&
            !closingTimerRef.current
          ) {
            restartListening();
          }
        }, 500);
      }
    };

    return recognition;
  }, [isSpeaking, isUserTurn, isExecutingFunction]);

  // ✅ RESTART LISTENING CORRETTO - PREVIENE LOOP
  const restartListening = useCallback(() => {
    if (
      isRestartingRef.current ||
      !isAssistantActiveRef.current ||
      isSpeakingRef.current ||
      isExecutingFunctionRef.current ||
      isProcessingRef.current ||                  // ⬅️ non riaprire durante processing
      functionQueueRef.current.length > 0 ||      // ⬅️ se ci sono function in coda
      window.speechSynthesis.speaking             // ⬅️ non durante TTS
    ) {
      return;
    }

    // Beep "pronto a parlare" SOLO la prima volta nella sessione
    if (!activeListenSessionIdRef.current) {
      activeListenSessionIdRef.current = `ls-${Date.now()}`;
      beepedThisSessionRef.current = false;
    }
    if (!beepedThisSessionRef.current) {
      playReadyBeep();
      beepedThisSessionRef.current = true;
    }

    isRestartingRef.current = true;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    setTimeout(() => {
      if (
        isAssistantActiveRef.current &&
        !isSpeakingRef.current &&
        !isExecutingFunctionRef.current &&
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

  // Programmatic restart dopo navigazioni/cambi DOM
  const scheduleListenAfterNav = useCallback((delay = 700) => {
    setTimeout(() => {
      if (
        isAssistantActiveRef.current &&
        !isRestartingRef.current &&
        !window.speechSynthesis.speaking &&
        !isSpeakingRef.current &&
        !isProcessingRef.current &&
        functionQueueRef.current.length === 0
      ) {
        if (restartListeningRef.current) {
          restartListeningRef.current();
        }
      }
    }, delay);
  }, []);

  // Aggiorna la ref del restart dopo ogni render utile
  useEffect(() => {
    restartListeningRef.current = restartListening;
  }, [restartListening]);

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
      try { window.speechSynthesis.cancel(); } catch {}
    }
    // ✅ svuota coda TTS e timer safety
    utterQueueRef.current = [];
    if (ttsSafetyTimerRef.current) { clearTimeout(ttsSafetyTimerRef.current); ttsSafetyTimerRef.current = null; }
    
    // Clear timeouts
    if (inactivityTimeoutRef.current) { clearTimeout(inactivityTimeoutRef.current); inactivityTimeoutRef.current = null; }
    clearListeningTimers();          // ⬅️ importante
    if (typeof stopBargeInMonitor === 'function') stopBargeInMonitor();
    
    // Reset all states
    setIsListening(false);
    setIsSpeaking(false);
    setIsExecutingFunction(false);
    setIsProcessing(false);
    setIsAssistantActive(false);
    setIsUserTurn(true);
    isAssistantActiveRef.current = false;
    isRestartingRef.current = false;
    // Svuota coda funzioni e rilascia il turno
    functionQueueRef.current = [];
    turnLockRef.current = false;
    // Allinea subito i flag di processing
    setIsProcessing(false);
    isProcessingRef.current = false;
    
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
    window.__AIVA_SINGLETON__ = { ws: null, listeners: new Set(), queue: [], lastFnSigTs: new Map() };
  }
  const WS_SINGLETON = window.__AIVA_SINGLETON__;

  // WebSocket connection (singleton & HMR-proof)
  useEffect(() => {
    if (WS_SINGLETON.ws && WS_SINGLETON.ws.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket reusing existing connection');
      setIsConnected(true);
      wsRef.current = WS_SINGLETON.ws;
    } else {
      const connectWebSocket = () => {
        try {
          const ws = createWebSocketConnection(sessionIdRef.current);
          WS_SINGLETON.ws = ws;

          ws.onopen = () => {
            console.log('🔌 WebSocket connected');
            setIsConnected(true);
            wsRef.current = ws;
            // Flush global queue
            if (WS_SINGLETON.queue && WS_SINGLETON.queue.length) {
              for (const msg of WS_SINGLETON.queue) {
                try { ws.send(JSON.stringify(msg)); } catch {}
              }
              WS_SINGLETON.queue = [];
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
            wsRef.current = null;
            WS_SINGLETON.ws = null;
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
  const sanitizeTextForTTS = (s) => {
    let out = (s || '')
      // blocchi di codice
      .replace(/```[\s\S]*?```/g, ' ')
      // inline code
      .replace(/`[^`]*`/g, ' ')
      // markdown base (*, **, _, ~, #, >, -)
      .replace(/[\*_~>#-]+/g, ' ')
      // link [testo](url) -> testo
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      // ➜ compattazione inventario: elimina "X pezzi in magazzino/disponibili"
      .replace(/\b\d+\s+(pezzi?|in\s+magazzino|disponibili)\b[^,.]*[.,]?/gi, '')
      // ➜ rimuovi quantificatori ripetuti per taglie/varianti
      .replace(/(\btaglia\b[^.]*?)\s*(,\s*)?\b\d+\b[^.]*\./gi, '$1.')
      // ➜ pronuncia taglie con lettere italiane
      .replace(/\bXXXL\b/gi, 'ics ics ics elle')
      .replace(/\bXXL\b/gi, 'ics ics elle')
      .replace(/\bXL\b/gi, 'ics elle')
      .replace(/\bXXS\b/gi, 'ics ics esse')
      .replace(/\bXS\b/gi, 'ics esse')
      // ➜ rimuovi domande guida non desiderate
      .replace(/vuoi[^.?!]*(taglie|colori|materiali)[^.?!]*[.?!]/gi, ' ')
      // spazi multipli
      .replace(/\s{2,}/g, ' ')
      .trim();
    return out;
  };

  const speak = useCallback((text, onEnd, immediate = false, options = {}) => {
    const { enqueue = false } = options || {};
    if (!('speechSynthesis' in window)) return;
    try {
      // assicurati che il mic sia off durante TTS
      safeStopRecognition();
      setIsSpeaking(true);
      isSpeakingRef.current = true;

      if (immediate) {
        try { window.speechSynthesis.cancel(); } catch {}
        utterQueueRef.current = [];
      }

      const sentences = enqueue ? segmentTextIntoSentences(sanitizeTextForTTS(text)) : [sanitizeTextForTTS(text)];
      sentences.forEach(sentence => {
        if (!sentence) return;
        const utt = new SpeechSynthesisUtterance(sentence);
        utt.lang = 'it-IT';
        utt.rate = 1.0;
        utt.pitch = 1.1;
        utt.volume = 0.9;
        if (selectedVoiceRef.current) utt.voice = selectedVoiceRef.current;
        utt.onstart = () => {
          setIsSpeaking(true);
          isSpeakingRef.current = true;
          setIsUserTurn(false);
          hasSpokenThisTurnRef.current = true;
          if (ttsSafetyTimerRef.current) { clearTimeout(ttsSafetyTimerRef.current); ttsSafetyTimerRef.current = null; }
          // avvia barge-in
          startBargeInMonitor();
        };
        utt.onend = () => {
          // rimuovi l'elemento servito dalla coda
          utterQueueRef.current.shift();
          // se c'è un prossimo, catenalo subito
          if (utterQueueRef.current.length > 0) {
            const nextUtt = utterQueueRef.current[0];
            try { if (nextUtt) window.speechSynthesis.speak(nextUtt); } catch {}
          }
          // se la coda è vuota, chiudi stato speaking PRIMA del callback
          if (utterQueueRef.current.length === 0) {
            stopBargeInMonitor();
            setIsSpeaking(false);
            isSpeakingRef.current = false;
            if (streamReleasePendingRef.current) {
              streamReleasePendingRef.current = false;
              releaseTurnIfIdle();
            }
            if (typeof onEnd === 'function') onEnd();
          }
        };
        utterQueueRef.current.push(utt);
      });

      // avvia se non sta già parlando
      if (!window.speechSynthesis.speaking) {
        const next = utterQueueRef.current[0];
        if (next) window.speechSynthesis.speak(next);
      }

      // safety release se engine resta muto
      if (!ttsSafetyTimerRef.current) {
        ttsSafetyTimerRef.current = setTimeout(() => {
          if (!window.speechSynthesis.speaking && utterQueueRef.current.length === 0) {
            setIsSpeaking(false);
            isSpeakingRef.current = false;
            releaseTurnIfIdle();
          }
        }, 1500);
      }
    } catch {}
  }, [safeStopRecognition, segmentTextIntoSentences, releaseTurnIfIdle]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data) => {
    // ⛔ se non sono attivo, ignora il messaggio
    if (!isAssistantActiveRef.current) return;
    console.log('📨 WebSocket message:', data.type);
    // ⛔ Se stiamo scartando risposte stale del turno precedente, accetta solo il nuovo avvio
    if (dropStaleResponsesRef.current && data.type !== 'processing_start') {
      console.log('⏭️ Dropped stale WS message:', data.type);
      return;
    }
    setMessages(prev => [...prev, data]);
    lastInteractionRef.current = Date.now();
    
    switch (data.type) {
      case 'processing_start': {
        setIsProcessing(true);
        isProcessingRef.current = true;
        setIsUserTurn(false);
        processingOwnedBySpeechRef.current = false; // verrà true solo se parleremo
        safeStopRecognition(); // mic OFF
        // prepara buffer per eventuale stream
        streamBufferRef.current = '';
        dropStaleResponsesRef.current = false; // ✅ da qui ricominciamo ad accettare messaggi
        break;
      }

      case 'function_start': {
        // Rimaniamo in processing finché non completiamo la funzione/risposta
        break;
      }

      case 'stream_start': {
        // Disabilita parlato chunk-by-chunk: bufferizza soltanto
        streamBufferRef.current = '';
        isStreamingTTSRef.current = true;
        streamReleasePendingRef.current = false;
        break;
      }

      case 'text_chunk': {
        // Niente TTS qui: accumula e parleremo al stream_complete
        if (typeof data.content === 'string') {
          streamBufferRef.current += (data.content || '') + ' ';
        }
        break;
      }

      case 'stream_complete': {
        // Parla una sola volta il buffer
        isStreamingTTSRef.current = false;
        const text = sanitizeTextForTTS(streamBufferRef.current.trim());
        streamBufferRef.current = '';
        if (text) {
          processingOwnedBySpeechRef.current = true;
          speak(text, () => {
            setIsProcessing(false);
            isProcessingRef.current = false;
            releaseTurnIfIdle();
          }, false, { enqueue: false });
        } else {
          setIsProcessing(false);
          isProcessingRef.current = false;
          releaseTurnIfIdle();
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

        // Accoda la funzione; il draining partirà dopo 'complete'
        setIsProcessing(false);
        isProcessingRef.current = false;
        if (data.function && data.parameters) {
          // Evita navigate_to_page:prodotti subito dopo comandi cart
          const lowerLast = (lastUserTextRef.current || '').toLowerCase();
          const isCartContext = /(carrello|svuota|rimuovi|togli|elenca|prodotti nel carrello)/.test(lowerLast);
          if (isCartContext && data.function === 'navigate_to_page' && data.parameters?.page === 'prodotti') {
            break;
          }
          functionQueueRef.current.push({ name: data.function, params: data.parameters });
        } else {
          // Nessuna funzione valida: chiedi di ripetere e rilascia
          speak('Ok. Puoi ripetere la richiesta con qualche dettaglio in più?', () => {
            turnLockRef.current = false;
            releaseTurnIfIdle();
          }, false, { enqueue: false });
        }
        break;
      }

      case 'response': {
        if (data.message) {
          setIsProcessing(true);
          isProcessingRef.current = true;
          processingOwnedBySpeechRef.current = true;
          speak(data.message, () => {
            setIsProcessing(false);
            isProcessingRef.current = false;
            releaseTurnIfIdle();
          }, false, { enqueue: false });
        }
        break;
      }

      case 'complete': {
        // Se il server ha inviato stream chunks ma non message, il buffer è stato già parlato su stream_complete
        if (data.message) {
          processingOwnedBySpeechRef.current = true;
          speak(data.message, () => {
            setIsProcessing(false);
            isProcessingRef.current = false;
            releaseTurnIfIdle();
          }, false, { enqueue: false });
        } else {
          if (!isStreamingTTSRef.current && utterQueueRef.current.length === 0 && !window.speechSynthesis.speaking) {
            setIsProcessing(false);
            isProcessingRef.current = false;
            releaseTurnIfIdle();
          } else {
            if (ttsSafetyTimerRef.current) clearTimeout(ttsSafetyTimerRef.current);
            ttsSafetyTimerRef.current = setTimeout(() => {
              setIsProcessing(false);
              isProcessingRef.current = false;
              releaseTurnIfIdle();
            }, 1500);
          }
        }
        // ✅ drena la coda funzioni allegata a questa risposta
        if (functionQueueRef.current.length > 0 && !isExecutingFunctionRef.current) {
          drainFunctionQueue();
        }
        break;
      }

      case 'error': {
        try { window.speechSynthesis.cancel(); } catch {}
        utterQueueRef.current = [];
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setIsProcessing(false);
        isProcessingRef.current = false;
        turnLockRef.current = false;
        setError(data.message || 'Errore');
        releaseTurnIfIdle();
        break;
      }
    }
  }, [speak, executeFunction, stopAssistant]);

  // Aggiorna la ref del listener dopo ogni render utile
  useEffect(() => {
    handleWSMessageRef.current = handleWebSocketMessage;
  }, [handleWebSocketMessage]);

  // Send message transport: WS by default, HTTP when Vercel mode
  const sendMessage = useCallback(async (message) => {
    const vercelMode = (import.meta?.env?.VITE_VERCEL_MODE === 'true') || (typeof window !== 'undefined' && window.VERCEL_MODE === true);
    if (!vercelMode) {
      const ws = WS_SINGLETON.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(message)); return; } catch (e) { console.warn('WS send failed, fallback HTTP', e); }
      }
    }
    // HTTP fallback (Serverless friendly)
    try {
      if (message?.type === 'voice_command') {
        const json = await voiceAPI.processVoiceCommand(
          message.text,
          message.context,
          message.context?.session_id
        );
        const events = Array.isArray(json?.events) ? json.events : [];
        if (events.length === 0) {
          handleWSMessageRef.current && handleWSMessageRef.current({ type: 'error', message: 'Risposta vuota dal server vocale' });
          return;
        }
        for (const evt of events) {
          try { handleWSMessageRef.current && handleWSMessageRef.current(evt); } catch {}
        }
      }
    } catch (err) {
      console.error('HTTP voice command failed', err);
      handleWSMessageRef.current && handleWSMessageRef.current({ type: 'error', message: 'Errore richiesta voce' });
    }
  }, []);

  // Handle voice command
  const handleVoiceCommand = useCallback((text) => {
    if (!text.trim()) return;
    lastUserTextRef.current = text;

    // 🎙️ Barge-in hard: se l'assistente sta parlando, ferma e libera i lock
    if (isSpeakingRef.current || window.speechSynthesis.speaking) {
      try { window.speechSynthesis.cancel(); } catch {}
      if (typeof stopBargeInMonitor === 'function') stopBargeInMonitor();
      utterQueueRef.current = [];
      streamBufferRef.current = '';
      dropStaleResponsesRef.current = true;   // ignora WS residui finché non ricomincia il processing
      turnLockRef.current = false;
      setIsProcessing(false); isProcessingRef.current = false;
      setIsSpeaking(false);  isSpeakingRef.current = false;
    }
    if (turnLockRef.current || isProcessingRef.current) {
      console.log('🔒 Ignoro comando: turno in corso');
      if (restartListeningRef.current) restartListeningRef.current();
      return;
    }
    if (closingTimerRef.current) {
      console.log('⏳ Ignoro comando: chiusura in corso');
      return;
    }
    turnLockRef.current = true;

    const lower = text.toLowerCase();
    // 🎯 Intent shortcuts lato client per comandi semplici
    const goCart = /(apri|mostra|vai|portami).*(il\s+)?carrello|^carrello$/;
    const goOffers = /(apri|mostra|vai|portami).*(offerte|in offerta|sconti)|^(offerte|sconti|saldi)$/;
    const goHome = /(torna|vai).*(home|pagina iniziale)|^home$/;
    // escludi frasi che contengono "carrello"
    const goProducts = /((apri|mostra|vai|portami).*(pagina\s+)?prodotti(?!.*carrello))|^tutti i prodotti$|^prodotti$|^catalogo$|^mostra tutto$|^mostrami tutto$/;
    const describe = /^(descrivi|descrizione|dettagli|info( prodotto)?)$/;
    // includi anche “mostra i prodotti nel carrello”
    const readCart = /(elenca|leggi|dimmi|quali|mostra).*(prodotti|articoli).*(nel\s+)?carrello|cosa.*(c\s'?|è|ho).*(nel\s+)?carrello/;
    // 🗑️ svuota/rimuovi tutto dal carrello (locale)
    const clearCartRe = /(svuota|svuotare|svuotalo|svuotami|rimuovi|togli|cancella).*(tutti|tutto)?.*(prodotti|articoli)?.*(dal\s+)?carrello/;
    const openByName = /(?:mostra|apri).*(?:il\s+)?prodotto\s+(.+)/;
    const normalizeKey = (s='') => (s).toString().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    // parsing “aggiungi/metti nel carrello … taglia X … colore Y”
    const addToCartRe = /(aggiungi|metti|mettilo|mettila).*(nel\s+)?carrello(?::|\s|\,)*(?:.*?(taglia)\s+([xslm]{1,3}|xs|xxs|xl|xxl|s|m|l))?(?:.*?(colore)\s+([a-zà-ù\s]+))?/i;
    const sizeMap = { xs:'XS', xxs:'XXS', s:'S', m:'M', l:'L', xl:'XL', xxl:'XXL' };
    const colorMap = {
      'nero':'nero', 'black':'nero',
      'bianco':'bianco', 'white':'bianco',
      'blu':'blu', 'blu navy':'blu navy', 'navy':'blu navy', 'blu scuro':'blu navy',
      'azzurro':'azzurro',
      'rosso':'rosso', 'borgogna':'bordeaux', 'bordeaux':'bordeaux',
      'verde':'verde', 'verde oliva':'verde oliva', 'oliva':'verde oliva',
      'grigio':'grigio', 'grigio melange':'grigio melange', 'melange':'grigio melange', 'antracite':'grigio antracite',
      'beige':'beige', 'panna':'panna', 'crema':'panna',
      'cammello':'cammello',
      'rosa':'rosa',
      'marrone':'marrone',
      'giallo':'giallo',
      'viola':'viola'
    };
    const canonColor = (raw='') => {
      const s = raw.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
      const keys = Object.keys(colorMap).sort((a,b)=>b.length-a.length);
      for (const k of keys) if (s.includes(k)) return colorMap[k];
      return s || undefined;
    };
    if (goCart.test(lower)) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      functionQueueRef.current.push({ name: 'get_cart_summary', params: {} });
      drainFunctionQueue();
      return;
    }
    // PRIORITÀ: lettura carrello prima del matcher "prodotti"
    if (readCart.test(lower)) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      const summary = buildCartSpeechSummary(6);
      speak(summary, () => {
        setIsProcessing(false);
        isProcessingRef.current = false;
        if (restartListeningRef.current) restartListeningRef.current();
      }, false, { enqueue: false });
      return;
    }
    if (goOffers.test(lower)) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      functionQueueRef.current.push({ name: 'show_offers', params: {} });
      drainFunctionQueue();
      return;
    }
    if (goHome.test(lower)) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      functionQueueRef.current.push({ name: 'navigate_to_page', params: { page: 'home' } });
      drainFunctionQueue();
      return;
    }
    if (clearCartRe.test(lower)) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      functionQueueRef.current.push({ name: 'clear_cart', params: {} });
      drainFunctionQueue();
      return;
    }
    if (goProducts.test(lower)) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      functionQueueRef.current.push({ name: 'navigate_to_page', params: { page: 'prodotti' } });
      drainFunctionQueue();
      return;
    }
    // ✅ descrizione locale senza domande aggiuntive
    if (describe.test(lower) && window.currentProductContext?.description_text) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      const name = window.currentProductContext.name || 'prodotto';
      const textDesc = `${name}. ${window.currentProductContext.description_text}`.slice(0, 900);
      speak(textDesc, () => {
        setIsProcessing(false); isProcessingRef.current = false;
        turnLockRef.current = false;
        if (restartListeningRef.current) restartListeningRef.current();
      }, false, { enqueue: false });
      return;
    }
    // ✅ aggiungi al carrello locale dal prodotto corrente
    if (addToCartRe.test(text) && window.currentProductContext?.id) {
      const m2 = text.match(addToCartRe);
      const rawSize = (m2?.[3] || '').toLowerCase();
      const rawColor = (m2?.[4] || '').toLowerCase();
      const size = sizeMap[rawSize] || undefined;
      const color = canonColor(rawColor) || undefined;
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      functionQueueRef.current.push({
        name: 'add_to_cart',
        params: { product_id: window.currentProductContext.id, size: size || 'M', color: color || 'nero', quantity: 1 }
      });
      drainFunctionQueue();
      return;
    }

    // ✅ apri prodotto per nome parziale (mappa locale)
    const m = lower.match(openByName);
    if (m && m[1]) {
      const partial = normalizeKey(m[1]);
      const map = window.visibleProductsMap || {};
      let pid = null;
      if (map[partial]) pid = map[partial];
      else {
        for (const k of Object.keys(map)) { if (k.includes(partial)) { pid = map[k]; break; } }
      }
      if (pid) {
        turnLockRef.current = true;
        setIsProcessing(true); isProcessingRef.current = true;
        functionQueueRef.current.push({ name: 'get_product_details', params: { product_id: pid } });
        drainFunctionQueue();
        return;
      }
    }
    if (readCart.test(lower)) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      const summary = buildCartSpeechSummary(5);
      speak(summary, () => {
        setIsProcessing(false);
        isProcessingRef.current = false;
        if (restartListeningRef.current) restartListeningRef.current();
      }, false, { enqueue: false });
      return;
    }
    const trimmed = lower.trim();
    const shouldClose = /(basta|chiudi|puoi andare|stop|non.*altro|alla prossima|ci sentiamo|puoi riposarti)/i.test(lower)
      || /^(grazie( mille)?( di tutto)?(,? (ciao|a presto|alla prossima|buona giornata|buona serata))?|ti ringrazio(,? (ciao|a presto|alla prossima|buona giornata|buona serata))?)$/.test(trimmed)
      || /^ciao(?:\s+(?:e\s+)?(grazie|alla prossima|per ora|ti ringrazio|a presto|buona serata|buona giornata).*)$/.test(trimmed);
    if (shouldClose) {
      speak("Perfetto, alla prossima!", () => stopAssistant());
      return;
    }

    setMessages(prev => [...prev, { type: 'user', text, timestamp: new Date().toISOString() }]);
    
    setTranscript('');
    
    sendMessage({
      type: 'voice_command',
      text: text,
      context: {
        session_id: sessionIdRef.current,
        timestamp: new Date().toISOString(),
        current_page: window.location.pathname,
        cart_count: (window.cartSnapshot?.length ?? useStore.getState().cartCount),
        cart: (window.cartSnapshot || []),
        cart_items_map: (window.cartItemsMap || {}),
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
  }, [sendMessage, sessionCount, speak, stopAssistant]);

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

        // Parla prima, poi riapri il mic in onend (evita di catturare l'earcon)
        const welcomeMsg = getWelcomeMessage();
        speak(welcomeMsg, () => {
          setTimeout(() => {
            if (
              isAssistantActiveRef.current &&
              !isProcessingRef.current &&
              !isExecutingFunctionRef.current &&
              !window.speechSynthesis.speaking
            ) {
              if (restartListeningRef.current) restartListeningRef.current();
            }
          }, 250);
        }, true, { enqueue: false });
        // non tenere il lock all'avvio
        turnLockRef.current = false;
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