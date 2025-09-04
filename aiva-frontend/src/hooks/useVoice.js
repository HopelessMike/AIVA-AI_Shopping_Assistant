// src/hooks/useVoice.js - Voice Recognition Hook

import { useState, useEffect, useCallback, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

export const useVoice = ({ 
  onResult, 
  continuous = false,
  language = 'it-IT' 
}) => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const lastTranscriptRef = useRef('');
  const silenceTimerRef = useRef(null);
  
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();
  
  // Handle transcript changes
  useEffect(() => {
    if (transcript && transcript !== lastTranscriptRef.current) {
      lastTranscriptRef.current = transcript;
      
      // Clear existing silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      
      // Set new silence timer
      silenceTimerRef.current = setTimeout(() => {
        if (transcript.trim() && onResult) {
          onResult(transcript);
          if (!continuous) {
            stopListening();
          }
          resetTranscript();
        }
      }, 1500); // 1.5 seconds of silence
    }
  }, [transcript, continuous, onResult]);
  
  const startListening = useCallback(() => {
    if (!browserSupportsSpeechRecognition) {
      setError('Browser non supporta il riconoscimento vocale');
      return;
    }
    
    if (!isMicrophoneAvailable) {
      setError('Microfono non disponibile');
      return;
    }
    
    setError(null);
    setIsListening(true);
    SpeechRecognition.startListening({ 
      continuous, 
      language 
    });
  }, [browserSupportsSpeechRecognition, isMicrophoneAvailable, continuous, language]);
  
  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    setIsListening(false);
    SpeechRecognition.stopListening();
  }, []);
  
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (listening) {
        SpeechRecognition.stopListening();
      }
    };
  }, []);
  
  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
    isSupported: browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  };
};
