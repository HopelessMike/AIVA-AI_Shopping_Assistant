// src/hooks/useVoiceAssistantNative.js - VERSIONE DEFINITIVA FIXATA
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWebSocketConnection, productAPI, infoAPI, voiceAPI } from '../services/api';
import { getSessionId } from '../utils/session';

import { useCart } from './useCart';
import { buildCartSpeechSummary } from './useCart';
import useStore from '../store';

const randomFrom = (list = []) => {
  if (!Array.isArray(list) || list.length === 0) return '';
  const index = Math.floor(Math.random() * list.length);
  return list[index] ?? list[0];
};

const stripMarkdown = (s = '') =>
  (s || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[\*_~>#-]+/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

const PCM_TARGET_SAMPLE_RATE = 16000;

const mergeFloat32Chunks = (chunks = []) => {
  if (!Array.isArray(chunks) || chunks.length === 0) return new Float32Array(0);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
};

const resampleFloat32 = (data, originalRate, targetRate = PCM_TARGET_SAMPLE_RATE) => {
  if (!data || !data.length || !originalRate || originalRate === targetRate) {
    return data || new Float32Array(0);
  }
  const ratio = originalRate / targetRate;
  const newLength = Math.round(data.length / ratio);
  const resampled = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetSource = 0;
  while (offsetResult < resampled.length) {
    const nextOffset = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetSource; i < nextOffset && i < data.length; i += 1) {
      accum += data[i];
      count += 1;
    }
    resampled[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetSource = nextOffset;
  }
  return resampled;
};

const float32ToPCM16 = (data) => {
  const buffer = new ArrayBuffer(data.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < data.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, data[i] || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
};

const arrayBufferToBase64 = (buffer) => {
  if (!buffer) return '';
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64) => {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const normalizeVariantForContext = (variant = {}) => ({
  size: typeof variant.size === 'string' ? variant.size : variant.size?.value,
  color: variant.color,
  available: variant.available,
  stock: variant.stock,
});

const clampQuantity = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(10, Math.max(1, Math.round(parsed)));
};

const mergeProductContext = (existing = {}, productData = null) => {
  if (!productData || typeof productData !== 'object') {
    return existing;
  }

  const sanitizedDescription = stripMarkdown(
    productData.description_long ||
      productData.description ||
      existing.description_text ||
      ''
  );

  const normalizedVariants = Array.isArray(productData.variants)
    ? productData.variants.map(normalizeVariantForContext)
    : existing.variants || [];

  return {
    ...existing,
    id: productData.id || existing.id,
    name: productData.name || existing.name,
    category: productData.category || existing.category,
    gender: productData.gender || existing.gender,
    price: productData.price ?? existing.price,
    brand: productData.brand ?? existing.brand,
    image: productData.image ?? existing.image,
    description_text: sanitizedDescription,
    variants: normalizedVariants,
    product: productData,
    lastUpdated: Date.now(),
  };
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
  const persistentSessionId = typeof window !== 'undefined' ? getSessionId() : null;
  const sessionIdRef = useRef(
    persistentSessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
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
  const streamSentenceBufferRef = useRef('');
  const streamedTurnHadSpeechRef = useRef(false);
  const isStreamingTTSRef = useRef(false);
  const streamReleasePendingRef = useRef(false);
  const utterQueueRef = useRef([]);
  const ttsSafetyTimerRef = useRef(null);
  const serverTTSQueueRef = useRef([]);
  const serverTTSAudioCtxRef = useRef(null);
  const serverTTSSourceRef = useRef(null);
  const serverTTSActiveRef = useRef(false);
  // ⛔ Scarta messaggi WS residui del turno precedente (attivo dopo barge-in)
  const dropStaleResponsesRef = useRef(false);
  const hasSpokenThisTurnRef = useRef(false);
  const isAssistantActiveRef = useRef(false);
  const isConnectedRef = useRef(false);
  const lastInteractionRef = useRef(Date.now());
  const lastUserTextRef = useRef('');
  const isRestartingRef = useRef(false); // ✅ NUOVO: Previene riavvii multipli
  const selectedVoiceRef = useRef(null); // ✅ NUOVO: Memorizza la voce selezionata
  const conversationHistoryRef = useRef([]);
  const assistantTurnBufferRef = useRef('');
  const lastAssistantHistoryRef = useRef('');
  const MAX_HISTORY_ENTRIES = 20;
  const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  const isIOSDevice = isBrowser && /iP(ad|hone|od)/i.test(navigator.userAgent);
  const isSafari = isBrowser && /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS|Android/i.test(navigator.userAgent);
  const requiresUserGestureRecognition = isIOSDevice && isSafari;
  const speechPrimedRef = useRef(false);
  const serverSTTStateRef = useRef({ active: false, aborting: false });
  const browserSupportsSpeechRecognition = useCallback(() => {
    if (!isBrowser) return false;
    if (typeof window === 'undefined') return false;
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }, [isBrowser]);

  const shouldUseServerSTT = useMemo(() => {
    if (!isBrowser) return false;
    if (!browserSupportsSpeechRecognition()) return true;
    if (isIOSDevice) return true;
    return false;
  }, [isBrowser, browserSupportsSpeechRecognition, isIOSDevice]);
  const shouldUseServerTTS = useMemo(() => {
    if (!isBrowser) return false;
    if (typeof window === 'undefined') return false;
    if (!('speechSynthesis' in window)) return true;
    if (isIOSDevice) return true;
    return false;
  }, [isBrowser, isIOSDevice]);
  // 🔊 Barge-in RMS
  const bargeInCtxRef = useRef(null);
  const bargeInStreamRef = useRef(null);
  const bargeInAnalyserRef = useRef(null);
  const bargeInRafRef = useRef(null);
  // Durate finestra di ascolto e chiusura
  const LISTENING_PROFILES = {
    default: {
      window: 9000,
      closingGrace: 1000,
      prompts: [
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
      ]
    },
    followUp: {
      window: 13000,
      closingGrace: 1600,
      prompts: [
        "Nessun problema, fammi sapere come vuoi procedere.",
        "Va bene, ti ascolto quando sei pronto.",
        "Prenditi pure un momento per pensarci, resto in ascolto.",
        "Ok, dimmi pure appena hai deciso come continuare.",
        "Tranquillo, fammi sapere quando vuoi proseguire."
      ]
    },
    task: {
      window: 11000,
      closingGrace: 1300,
      prompts: [
        "Va bene, continuo a seguire la tua richiesta.",
        "Perfetto, dimmi pure gli altri dettagli quando vuoi.",
        "Ok, resto qui finché non mi dai nuove indicazioni.",
        "Ricevuto, se vuoi aggiungere altro basta dirmelo.",
        "Va benissimo, proseguiamo quando sei pronto."
      ]
    }
  };
  const FINAL_RESULT_GRACE_MS = 450;
  const listeningTimerRef = useRef(null);
  const activeListenSessionIdRef = useRef(null);
  const beepedThisSessionRef = useRef(false);
  const closingTimerRef = useRef(null);
  const turnLockRef = useRef(false);
  const ackHistoryRef = useRef({});

  const ensureCurrentProductContext = useCallback(async () => {
    const existing = window.currentProductContext || {};

    if (existing.product && typeof existing.product === 'object') {
      const updated = mergeProductContext(existing, existing.product);
      window.currentProductContext = updated;
      return updated;
    }

    if (!existing.id) {
      return existing;
    }

    try {
      const productData = await productAPI.getProduct(existing.id);
      if (productData) {
        const updated = mergeProductContext(existing, productData);
        window.currentProductContext = updated;
        return updated;
      }
    } catch (error) {
      console.warn('Unable to hydrate current product context', error);
    }

    return window.currentProductContext || existing;
  }, [productAPI]);

  const NAV_ACK_DEFAULT = [
    "Ecco.",
    "Subito.",
    "Fatto.",
    "Ci siamo."
  ];
  const NAV_ACK_CART = [
    "Ecco il carrello.",
    "Carrello aperto.",
    "Tieni il carrello.",
    "Pronto."
  ];
  const NAV_ACK_OFFERS = [
    "Ecco le offerte.",
    "Sconti in vista.",
    "Promozioni aperte.",
    "Offerte pronte."
  ];
  const SEARCH_ACK_MESSAGES = [
    "Ecco i risultati.",
    "Ecco qui.",
    "Pronto.",
    "Fatto."
  ];
  const FILTER_ACK_MESSAGES = [
    "Filtri applicati.",
    "Lista aggiornata.",
    "Pronto così.",
    "Fatto." 
  ];
  const PRODUCT_ACK_MESSAGES = [
    "Ecco la scheda.",
    "Mostrato.",
    "Eccolo qui.",
    "Fatto." 
  ];
  const CART_ADD_ACK_MESSAGES = [
    "Aggiunto al carrello.",
    "Fatto.",
    "Inserito.",
    "Dentro al carrello."
  ];
  const CART_REMOVE_ACK_MESSAGES = [
    "Tolto dal carrello.",
    "Rimosso.",
    "Fatto.",
    "Via dal carrello."
  ];
  const CART_CLEAR_ACK_MESSAGES = [
    "Carrello svuotato.",
    "Tutto pulito.",
    "Vuoto.",
    "Fatto."
  ];

  const pickAck = useCallback((key, messages = [], fallback = '') => {
    const options = Array.isArray(messages) ? messages.filter(Boolean) : [];
    if (options.length === 0) return fallback;
    const last = ackHistoryRef.current[key];
    const pool = options.filter(msg => msg !== last);
    const choice = randomFrom(pool.length > 0 ? pool : options) || fallback || options[0];
    ackHistoryRef.current[key] = choice;
    return choice || fallback;
  }, [stopServerAudioPlayback]);

  const clearListeningTimers = useCallback(() => {
    if (listeningTimerRef.current) { clearTimeout(listeningTimerRef.current); listeningTimerRef.current = null; }
    if (closingTimerRef.current) { clearTimeout(closingTimerRef.current); closingTimerRef.current = null; }
  }, []);

  const listeningProfileRef = useRef('default');
  const lastNoInputPromptRef = useRef('');
  const finalResultBufferRef = useRef('');
  const finalResultTimerRef = useRef(null);
  const handleVoiceCommandRef = useRef(() => {});

  const setListeningProfile = useCallback((profile) => {
    const key = LISTENING_PROFILES[profile] ? profile : 'default';
    listeningProfileRef.current = key;
  }, []);

  const getListeningProfileConfig = useCallback(() => {
    const profileKey = listeningProfileRef.current;
    return LISTENING_PROFILES[profileKey] || LISTENING_PROFILES.default;
  }, []);

  const getListeningWindowDuration = useCallback(() => {
    const config = getListeningProfileConfig();
    return typeof config.window === 'number' ? config.window : LISTENING_PROFILES.default.window;
  }, [getListeningProfileConfig]);

  const getClosingGraceMs = useCallback(() => {
    const config = getListeningProfileConfig();
    return typeof config.closingGrace === 'number' ? config.closingGrace : LISTENING_PROFILES.default.closingGrace;
  }, [getListeningProfileConfig]);

  const pickNoInputPrompt = useCallback(() => {
    const config = getListeningProfileConfig();
    const options = Array.isArray(config.prompts) ? config.prompts.filter(Boolean) : [];
    const fallbackOptions = LISTENING_PROFILES.default.prompts.filter(Boolean);
    const pool = options.length ? options : fallbackOptions;
    if (!pool.length) return '';
    const last = lastNoInputPromptRef.current;
    const filtered = pool.filter((msg) => msg !== last);
    const choice = randomFrom(filtered.length ? filtered : pool) || pool[0];
    lastNoInputPromptRef.current = choice;
    return choice;
  }, [getListeningProfileConfig]);

  const cancelFinalResultTimer = useCallback(() => {
    if (finalResultTimerRef.current) {
      clearTimeout(finalResultTimerRef.current);
      finalResultTimerRef.current = null;
    }
  }, []);

  const applyListeningProfileForAssistantText = useCallback((text, explicitProfile) => {
    if (explicitProfile && LISTENING_PROFILES[explicitProfile]) {
      setListeningProfile(explicitProfile);
      return;
    }

    const normalized = (text || '').toString().trim().toLowerCase();
    if (!normalized) {
      return;
    }

    const isQuestion = /[?]\s*$/.test(normalized) || /(preferisci|vuoi|ti serve|posso|che ne pensi|hai bisogno)/.test(normalized);
    if (isQuestion) {
      setListeningProfile('followUp');
      return;
    }

    const midTaskCue = /(aggiunto|fatto|eccoti|ecco|ho trovato|dimmi se vuoi|quando sei pronto|se vuoi aggiungere)/.test(normalized);
    if (midTaskCue) {
      setListeningProfile('task');
      return;
    }

    if (listeningProfileRef.current !== 'default') {
      setListeningProfile('default');
    }
  }, [setListeningProfile]);

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

  const primeSpeechSynthesis = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    try {
      if (speechPrimedRef.current) {
        if (window.speechSynthesis.paused) {
          try { window.speechSynthesis.resume(); } catch {}
        }
        return;
      }
      speechPrimedRef.current = true;
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0;
      silent.rate = 1;
      silent.pitch = 1;
      silent.onend = () => {
        try { window.speechSynthesis.cancel(); } catch {}
      };
      window.speechSynthesis.speak(silent);
    } catch (err) {
      speechPrimedRef.current = false;
      console.warn('Speech synthesis prime failed', err);
    }
  }, []);

  const resumeAudioPipeline = useCallback(async () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        if (audioCtxRef.current?.state === 'suspended') {
          await audioCtxRef.current.resume();
        }
        if (bargeInCtxRef.current && bargeInCtxRef.current.state === 'suspended') {
          await bargeInCtxRef.current.resume();
        }
      }
      if (typeof window.speechSynthesis !== 'undefined') {
        if (window.speechSynthesis.paused) {
          try { window.speechSynthesis.resume(); } catch {}
        }
        primeSpeechSynthesis();
      }
    } catch (err) {
      speechPrimedRef.current = false;
      console.warn('Audio pipeline resume failed', err);
    }
  }, [primeSpeechSynthesis]);

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

  const safeStopRecognition = useCallback((force = false) => {
    if (requiresUserGestureRecognition && !force) {
      setIsListening(false);
      return;
    }

    cancelFinalResultTimer();
    finalResultBufferRef.current = '';

    if (recognitionRef.current) {
      try {
        const r = recognitionRef.current;
        recognitionRef.current = null;
        try { r.onend = null; } catch {}
        try { r.stop(); } catch {}
      } catch {}
    }
    setIsListening(false);
  }, [requiresUserGestureRecognition, cancelFinalResultTimer]);

  // 🔧 tieni le ref aggiornate quando cambia lo stato:
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { isUserTurnRef.current = isUserTurn; }, [isUserTurn]);
  useEffect(() => { isExecutingFunctionRef.current = isExecutingFunction; }, [isExecutingFunction]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  // drainFunctionQueue is defined after executeFunction to avoid TDZ

  // ✅ TIMEOUT ESTESO - 60 secondi invece di 30
  const INACTIVITY_TIMEOUT = 60000; // 60 seconds
  const INTERACTION_CHECK_INTERVAL = 15000; // Check every 10 seconds

  // Welcome messages
  const getWelcomeMessage = useCallback(() => {
    const welcomeMessages = [
      // --- Set 1: Chiare e dirette ---
      "Ciao! Sono AIVA, la tua personal shopper AI. Come posso aiutarti oggi?",
      "Benvenuto. Sono AIVA, qui per aiutarti a navigare tra le nostre collezioni. Cerchi ispirazione o hai già un'idea precisa?",
      "Ciao! Sono AIVA, l'assistente AI pronta a trasformare la tua esperienza di shopping. Cosa posso fare per te?",

      // --- Set 2: Creative e ispirazionali ---
      "Benvenuto nel nostro ecommerce. Sono AIVA, la tua personal shopper AI. Quali prodotti ti piacerebbe vedere?",
      "Sono AIVA, la tua assistente allo shopping. Insieme possiamo scoprire le nuove collezioni o trovare esattamente ciò che desideri. Da dove vogliamo cominciare?",

      // --- Set 3: Guidate e interattive ---
      "Benvenuto! Sono AIVA e sono qui per aiutarti a trovare l'outfit perfetto. Puoi dirmi cosa cerchi oppure chiedermi di mostrarti le ultime offerte."
    ];

    const shortMessages = [
      // --- Set 1: Rapide e dirette ---
      "Eccomi di nuovo.",
      "Rieccomi.",
      "Bentornato.",
      "Sono di nuovo qui. Dimmi pure.",

      // --- Set 2: Contestuali e propositive ---
      "Pronta a continuare. Hai trovato qualcosa che ti piace o cerchiamo altro?",

      // --- Set 3: Amichevoli e concise ---
      "Ok, continuiamo. Cosa facciamo ora?",
      "Pronti a ripartire. Ti ascolto."
    ];

    const pickRandom = (messages) => {
      if (!messages || messages.length === 0) return '';
      return messages[Math.floor(Math.random() * messages.length)] || '';
    };

    if (sessionCount === 0) {
      setSessionCount(1);
      return pickRandom(welcomeMessages);
    }

    return pickRandom(shortMessages);
  }, [sessionCount]);

  // Browser support check
  useEffect(() => {
    isAssistantActiveRef.current = isAssistantActive;
  }, [isAssistantActive]);

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

  const pushHistoryEntry = useCallback((role, content) => {
    const clean = (content || '').trim();
    if (!clean) return;
    const next = [...conversationHistoryRef.current, { role, content: clean }];
    conversationHistoryRef.current = next.slice(-MAX_HISTORY_ENTRIES);
  }, []);

  const pushUserHistory = useCallback((text) => {
    pushHistoryEntry('user', text);
  }, [pushHistoryEntry]);

  const pushAssistantHistory = useCallback((text) => {
    pushHistoryEntry('assistant', text);
    applyListeningProfileForAssistantText(text);
  }, [pushHistoryEntry, applyListeningProfileForAssistantText]);

  // ✅ RILASCIO TURNO SICURO post TTS
  const releaseTurnIfIdle = useCallback(() => {
    if (!isOutputSpeaking() && !isSpeakingRef.current && utterQueueRef.current.length === 0) {
      turnLockRef.current = false;
      setIsProcessing(false);
      isProcessingRef.current = false;
      if (isAssistantActiveRef.current && functionQueueRef.current.length === 0) {
        if (restartListeningRef.current) restartListeningRef.current();
      }
    }
  }, [isOutputSpeaking]);

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
            ? pickAck('nav-cart', NAV_ACK_CART, 'Ecco il carrello.')
            : path === '/offers'
              ? pickAck('nav-offers', NAV_ACK_OFFERS, 'Ecco le offerte.')
              : pickAck('nav-default', NAV_ACK_DEFAULT, 'Ecco.');
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
          speak(pickAck('search', SEARCH_ACK_MESSAGES, 'Ecco i risultati.'), () => {
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
          speak(pickAck('filters', FILTER_ACK_MESSAGES, 'Filtri applicati.'), () => {
            setIsProcessing(false); isProcessingRef.current = false;
            turnLockRef.current = false;
            if (restartListeningRef.current) restartListeningRef.current();
          }, false, { enqueue: false });
          break;
          
        case 'get_product_details':
          const productId = parameters.product_id;
          console.log('📦 Showing product:', productId);
          navigate(`/products/${productId}`);
          speak(pickAck('product', PRODUCT_ACK_MESSAGES, 'Ecco la scheda.'), () => {
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
          
        case 'add_to_cart': {
          console.log('🛒 Adding to cart:', parameters);

          const canonColor = (raw = '') => {
            const map = {
              'nero': 'nero', 'black': 'nero',
              'bianco': 'bianco', 'white': 'bianco',
              'blu navy': 'blu navy', 'navy': 'blu navy', 'blu scuro': 'blu navy', 'blu': 'blu',
              'azzurro': 'azzurro',
              'rosso': 'rosso', 'borgogna': 'bordeaux', 'bordeaux': 'bordeaux',
              'verde oliva': 'verde oliva', 'oliva': 'verde oliva', 'verde': 'verde',
              'grigio melange': 'grigio melange', 'melange': 'grigio melange', 'antracite': 'grigio antracite', 'grigio': 'grigio',
              'beige': 'beige', 'panna': 'panna', 'crema': 'panna',
              'cammello': 'cammello',
              'marrone': 'marrone',
              'rosa': 'rosa',
              'giallo': 'giallo',
              'viola': 'viola'
            };
            const s = (raw || '').toLowerCase();
            const keys = Object.keys(map).sort((a, b) => b.length - a.length);
            for (const k of keys) if (s.includes(k)) return map[k];
            const parts = s.split(/[\s/,-]+/).filter(Boolean);
            for (const p of parts) if (map[p]) return map[p];
            return s || 'nero';
          };

          try {
            const desiredQuantity = clampQuantity(parameters.quantity ?? 1, 1);
            const size = (parameters.size || 'M').toUpperCase();
            const color = canonColor(parameters.color || 'nero');
            const currentPath = window.location.pathname;

            if (currentPath.includes('/products/')) {
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
                }, 300);
              }, 200);

              const ctx = await ensureCurrentProductContext();
              const productForCart = ctx?.product;

              if (productForCart) {
                const ok = await addToCart(productForCart, size, color, desiredQuantity);
                if (!ok) throw new Error('Cart update rejected');
              } else {
                const fallbackProduct = {
                  id: parameters.product_id || ctx?.id || '550e8400-0001-41d4-a716-446655440001',
                  name: parameters.product_name || ctx?.name || 'Prodotto',
                  price: ctx?.price || parameters.price || 49.9,
                  brand: ctx?.brand || 'Fashion Brand',
                };
                const ok = await addToCart(fallbackProduct, size, color, desiredQuantity);
                if (!ok) throw new Error('Fallback cart update failed');
              }
            } else {
              const mockProduct = {
                id: parameters.product_id || '550e8400-0001-41d4-a716-446655440001',
                name: parameters.product_name || 'Prodotto',
                price: parameters.price || 49.90,
                brand: 'Fashion Brand'
              };

              const ok = await addToCart(
                mockProduct,
                size,
                color,
                desiredQuantity
              );
              if (!ok) throw new Error('Remote cart update failed');
            }

            speak(pickAck('cart-add', CART_ADD_ACK_MESSAGES, 'Aggiunto al carrello.'), () => {
              setIsProcessing(false); isProcessingRef.current = false;
              releaseTurnIfIdle();
            }, false, { enqueue: false });
          } catch (error) {
            console.error('Error adding to cart:', error);
            speak('Non sono riuscita ad aggiungerlo al carrello.', () => {
              setIsProcessing(false); isProcessingRef.current = false;
              releaseTurnIfIdle();
            }, false, { enqueue: false });
          }
          break;
        }
          
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
            speak(pickAck('cart-remove', CART_REMOVE_ACK_MESSAGES, 'Rimosso dal carrello.'));
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
          speak(pickAck('nav-cart', NAV_ACK_CART, 'Ecco il carrello.'), () => {
            setIsProcessing(false); isProcessingRef.current = false;
            turnLockRef.current = false;
            if (restartListeningRef.current) restartListeningRef.current();
          }, false, { enqueue: false });
          break;
          
        case 'clear_cart':
          console.log('🗑️ Clearing cart');
          await clearCartAction();
          speak(pickAck('cart-clear', CART_CLEAR_ACK_MESSAGES, 'Carrello svuotato.'), () => {
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
          if (!isSpeaking && !isOutputSpeaking()) {
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
      setSearchQuery, setMultipleFilters, isSpeaking, pickAck, isOutputSpeaking]);

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
            !isOutputSpeaking() &&
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
  }, [executeFunction, isOutputSpeaking]);

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

  const isOutputSpeaking = useCallback(() => {
    const synthSpeaking =
      typeof window !== 'undefined' && window.speechSynthesis
        ? window.speechSynthesis.speaking
        : false;
    return synthSpeaking || serverTTSActiveRef.current;
  }, []);

  const createServerRecognition = useCallback(() => {
    if (!shouldUseServerSTT) return null;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      console.warn('Media devices API not available for server STT fallback');
      return null;
    }

    const listeners = {
      start: null,
      result: null,
      error: null,
      end: null,
      audioend: null,
    };

    let audioCtx = null;
    let mediaStream = null;
    let processor = null;
    let sourceNode = null;
    let capturedChunks = [];
    let finishing = false;
    let recordedSampleRate = PCM_TARGET_SAMPLE_RATE;
    let lastSpeechAt = 0;
    let startedAt = 0;

    const trigger = (key, payload) => {
      const handler = listeners[key];
      if (typeof handler === 'function') {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Server STT listener ${key} failed`, err);
        }
      }
    };

    const cleanup = async () => {
      if (processor) {
        try {
          processor.disconnect();
        } catch (err) {
          console.warn('Processor disconnect failed', err);
        }
        processor.onaudioprocess = null;
      }
      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch {}
      }
      if (audioCtx) {
        try {
          await audioCtx.close();
        } catch {}
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch {}
        });
      }
      audioCtx = null;
      mediaStream = null;
      processor = null;
      sourceNode = null;
    };

    const buildResultEvent = (text, confidence = 0) => {
      const alternative = { transcript: text, confidence };
      const result = {
        0: alternative,
        length: 1,
        isFinal: true,
        item: () => alternative,
      };
      const results = [result];
      results.item = (idx) => results[idx];
      return {
        resultIndex: 0,
        results,
      };
    };

    const finish = async (reason = 'stop', emitResult = true) => {
      if (finishing) return;
      finishing = true;
      serverSTTStateRef.current.active = false;
      const recordedChunks = capturedChunks.slice();
      capturedChunks = [];
      const finalSampleRate = recordedSampleRate;
      await cleanup();
      trigger('audioend');

      if (!emitResult || recordedChunks.length === 0) {
        if (emitResult && recordedChunks.length === 0) {
          trigger('error', { error: 'no-speech' });
        }
        trigger('end');
        finishing = false;
        return;
      }

      try {
        const merged = mergeFloat32Chunks(recordedChunks);
        const resampled = resampleFloat32(merged, finalSampleRate, PCM_TARGET_SAMPLE_RATE);
        const pcm = float32ToPCM16(resampled);
        const audioBase64 = arrayBufferToBase64(pcm.buffer);
        if (!audioBase64) {
          trigger('error', { error: 'no-speech' });
        } else {
          const sttResponse = await voiceAPI.transcribeAudio({
            audio: audioBase64,
            sampleRate: PCM_TARGET_SAMPLE_RATE,
            language: 'it-IT',
            sessionId: sessionIdRef.current,
          });
          const transcriptText = (sttResponse?.text || '').trim();
          const confidence = typeof sttResponse?.confidence === 'number'
            ? sttResponse.confidence
            : 0;
          if (transcriptText) {
            trigger('result', buildResultEvent(transcriptText, confidence));
          } else {
            trigger('error', { error: 'no-speech' });
          }
        }
      } catch (err) {
        console.error('Server STT transcription error', err);
        trigger('error', {
          error: 'network',
          message: err?.message || 'Errore nella trascrizione audio',
        });
      }

      trigger('end');
      finishing = false;
    };

    const recognition = {
      continuous: false,
      interimResults: true,
      lang: 'it-IT',
      maxAlternatives: 1,
      start: async () => {
        if (serverSTTStateRef.current.active) return;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
        } catch (err) {
          console.error('Microphone permission denied', err);
          trigger('error', { error: err?.name || 'not-allowed', message: err?.message });
          trigger('end');
          return;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          trigger('error', { error: 'audio-context-unavailable' });
          trigger('end');
          return;
        }

        try {
          audioCtx = new AudioCtx();
          if (audioCtx.state === 'suspended') {
            try { await audioCtx.resume(); } catch {}
          }
          recordedSampleRate = audioCtx.sampleRate || PCM_TARGET_SAMPLE_RATE;
          sourceNode = audioCtx.createMediaStreamSource(mediaStream);
          processor = audioCtx.createScriptProcessor(4096, 1, 1);
          capturedChunks = [];
          lastSpeechAt = Date.now();
          startedAt = lastSpeechAt;

          processor.onaudioprocess = (event) => {
            if (!serverSTTStateRef.current.active) return;
            const channel = event.inputBuffer.getChannelData(0);
            capturedChunks.push(new Float32Array(channel));

            let sum = 0;
            for (let i = 0; i < channel.length; i += 1) {
              const value = channel[i];
              sum += value * value;
            }
            const rms = Math.sqrt(sum / channel.length);
            const now = Date.now();
            if (rms > 0.015) {
              lastSpeechAt = now;
            } else if (now - lastSpeechAt > 900 && capturedChunks.length > 4) {
              finish('silence');
            }

            if (now - startedAt > 14000) {
              finish('timeout');
            }
          };

          sourceNode.connect(processor);
          processor.connect(audioCtx.destination);
          serverSTTStateRef.current.active = true;
          trigger('start');
        } catch (err) {
          console.error('Failed to init server STT pipeline', err);
          trigger('error', { error: err?.name || 'unknown', message: err?.message });
          await cleanup();
          trigger('end');
        }
      },
      stop: () => finish('stop'),
      abort: () => finish('abort', false),
    };

    Object.defineProperties(recognition, {
      onstart: {
        get: () => listeners.start,
        set: (fn) => {
          listeners.start = fn;
        },
      },
      onresult: {
        get: () => listeners.result,
        set: (fn) => {
          listeners.result = fn;
        },
      },
      onerror: {
        get: () => listeners.error,
        set: (fn) => {
          listeners.error = fn;
        },
      },
      onend: {
        get: () => listeners.end,
        set: (fn) => {
          listeners.end = fn;
        },
      },
      onaudioend: {
        get: () => listeners.audioend,
        set: (fn) => {
          listeners.audioend = fn;
        },
      },
    });

    return recognition;
  }, [shouldUseServerSTT, voiceAPI, sessionIdRef, serverSTTStateRef]);

  // ✅ SPEECH RECOGNITION CORRETTO - NON CONTINUOUS
  const initializeSpeechRecognition = useCallback(() => {
    if (shouldUseServerSTT) {
      return createServerRecognition();
    }
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
      cancelFinalResultTimer();
      finalResultBufferRef.current = '';
      setIsListening(true);
      setError(null);
      setIsUserTurn(true);
      lastInteractionRef.current = Date.now();
      isRestartingRef.current = false; // ✅ Reset flag
      if (!listeningTimerRef.current) {
        const windowDuration = getListeningWindowDuration();
        listeningTimerRef.current = setTimeout(() => {
          if (!isSpeakingRef.current && !isProcessingRef.current) {
            const prompt = pickNoInputPrompt();
            const scheduleClosure = () => {
              const closingDelay = getClosingGraceMs();
              closingTimerRef.current = setTimeout(() => {
                if (!isSpeakingRef.current && !isProcessingRef.current) {
                  stopAssistant();
                }
              }, closingDelay);
            };
            if (prompt) {
              speak(prompt, () => {
                scheduleClosure();
              }, false, { enqueue: false, listeningProfile: 'default' });
            } else {
              scheduleClosure();
            }
          }
        }, windowDuration);
      }
    };

    const commitFinalResult = (shouldStop = false) => {
      cancelFinalResultTimer();
      const buffered = finalResultBufferRef.current.trim();
      if (!buffered) return;
      finalResultBufferRef.current = '';
      console.log('💬 User said:', buffered);
      clearListeningTimers();
      activeListenSessionIdRef.current = null;
      beepedThisSessionRef.current = false;
      setTranscript(buffered);
      resetInactivityTimeout();
      if (typeof handleVoiceCommandRef.current === 'function') {
        try {
          handleVoiceCommandRef.current(buffered);
        } catch (err) {
          console.error('Voice command dispatch failed', err);
        }
      }
      if (shouldStop && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
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
          if (listeningTimerRef.current) {
            clearTimeout(listeningTimerRef.current);
            listeningTimerRef.current = null;
          }
          if (closingTimerRef.current) {
            clearTimeout(closingTimerRef.current);
            closingTimerRef.current = null;
          }
        }

        if (finalTranscript) {
          finalResultBufferRef.current = `${finalResultBufferRef.current} ${finalTranscript}`.trim();
          cancelFinalResultTimer();
          finalResultTimerRef.current = setTimeout(() => commitFinalResult(true), FINAL_RESULT_GRACE_MS);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'no-speech') {
        return; // lascia scadere la finestra 11s
      }
      cancelFinalResultTimer();
      finalResultBufferRef.current = '';
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
      commitFinalResult(false);
      cancelFinalResultTimer();
      finalResultBufferRef.current = '';
      setIsListening(false);
      if (
        isAssistantActiveRef.current &&
        !isSpeakingRef.current &&
        !isExecutingFunctionRef.current &&
        !isRestartingRef.current &&
        !isProcessingRef.current &&
        !isOutputSpeaking() &&
        !turnLockRef.current &&
        !closingTimerRef.current &&
        functionQueueRef.current.length === 0
      ) {
        resumeAudioPipeline();
        const restartDelay = isIOSDevice ? 250 : 500;
        setTimeout(() => {
          if (
            isAssistantActiveRef.current &&
            !isSpeakingRef.current &&
            !isProcessingRef.current &&
            !turnLockRef.current &&
            !closingTimerRef.current
          ) {
            if (restartListeningRef.current) {
              restartListeningRef.current();
            }
          }
        }, restartDelay);
      }
    };

    return recognition;
  }, [
    resumeAudioPipeline,
    isIOSDevice,
    pickNoInputPrompt,
    getListeningWindowDuration,
    getClosingGraceMs,
    cancelFinalResultTimer,
    browserSupportsSpeechRecognition,
    createServerRecognition,
    shouldUseServerSTT
  ]);

  // ✅ RESTART LISTENING CORRETTO - PREVIENE LOOP
  const restartListening = useCallback(() => {
    if (
      isRestartingRef.current ||
      !isAssistantActiveRef.current ||
      isSpeakingRef.current ||
      isExecutingFunctionRef.current ||
      isProcessingRef.current ||                  // ⬅️ non riaprire durante processing
      functionQueueRef.current.length > 0 ||      // ⬅️ se ci sono function in coda
      isOutputSpeaking()             // ⬅️ non durante TTS
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

    if (!requiresUserGestureRecognition) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
    }

    setTimeout(() => {
      if (
        isAssistantActiveRef.current &&
        !isSpeakingRef.current &&
        !isExecutingFunctionRef.current &&
        !isProcessingRef.current
      ) {
        try {
          if (!recognitionRef.current) {
            recognitionRef.current = initializeSpeechRecognition();
          }
          if (recognitionRef.current) {
            try { recognitionRef.current.start(); } catch (err) { console.warn('Recognition restart failed', err); }
          }
        } catch (e) {
          console.error('Failed to restart:', e);
        }
      }
      isRestartingRef.current = false;
    }, 220); // piccolo delay per non catturare il beep
  }, [isSpeaking, isExecutingFunction, initializeSpeechRecognition, playReadyBeep, requiresUserGestureRecognition, isOutputSpeaking]);

  // Programmatic restart dopo navigazioni/cambi DOM
  const scheduleListenAfterNav = useCallback((delay = 700) => {
    setTimeout(() => {
      if (
        isAssistantActiveRef.current &&
        !isRestartingRef.current &&
        !isOutputSpeaking() &&
        !isSpeakingRef.current &&
        !isProcessingRef.current &&
        functionQueueRef.current.length === 0
      ) {
        if (restartListeningRef.current) {
          restartListeningRef.current();
        }
      }
    }, delay);
  }, [isOutputSpeaking]);

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
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    stopServerAudioPlayback();
    // ✅ svuota coda TTS e timer safety
    utterQueueRef.current = [];
    if (ttsSafetyTimerRef.current) { clearTimeout(ttsSafetyTimerRef.current); ttsSafetyTimerRef.current = null; }
    streamSentenceBufferRef.current = '';
    streamedTurnHadSpeechRef.current = false;

    // Clear timeouts
    if (inactivityTimeoutRef.current) { clearTimeout(inactivityTimeoutRef.current); inactivityTimeoutRef.current = null; }
    clearListeningTimers();          // ⬅️ importante
    cancelFinalResultTimer();
    finalResultBufferRef.current = '';
    lastNoInputPromptRef.current = '';
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
    conversationHistoryRef.current = [];
    assistantTurnBufferRef.current = '';
    lastAssistantHistoryRef.current = '';
    ackHistoryRef.current = {};
    setListeningProfile('default');

    console.log('✅ Assistant stopped');
  }, [cancelFinalResultTimer, setListeningProfile, stopServerAudioPlayback]);

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

  const ensureServerTTSAudioContext = useCallback(async () => {
    if (!isBrowser) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!serverTTSAudioCtxRef.current) {
      serverTTSAudioCtxRef.current = new AudioCtx();
    }
    const ctx = serverTTSAudioCtxRef.current;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('Unable to resume TTS audio context', err);
      }
    }
    return ctx;
  }, [isBrowser]);

  const stopServerAudioPlayback = useCallback(() => {
    if (serverTTSSourceRef.current) {
      try {
        serverTTSSourceRef.current.onended = null;
        serverTTSSourceRef.current.stop();
        serverTTSSourceRef.current.disconnect?.();
      } catch (err) {
        console.warn('Failed to stop server TTS source', err);
      }
      serverTTSSourceRef.current = null;
    }
    serverTTSActiveRef.current = false;
    serverTTSQueueRef.current = [];
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    stopBargeInMonitor();
  }, [stopBargeInMonitor]);

  const processServerTTSQueue = useCallback(async () => {
    if (serverTTSActiveRef.current) return;
    if (serverTTSQueueRef.current.length === 0) return;

    serverTTSActiveRef.current = true;
    resumeAudioPipeline();
    safeStopRecognition();
    setIsSpeaking(true);
    isSpeakingRef.current = true;
    setIsUserTurn(false);
    hasSpokenThisTurnRef.current = true;
    startBargeInMonitor();

    while (serverTTSQueueRef.current.length > 0) {
      const current = serverTTSQueueRef.current[0];
      try {
        const response = await voiceAPI.synthesizeSpeech({
          text: current.text,
          voice: current.voice,
          sessionId: sessionIdRef.current,
        });
        const audioBase64 = response?.audio;
        if (!audioBase64) {
          throw new Error('tts-empty-response');
        }
        const audioBuffer = base64ToArrayBuffer(audioBase64);
        const ctx = await ensureServerTTSAudioContext();
        if (!ctx) {
          throw new Error('audio-context-unavailable');
        }
        const decoded = await new Promise((resolve, reject) => {
          const slice = audioBuffer.slice(0);
          ctx.decodeAudioData(slice, resolve, reject);
        });
        await new Promise((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.connect(ctx.destination);
          serverTTSSourceRef.current = source;
          source.onended = () => {
            serverTTSSourceRef.current = null;
            resolve();
          };
          source.start(0);
        });
        if (typeof current.onEnd === 'function') {
          current.onEnd();
        }
      } catch (err) {
        console.error('Server TTS playback error', err);
        if (typeof current.onEnd === 'function') {
          current.onEnd(err);
        }
      }
      serverTTSQueueRef.current.shift();
    }

    stopBargeInMonitor();
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    serverTTSActiveRef.current = false;
    if (streamReleasePendingRef.current) {
      streamReleasePendingRef.current = false;
    }
    releaseTurnIfIdle();
  }, [
    ensureServerTTSAudioContext,
    releaseTurnIfIdle,
    resumeAudioPipeline,
    safeStopRecognition,
    startBargeInMonitor,
    stopBargeInMonitor,
    voiceAPI,
  ]);

  const enqueueServerSpeech = useCallback(
    (text, onEnd, immediate = false, options = {}) => {
      const payload = {
        text,
        onEnd,
        voice: options?.voice || null,
      };
      if (immediate) {
        stopServerAudioPlayback();
      }
      serverTTSQueueRef.current.push(payload);
      processServerTTSQueue();
    },
    [processServerTTSQueue, stopServerAudioPlayback]
  );

  const speak = useCallback((text, onEnd, immediate = false, options = {}) => {
    const { enqueue = false, listeningProfile: forcedProfile } = options || {};
    const sanitized = sanitizeTextForTTS(text);
    applyListeningProfileForAssistantText(sanitized, forcedProfile);

    if (shouldUseServerTTS) {
      enqueueServerSpeech(sanitized, onEnd, immediate, { voice: forcedProfile });
      return;
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      enqueueServerSpeech(sanitized, onEnd, immediate, { voice: forcedProfile });
      return;
    }

    try {
      resumeAudioPipeline();
      safeStopRecognition();
      setIsSpeaking(true);
      isSpeakingRef.current = true;

      if (immediate) {
        try { window.speechSynthesis.cancel(); } catch {}
        utterQueueRef.current = [];
      }

      const sentences = enqueue ? segmentTextIntoSentences(sanitized) : [sanitized];
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
          startBargeInMonitor();
        };
        utt.onend = () => {
          utterQueueRef.current.shift();
          if (utterQueueRef.current.length > 0) {
            const nextUtt = utterQueueRef.current[0];
            try { if (nextUtt) window.speechSynthesis.speak(nextUtt); } catch {}
          }
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

      if (!window.speechSynthesis.speaking) {
        const next = utterQueueRef.current[0];
        if (next) window.speechSynthesis.speak(next);
      }

      if (!ttsSafetyTimerRef.current) {
        ttsSafetyTimerRef.current = setTimeout(() => {
          if (!window.speechSynthesis.speaking && utterQueueRef.current.length === 0) {
            setIsSpeaking(false);
            isSpeakingRef.current = false;
            releaseTurnIfIdle();
          }
        }, 1500);
      }
    } catch (err) {
      console.error('Browser TTS failed, switching to server fallback', err);
      enqueueServerSpeech(sanitized, onEnd, true, { voice: forcedProfile });
    }
  }, [
    applyListeningProfileForAssistantText,
    enqueueServerSpeech,
    releaseTurnIfIdle,
    resumeAudioPipeline,
    safeStopRecognition,
    segmentTextIntoSentences,
    shouldUseServerTTS,
  ]);

  const flushStreamedSpeech = useCallback((force = false) => {
    const raw = (streamSentenceBufferRef.current || '').replace(/\s+/g, ' ').trim();
    if (!raw) return false;

    const sentences = segmentTextIntoSentences(raw);
    if (!sentences.length) return false;

    const pending = [];
    let spoke = false;

    sentences.forEach((sentence, idx) => {
      const trimmed = sentence.trim();
      if (!trimmed) return;
      const hasTerminator = /[\.!?…:]\s*$/.test(trimmed);
      if (force || hasTerminator || trimmed.length > 160) {
        speak(trimmed, () => {}, false, { enqueue: true });
        spoke = true;
        streamedTurnHadSpeechRef.current = true;
      } else {
        pending.push(trimmed);
      }
    });

    streamSentenceBufferRef.current = pending.join(' ');
    return spoke;
  }, [segmentTextIntoSentences, speak]);

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
        streamSentenceBufferRef.current = '';
        streamedTurnHadSpeechRef.current = false;
        assistantTurnBufferRef.current = '';
        lastAssistantHistoryRef.current = '';
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
        streamSentenceBufferRef.current = '';
        streamedTurnHadSpeechRef.current = false;
        assistantTurnBufferRef.current = '';
        isStreamingTTSRef.current = true;
        streamReleasePendingRef.current = false;
        break;
      }

      case 'text_chunk': {
        if (typeof data.content === 'string') {
          const raw = (data.content || '').trim();
          if (raw) {
            assistantTurnBufferRef.current = `${assistantTurnBufferRef.current} ${raw}`.trim();
            streamBufferRef.current = `${streamBufferRef.current} ${raw}`.trim();
            streamSentenceBufferRef.current = `${streamSentenceBufferRef.current} ${raw}`.trim();
            const spoke = flushStreamedSpeech(false);
            if (spoke) {
              processingOwnedBySpeechRef.current = true;
            }
          }
        }
        break;
      }

      case 'stream_complete': {
        const spoke = flushStreamedSpeech(true);
        if (spoke) {
          processingOwnedBySpeechRef.current = true;
        }
        isStreamingTTSRef.current = false;
        streamReleasePendingRef.current = true;
        streamBufferRef.current = '';
        streamSentenceBufferRef.current = '';
        if (!isOutputSpeaking() && utterQueueRef.current.length === 0) {
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
          const ackOnly = /^(sì|si|ok|va bene|perfetto|d'accordo|come no|certo|ottimo|grazie|no grazie|basta cos[ìi]|tutto ok|tutto bene|va benissimo|benissimo)[!.\s]*$/.test(lowerLast.trim());
          if (ackOnly && ['navigate_to_page', 'navigate', 'search_products', 'get_product_details'].includes(data.function)) {
            console.log('⏭️ Ignoro funzione non richiesta dopo conferma breve');
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
          const finalText = (data.message || '').trim();
          if (finalText) {
            if (!assistantTurnBufferRef.current) {
              assistantTurnBufferRef.current = finalText;
            }
            const historyText = data.streamed ? assistantTurnBufferRef.current : finalText;
            if (historyText && lastAssistantHistoryRef.current !== historyText) {
              pushAssistantHistory(historyText);
              lastAssistantHistoryRef.current = historyText;
            }

            if (!data.streamed) {
              setIsProcessing(true);
              isProcessingRef.current = true;
              processingOwnedBySpeechRef.current = true;
              speak(finalText, () => {
                setIsProcessing(false);
                isProcessingRef.current = false;
                releaseTurnIfIdle();
              }, false, { enqueue: false });
            } else {
              const spoke = flushStreamedSpeech(true);
              if (spoke) {
                processingOwnedBySpeechRef.current = true;
              }
            }
          }
        }
        break;
      }

      case 'complete': {
        const spoke = flushStreamedSpeech(true);
        if (spoke) {
          processingOwnedBySpeechRef.current = true;
        }
        // Se il server ha inviato stream chunks ma non message, il buffer è stato già parlato su stream_complete
        if (data.message) {
          const finalText = (data.message || '').trim();
          if (finalText) {
            if (!assistantTurnBufferRef.current) {
              assistantTurnBufferRef.current = finalText;
            }
            if (lastAssistantHistoryRef.current !== finalText) {
              pushAssistantHistory(finalText);
              lastAssistantHistoryRef.current = finalText;
            }
            if (!streamedTurnHadSpeechRef.current && !data.streamed) {
              processingOwnedBySpeechRef.current = true;
              speak(finalText, () => {
                setIsProcessing(false);
                isProcessingRef.current = false;
                releaseTurnIfIdle();
              }, false, { enqueue: false });
            }
          }
        } else {
          if (!isStreamingTTSRef.current && utterQueueRef.current.length === 0 && !isOutputSpeaking()) {
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
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch {}
        }
        stopServerAudioPlayback();
        utterQueueRef.current = [];
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setIsProcessing(false);
        isProcessingRef.current = false;
        turnLockRef.current = false;
        streamSentenceBufferRef.current = '';
        streamedTurnHadSpeechRef.current = false;
        setError(data.message || 'Errore');
        releaseTurnIfIdle();
        break;
      }
    }
  }, [
    speak,
    executeFunction,
    stopAssistant,
    pushAssistantHistory,
    flushStreamedSpeech,
    releaseTurnIfIdle,
    isOutputSpeaking,
    stopServerAudioPlayback
  ]);

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
  const handleVoiceCommand = useCallback(async (text) => {
    if (!text.trim()) return;
    lastUserTextRef.current = text;
    setListeningProfile('task');

    try {
      // 🎙️ Barge-in hard: se l'assistente sta parlando, ferma e libera i lock
      if (isSpeakingRef.current || isOutputSpeaking()) {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch {}
        }
        stopServerAudioPlayback();
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
      const describeTriggers = [
        /descrivimi/i,
        /descrivilo/i,
        /descrivila/i,
        /descriv[iy]/i,
        /descrizione/i,
        /dettagli/i,
        /informazioni?(?: sul| del)? prodotto/i,
        /leggi .*descrizione/i,
        /dimmi .*descrizione/i,
        /mostra .*descrizione/i
      ];
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
    const quantityWords = {
      uno: 1,
      una: 1,
      un: 1,
      due: 2,
      tre: 3,
      quattro: 4,
      cinque: 5,
      sei: 6,
      sette: 7,
      otto: 8,
      nove: 9,
      dieci: 10
    };
    const canonColor = (raw='') => {
      const s = raw.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
      const keys = Object.keys(colorMap).sort((a,b)=>b.length-a.length);
      for (const k of keys) if (s.includes(k)) return colorMap[k];
      return s || undefined;
    };
    const extractColorCandidates = (raw = '') => {
      const normalized = raw.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
      if (!normalized) return [];
      const keys = Object.keys(colorMap).sort((a,b)=>b.length-a.length);
      const found = [];
      let working = normalized;
      for (const key of keys) {
        if (working.includes(key)) {
          const mapped = colorMap[key];
          if (!found.includes(mapped)) {
            found.push(mapped);
          }
          working = working.replace(key, ' ');
        }
      }
      return found;
    };
    const parseQuantityFromText = (input = '') => {
      const normalized = input
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
      const commandMatch = normalized.match(/(?:aggiungi|aggiungine|metti|mettimene|mettil[oa])(.*)/);
      const scope = commandMatch ? commandMatch[1] : normalized;
      const digitMatch = scope.match(/(\d{1,2})\s*(?:pezzi|articoli|prodotti|paia|capi)?/);
      if (digitMatch) {
        const parsed = parseInt(digitMatch[1], 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
      for (const [word, value] of Object.entries(quantityWords)) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(scope)) {
          return value;
        }
      }
      return null;
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
        turnLockRef.current = false;
        releaseTurnIfIdle();
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
    const shouldDescribeProduct = () => {
      if (!window.currentProductContext?.description_text) return false;
      if (describeTriggers.some((re) => re.test(lower))) return true;
      if (lower.includes('descrizione') && (lower.includes('prodotto') || lower.includes('articolo'))) return true;
      if (lower.includes('descrivi') && (lower.includes('prodotto') || lower.includes('articolo'))) return true;
      return false;
    };
    // ✅ descrizione locale senza domande aggiuntive
    if (shouldDescribeProduct()) {
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;

      try {
        const hydratedContext = await ensureCurrentProductContext();
        const ctx = hydratedContext && typeof hydratedContext === 'object'
          ? hydratedContext
          : (window.currentProductContext || {});

        let descriptionText = ctx?.description_text;
        if (!descriptionText && ctx?.product) {
          const merged = mergeProductContext(ctx, ctx.product);
          window.currentProductContext = merged;
          descriptionText = merged.description_text;
        }

        const name = ctx?.name || ctx?.product?.name || 'prodotto';
        const spokenText = descriptionText
          ? `${name}. ${descriptionText}`.slice(0, 900)
          : `Non riesco a trovare ulteriori dettagli su ${name}. Posso aiutarti in altro modo?`;

        speak(spokenText, () => {
          setIsProcessing(false); isProcessingRef.current = false;
          releaseTurnIfIdle();
        }, false, { enqueue: false });
      } catch (error) {
        console.error('Errore descrizione prodotto:', error);
        speak('Non sono riuscita a recuperare la descrizione del prodotto.', () => {
          setIsProcessing(false); isProcessingRef.current = false;
          releaseTurnIfIdle();
        }, false, { enqueue: false });
      }
      return;
    }
    // ✅ aggiungi al carrello locale dal prodotto corrente
    if (addToCartRe.test(text) && window.currentProductContext?.id) {
      const m2 = text.match(addToCartRe);
      const rawSize = (m2?.[3] || '').toLowerCase();
      const rawColor = (m2?.[4] || '').toLowerCase();
      const availableVariants = Array.isArray(window.currentProductContext?.variants)
        ? window.currentProductContext.variants
        : [];
      const fallbackSize = availableVariants[0]?.size || 'M';
      const fallbackColor = availableVariants[0]?.color || 'nero';
      const size = (sizeMap[rawSize] || fallbackSize || 'M').toUpperCase();
      const colorCandidates = extractColorCandidates(rawColor);
      const availableColors = new Set(availableVariants.map(v => (v.color || '').toLowerCase()));
      let color = colorCandidates.find(c => availableColors.has(c.toLowerCase()))
        || colorCandidates[0]
        || canonColor(rawColor)
        || fallbackColor
        || 'nero';
      const requestedQuantity = parseQuantityFromText(text);
      const safeQuantity = Math.min(10, Math.max(1, requestedQuantity || 1));
      turnLockRef.current = true;
      setIsProcessing(true); isProcessingRef.current = true;
      functionQueueRef.current.push({
        name: 'add_to_cart',
        params: {
          product_id: window.currentProductContext.id,
          size,
          color,
          quantity: safeQuantity
        }
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
          },
          history: conversationHistoryRef.current.slice(-12)
        }
      });
      pushUserHistory(text);
    } catch (err) {
      console.error('Voice command handling error:', err);
      setIsProcessing(false); isProcessingRef.current = false;
      turnLockRef.current = false;
      releaseTurnIfIdle();
    }
  }, [
    sendMessage,
    sessionCount,
    speak,
    stopAssistant,
    pushUserHistory,
    releaseTurnIfIdle,
    ensureCurrentProductContext,
    setListeningProfile,
    isOutputSpeaking,
    stopServerAudioPlayback
  ]);

  useEffect(() => {
    handleVoiceCommandRef.current = handleVoiceCommand;
  }, [handleVoiceCommand]);

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
      setListeningProfile('default');
      lastNoInputPromptRef.current = '';
      finalResultBufferRef.current = '';
      cancelFinalResultTimer();

      resetInactivityTimeout();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());

        await resumeAudioPipeline();

        if (!recognitionRef.current) {
          recognitionRef.current = initializeSpeechRecognition();
        }
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (startError) {
            console.warn('Initial recognition start failed', startError);
          }
        }

        // Parla prima, poi riapri il mic in onend (evita di catturare l'earcon)
        const welcomeMsg = getWelcomeMessage();
        speak(welcomeMsg, () => {
          setTimeout(() => {
            if (
              isAssistantActiveRef.current &&
              !isProcessingRef.current &&
              !isExecutingFunctionRef.current &&
              !isOutputSpeaking()
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
  }, [
    isListening,
    isAssistantActive,
    initializeSpeechRecognition,
    speak,
    getWelcomeMessage,
    stopAssistant,
    resetInactivityTimeout,
    resumeAudioPipeline,
    setListeningProfile,
    cancelFinalResultTimer,
    isOutputSpeaking
  ]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      stopServerAudioPlayback();
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