// src/components/VoiceVisualizer.jsx - Clean Voice Assistant Visual Feedback
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, Sparkles, X } from 'lucide-react';

const VoiceVisualizer = ({ 
  isListening, 
  isProcessing, 
  isConnected, 
  isSpeaking,
  transcript, 
  messages, 
  onClose 
}) => {
  const [currentMessage, setCurrentMessage] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  // Show visualizer when listening, processing, or speaking - but keep it open longer
  useEffect(() => {
    if (isListening || isProcessing || isSpeaking) {
      setIsVisible(true);
    } else {
      // Keep visible for 5 seconds after AI finishes speaking to allow user response
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isListening, isProcessing, isSpeaking]);

  // Update current message from AI responses
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage.type === 'response' || lastMessage.type === 'function_complete')) {
      setCurrentMessage(lastMessage.text || lastMessage.message || lastMessage.content || '');
    }
  }, [messages]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="bg-white rounded-3xl p-8 max-w-md w-full mx-4 relative overflow-hidden h-96"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button - Top Right */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10"
          >
            <X size={24} />
          </button>

          {/* Main Content - Centered */}
          <div className="flex flex-col items-center justify-center h-full">
            
            {/* Status Icon */}
            <motion.div
              className="w-24 h-24 rounded-full mb-6 flex items-center justify-center"
              animate={{
                background: isListening 
                  ? ['linear-gradient(45deg, #3b82f6, #8b5cf6)', 'linear-gradient(45deg, #8b5cf6, #3b82f6)']
                  : isSpeaking
                  ? ['linear-gradient(45deg, #8b5cf6, #ec4899)', 'linear-gradient(45deg, #ec4899, #8b5cf6)']
                  : ['linear-gradient(45deg, #6b7280, #9ca3af)']
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {isListening ? (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Mic className="text-white" size={40} />
                </motion.div>
              ) : isSpeaking ? (
                <Volume2 className="text-white" size={40} />
              ) : (
                <Sparkles className="text-white" size={40} />
              )}
            </motion.div>

            {/* Status Text */}
            <h3 className="text-2xl font-semibold text-gray-900 mb-2 text-center">
              {isListening ? 'AIVA ti sta ascoltando...' : 
               isSpeaking ? 'AIVA sta parlando...' : 
               isProcessing ? 'AIVA sta elaborando...' : 
               'AIVA è pronta'}
            </h3>
            
            <p className="text-gray-600 text-sm mb-6 text-center">
              {isListening ? 'Parla naturalmente in italiano' : 
               isSpeaking ? 'Ascolta la risposta di AIVA' :
               isProcessing ? 'Elaborazione in corso...' :
               'Clicca per iniziare una nuova conversazione'}
            </p>

            {/* Voice Waves Animation - Only when listening */}
            {isListening && (
              <div className="flex justify-center items-center space-x-1 mb-6">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-blue-500 rounded-full"
                    animate={{
                      height: [20, 40, 20],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.1
                    }}
                  />
                ))}
              </div>
            )}

            {/* Speaking Animation - Only when speaking */}
            {isSpeaking && (
              <div className="flex justify-center items-center space-x-1 mb-6">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-purple-500 rounded-full"
                    animate={{
                      height: [15, 30, 15],
                      opacity: [0.6, 1, 0.6]
                    }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.2
                    }}
                  />
                ))}
              </div>
            )}

            {/* Transcript Display */}
            {transcript && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-50 rounded-lg p-4 mb-4 w-full"
              >
                <p className="text-sm text-gray-600 mb-1">Hai detto:</p>
                <p className="text-gray-900 font-medium">{transcript}</p>
              </motion.div>
            )}

            {/* AI Response */}
            {currentMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-50 rounded-lg p-4 mb-4 w-full"
              >
                <div className="flex items-start space-x-2">
                  <Sparkles className="text-blue-500 mt-1" size={16} />
                  <div>
                    <p className="text-sm text-blue-600 mb-1">AIVA risponde:</p>
                    <p className="text-gray-900">{currentMessage}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Processing Animation */}
            {isProcessing && (
              <div className="flex items-center space-x-2 text-blue-600 mb-4">
                <motion.div
                  className="flex space-x-1"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                </motion.div>
                <span className="text-sm">Elaborazione...</span>
              </div>
            )}

            {/* Restart Button - Show when AI finishes speaking */}
            {!isListening && !isProcessing && !isSpeaking && isVisible && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <motion.button
                  onClick={onClose}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transform transition-all duration-300"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="flex items-center space-x-2">
                    <Mic size={20} />
                    <span>Parla di nuovo</span>
                  </div>
                </motion.button>
                <p className="text-gray-500 text-sm mt-2">
                  La finestra si chiuderà automaticamente tra 5 secondi
                </p>
              </motion.div>
            )}

            {/* Connection Status */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className={`inline-flex items-center space-x-2 text-sm ${
                isConnected ? 'text-green-600' : 'text-red-600'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span>
                  {isConnected ? 'Connesso al server' : 'Connessione persa'}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default VoiceVisualizer;