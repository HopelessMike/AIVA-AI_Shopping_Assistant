// src/hooks/useVoiceAssistantFixed.js - Fixed Voice Assistant Hook
import { useState, useEffect, useRef, useCallback } from 'react';
import { createWebSocketConnection } from '../services/api';

// Safe import of speech recognition
let SpeechRecognition, useSpeechRecognition;

try {
  // Dynamic import to handle potential errors
  const speechModule = require('react-speech-recognition');
  SpeechRecognition = speechModule.default;
  useSpeechRecognition = speechModule.useSpeechRecognition;
} catch (error) {
  console.warn('Speech recognition module not available:', error);
  // Fallback implementation
  SpeechRecognition = {
    startListening: () => console.log('Speech recognition not available'),
    stopListening: () => console.log('Speech recognition not available'),
  };
  useSpeechRecognition = () => ({
    transcript: '',
    listening: false,
    resetTranscript: () => {},
    browserSupportsSpeechRecognition: false,
    isMicrophoneAvailable: false,
  });
}

export const useVoiceAssistantFixed = () => {
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  
  const wsRef = useRef(null);
  const sessionIdRef = useRef(`session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  // Use speech recognition hook
  const {
    transcript: speechTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();

  // Update transcript when speech recognition changes
  useEffect(() => {
    if (speechTranscript) {
      setTranscript(speechTranscript);
    }
  }, [speechTranscript]);

  // Update listening state
  useEffect(() => {
    setIsListening(listening);
  }, [listening]);

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

  // Handle WebSocket messages
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

  // Handle transcript changes
  useEffect(() => {
    if (transcript && transcript.trim()) {
      // Debounce sending to backend
      const timeoutId = setTimeout(() => {
        handleVoiceCommand(transcript);
        resetTranscript();
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [transcript, handleVoiceCommand, resetTranscript]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (!browserSupportsSpeechRecognition) {
      setError('Browser non supporta il riconoscimento vocale. Usa Chrome o Edge.');
      return;
    }

    if (!isMicrophoneAvailable) {
      setError('Microfono non disponibile');
      return;
    }

    setError(null);

    if (isListening) {
      SpeechRecognition.stopListening();
    } else {
      SpeechRecognition.startListening({
        continuous: true,
        language: 'it-IT',
        interimResults: true
      });
    }
  }, [isListening, browserSupportsSpeechRecognition, isMicrophoneAvailable]);

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

  return {
    // State
    isListening,
    isConnected,
    messages,
    isProcessing,
    error,
    transcript,
    
    // Actions
    toggleListening,
    startListening,
    stopListening,
    clearMessages,
    clearError,
    
    // Capabilities
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  };
};
