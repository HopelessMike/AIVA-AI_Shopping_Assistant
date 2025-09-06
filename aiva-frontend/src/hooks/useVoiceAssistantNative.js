// src/hooks/useVoiceAssistantNative.js - Native Voice Assistant Hook
import { useState, useEffect, useRef, useCallback } from 'react';
import { createWebSocketConnection } from '../services/api';

export const useVoiceAssistantNative = () => {
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false); // New state for TTS
  
  const wsRef = useRef(null);
  const sessionIdRef = useRef(`session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const recognitionRef = useRef(null);

  // Check browser support for speech recognition
  const browserSupportsSpeechRecognition = () => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  };

  // Welcome messages for different conversation starts
  const getWelcomeMessage = () => {
    const messages = [
      "Ciao! Sono AIVA, la tua assistente per lo shopping. Come posso aiutarti oggi?",
      "Salve! Sono AIVA, il tuo personal shopper virtuale. Dimmi cosa stai cercando!",
      "Buongiorno! Sono AIVA e sono qui per aiutarti a trovare l'outfit perfetto. Cosa ti serve?",
      "Ciao! Sono AIVA, la tua assistente di moda. Parla pure, sono qui per te!",
      "Salve! Sono AIVA e posso aiutarti a trovare qualsiasi capo di abbigliamento. Cosa cerchi?"
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  // Initialize speech recognition
  const initializeSpeechRecognition = useCallback(() => {
    if (!browserSupportsSpeechRecognition()) {
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'it-IT';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
      setError(null);
      // Random welcome message
      speak(getWelcomeMessage());
    };

    recognition.onresult = (event) => {
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

      if (finalTranscript) {
        setTranscript(finalTranscript);
        handleVoiceCommand(finalTranscript);
      } else if (interimTranscript) {
        setTranscript(interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      
      switch (event.error) {
        case 'not-allowed':
          setError('Permessi microfono non concessi. Abilita il microfono nelle impostazioni del browser.');
          break;
        case 'no-speech':
          setError('Nessun parlato rilevato. Riprova.');
          break;
        case 'network':
          setError('Errore di rete. Controlla la connessione.');
          break;
        default:
          setError(`Errore riconoscimento vocale: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
    };

    return recognition;
  }, []);

  // WebSocket connection management
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = createWebSocketConnection(sessionIdRef.current);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          setIsConnected(true);
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
          setError('Errore di connessione');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          attemptReconnect();
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        setError('Impossibile connettersi al server');
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

  // Text-to-Speech function with consistent voice
  const speak = useCallback((text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'it-IT';
      utterance.rate = 1.1; // Faster voice as requested
      utterance.pitch = 1.2; // Higher pitch for more feminine sound
      
      // Select consistent Italian female voice with better detection
      const voices = speechSynthesis.getVoices();
      console.log('Available voices:', voices.map(v => ({ name: v.name, lang: v.lang })));
      
      // Try multiple strategies to find female voice
      let italianFemaleVoice = voices.find(voice => 
        voice.lang.startsWith('it') && 
        (voice.name.toLowerCase().includes('female') || 
         voice.name.toLowerCase().includes('donna') ||
         voice.name.toLowerCase().includes('woman'))
      );
      
      // Fallback: try Google/Microsoft voices (often female by default)
      if (!italianFemaleVoice) {
        italianFemaleVoice = voices.find(voice => 
          voice.lang.startsWith('it') && 
          (voice.name.toLowerCase().includes('google') || 
           voice.name.toLowerCase().includes('microsoft'))
        );
      }
      
      // Fallback: any Italian voice
      if (!italianFemaleVoice) {
        italianFemaleVoice = voices.find(voice => voice.lang.startsWith('it'));
      }
      
      // Fallback: try any female voice
      if (!italianFemaleVoice) {
        italianFemaleVoice = voices.find(voice => 
          voice.name.toLowerCase().includes('female') || 
          voice.name.toLowerCase().includes('woman') ||
          voice.name.toLowerCase().includes('donna')
        );
      }
      
      if (italianFemaleVoice) {
        utterance.voice = italianFemaleVoice;
        console.log('Using voice:', italianFemaleVoice.name, italianFemaleVoice.lang);
      } else {
        console.log('No Italian voice found, using default');
      }
      
      // CRITICAL: Stop listening completely while speaking
      if (recognitionRef.current && isListening) {
        console.log('Stopping recognition to prevent audio loop');
        recognitionRef.current.stop();
        setIsListening(false);
        // Clear any pending recognition
        recognitionRef.current = null;
      }
      
      utterance.onstart = () => {
        console.log('AI speaking started - microphone should be OFF');
        setIsSpeaking(true);
        // Ensure microphone is completely off
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
      };
      
      utterance.onend = () => {
        console.log('AI speaking ended - restarting listening for user response');
        setIsSpeaking(false);
        // Restart listening after AI finishes speaking to allow user response
        setTimeout(() => {
          if (recognitionRef.current) {
            recognitionRef.current.start();
            setIsListening(true);
          }
        }, 1000); // 1 second delay to allow AI to finish
      };
      
      speechSynthesis.speak(utterance);
    }
  }, [isListening]);

  // Handle WebSocket messages
  const handleWebSocketMessage = (data) => {
    console.log('WebSocket message received:', data);
    setMessages(prev => [...prev, data]);
    
    switch (data.type) {
      case 'processing_start':
        setIsProcessing(true);
        break;
      case 'response':
      case 'function_complete':
      case 'stream_complete':
        setIsProcessing(false);
        // Speak the AI response
        const responseText = data.text || data.message || data.content;
        if (responseText) {
          speak(responseText);
        }
        break;
      case 'error':
        setIsProcessing(false);
        setError(data.message || 'Errore del server');
        break;
    }
  };

  // Send message to WebSocket
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
      setError('Connessione persa');
    }
  }, []);

  // Handle voice command
  const handleVoiceCommand = useCallback((text) => {
    if (!text.trim()) return;

    // Add user message to chat
    setMessages(prev => [...prev, { 
      type: 'user', 
      text,
      timestamp: new Date().toISOString()
    }]);
    
    // Send to backend via WebSocket
    sendMessage({
      type: 'voice_command',
      text: text,
      context: {
        session_id: sessionIdRef.current,
        timestamp: new Date().toISOString()
      }
    });
  }, [sendMessage]);

  // Toggle listening
  const toggleListening = useCallback(async () => {
    if (!browserSupportsSpeechRecognition()) {
      setError('Il tuo browser non supporta il riconoscimento vocale. Usa Chrome o Edge.');
      return;
    }

    setError(null);

    if (isListening) {
      // Stop listening
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      // Start listening
      try {
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the stream, we just needed permission
        
        // Initialize and start recognition
        recognitionRef.current = initializeSpeechRecognition();
        if (recognitionRef.current) {
          recognitionRef.current.start();
        }
      } catch (error) {
        console.error('Microphone permission denied:', error);
        setError('Permessi microfono non concessi. Abilita il microfono nelle impostazioni del browser.');
      }
    }
  }, [isListening, initializeSpeechRecognition]);

  // Start listening
  const startListening = useCallback(() => {
    if (!isListening) {
      toggleListening();
    }
  }, [isListening, toggleListening]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (isListening) {
      toggleListening();
    }
  }, [isListening, toggleListening]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    // State
    isListening,
    isConnected,
    messages,
    isProcessing,
    error,
    transcript,
    isSpeaking, // Add speaking state
    
    // Actions
    toggleListening,
    startListening,
    stopListening,
    clearMessages,
    clearError,
    
    // Capabilities
    browserSupportsSpeechRecognition: browserSupportsSpeechRecognition(),
    isMicrophoneAvailable: true // We'll check this when needed
  };
};
