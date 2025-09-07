// src/components/VoiceVisualizer.jsx - Compact ElevenLabs Style
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Mic,
  Volume2,
  Loader,
  Sparkles,
  ShoppingBag,
  Search,
  Navigation,
  Zap
} from 'lucide-react';

const VoiceVisualizer = ({ 
  isListening, 
  isProcessing, 
  isConnected, 
  isSpeaking,
  isExecutingFunction,
  currentFunction,
  messages, 
  error,
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Show/hide based on activity
  useEffect(() => {
    if (isListening || isProcessing || isSpeaking || isExecutingFunction || error) {
      setIsVisible(true);
    } else {
      // Keep visible for a short time after activity stops
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isListening, isProcessing, isSpeaking, isExecutingFunction, error]);

  // Get current state
  const getCurrentState = () => {
    if (error) {
      return {
        icon: X,
        text: 'Errore',
        color: 'bg-red-500',
        animate: false
      };
    }
    
    if (isExecutingFunction) {
      const functionIcons = {
        'navigate_to_page': Navigation,
        'search_products': Search,
        'add_to_cart': ShoppingBag,
        'get_cart_summary': ShoppingBag,
      };
      return {
        icon: functionIcons[currentFunction] || Zap,
        text: 'Esecuzione...',
        color: 'bg-green-500',
        animate: true
      };
    }
    
    if (isSpeaking) {
      return {
        icon: Volume2,
        text: 'AIVA sta parlando',
        color: 'bg-purple-500',
        animate: true
      };
    }
    
    if (isProcessing) {
      return {
        icon: Loader,
        text: 'Elaborazione...',
        color: 'bg-blue-500',
        animate: true
      };
    }
    
    if (isListening) {
      return {
        icon: Mic,
        text: 'In ascolto...',
        color: 'bg-blue-500',
        animate: true
      };
    }
    
    return {
      icon: Sparkles,
      text: 'AIVA',
      color: 'bg-gray-500',
      animate: false
    };
  };

  const state = getCurrentState();

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex justify-center"
      >
        <div className="relative">
          {/* Main Container - Compact Style */}
          <motion.div
            className="bg-black/90 backdrop-blur-xl rounded-full px-6 py-3 flex items-center space-x-3 shadow-2xl border border-white/10"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 20 }}
          >
            {/* Animated Icon Container */}
            <div className="relative">
              <motion.div
                className={`w-10 h-10 rounded-full ${state.color} flex items-center justify-center`}
                animate={state.animate ? {
                  scale: [1, 1.2, 1],
                } : {}}
                transition={{
                  duration: 1,
                  repeat: state.animate ? Infinity : 0,
                  ease: "easeInOut"
                }}
              >
                {state.icon === Loader ? (
                  <Loader className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <state.icon className="w-5 h-5 text-white" />
                )}
              </motion.div>

              {/* Pulse Effect */}
              {state.animate && (
                <motion.div
                  className={`absolute inset-0 rounded-full ${state.color} opacity-40`}
                  animate={{
                    scale: [1, 1.8],
                    opacity: [0.4, 0]
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeOut"
                  }}
                />
              )}
            </div>

            {/* Status Text */}
            <div className="flex flex-col">
              <span className="text-white font-medium text-sm">
                {state.text}
              </span>
              {isConnected !== undefined && (
                <span className="text-white/60 text-xs">
                  {isConnected ? 'Connesso' : 'Connessione...'}
                </span>
              )}
            </div>

            {/* Sound Wave Animation */}
            {(isListening || isSpeaking) && (
              <div className="flex items-center space-x-1">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className={`w-0.5 ${isListening ? 'bg-blue-400' : 'bg-purple-400'} rounded-full`}
                    animate={{
                      height: [8, 16, 8],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut"
                    }}
                  />
                ))}
              </div>
            )}

            {/* Close Button */}
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                console.log('Close button clicked');
                if (onClose) onClose();
                setIsVisible(false);
              }}
              className="ml-2 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <X className="w-4 h-4 text-white/80" />
            </motion.button>
          </motion.div>

          {/* Connection Indicator Dot */}
          <div className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-400' : 'bg-red-400'
          } animate-pulse`} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default VoiceVisualizer;