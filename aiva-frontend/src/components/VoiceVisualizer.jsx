// src/components/VoiceVisualizer.jsx - VERSIONE CORRETTA
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
  Zap,
  MessageCircle
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
  onClose,
  isAssistantActive // ✅ Aggiunto prop mancante
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // ✅ CONTROLLO VISIBILITÀ MIGLIORATO - Ora include anche quando assistente è attivo
  useEffect(() => {
    if (isListening || isProcessing || isSpeaking || isExecutingFunction || error || isAssistantActive) {
      setIsVisible(true);
    } else {
      // Mantieni visibile brevemente dopo l'attività
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isListening, isProcessing, isSpeaking, isExecutingFunction, error, isAssistantActive]);

  // ✅ STATI CORRETTI E PRIORITARI
  const getCurrentState = () => {
    if (error) {
      return {
        icon: X,
        text: 'Errore - Clicca per chiudere',
        color: 'bg-red-500',
        textColor: 'text-white',
        animate: false
      };
    }
    
    if (isExecutingFunction) {
      const functionIcons = {
        'navigate_to_page': Navigation,
        'search_products': Search,
        'add_to_cart': ShoppingBag,
        'get_cart_summary': ShoppingBag,
        'get_recommendations': Sparkles,
      };
      return {
        icon: functionIcons[currentFunction] || Zap,
        text: 'Eseguo comando...',
        color: 'bg-green-500',
        textColor: 'text-white',
        animate: true
      };
    }
    
    if (isSpeaking) {
      return {
        icon: Volume2,
        text: 'AIVA sta parlando',
        color: 'bg-purple-500',
        textColor: 'text-white',
        animate: true
      };
    }
    
    if (isProcessing) {
      return {
        icon: Loader,
        text: '',
        color: 'bg-blue-500',
        textColor: 'text-white',
        animate: true
      };
    }
    
    if (isListening) {
      return {
        icon: Mic,
        text: 'Ti sto ascoltando',
        color: 'bg-blue-500',
        textColor: 'text-white',
        animate: true
      };
    }
    
    return {
      icon: MessageCircle,
      text: 'AIVA pronta',
      color: 'bg-gray-700',
      textColor: 'text-white',
      animate: false
    };
  };

  const state = getCurrentState();

  // ✅ CHIUSURA COMPLETA DELL'ASSISTENTE
  const handleClose = (e) => {
    e.stopPropagation();
    console.log('🔴 VoiceVisualizer: Closing assistant completely');
    
    // Nascondi immediatamente
    setIsVisible(false);
    
    // Chiama onClose per fermare tutto l'assistente
    if (onClose) {
      onClose();
    }
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className="fixed top-6 left-0 right-0 z-[100]"
        style={{ pointerEvents: 'none' }}
      >
        <div className="relative mx-auto" style={{ width: '400px', maxWidth: '90vw', pointerEvents: 'auto' }}>
          {/* ✅ CONTAINER PRINCIPALE - DIMENSIONI FISSE */}
          <motion.div
            className="bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl"
            style={{ 
              height: '80px', // ✅ ALTEZZA FISSA
              width: '100%'
            }}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 20 }}
          >
            <div className="flex items-center justify-between p-4 h-full">
              {/* ✅ SEZIONE SINISTRA - ICONA E STATO */}
              <div className="flex items-center space-x-4 flex-1">
                {/* Icona Animata con Background Fisso */}
                <div className="relative flex-shrink-0">
                  <motion.div
                    className={`w-12 h-12 rounded-full ${state.color} flex items-center justify-center`}
                    animate={state.animate ? {
                      scale: [1, 1.1, 1],
                    } : {}}
                    transition={{
                      duration: 1.2,
                      repeat: state.animate ? Infinity : 0,
                      ease: "easeInOut"
                    }}
                  >
                    {state.icon === Loader ? (
                      <Loader className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <state.icon className="w-6 h-6 text-white" />
                    )}
                  </motion.div>

                  {/* Pulse Effect - Solo quando animato */}
                  {state.animate && (
                    <motion.div
                      className={`absolute inset-0 rounded-full ${state.color} opacity-40`}
                      animate={{
                        scale: [1, 1.6],
                        opacity: [0.4, 0]
                      }}
                      transition={{
                        duration: 1.8,
                        repeat: Infinity,
                        ease: "easeOut"
                      }}
                    />
                  )}
                </div>

                {/* Testo di Stato */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`font-medium text-sm ${state.textColor} truncate`}>
                    {state.text}
                  </span>
                  
                  {/* ✅ INDICATORE CONNESSIONE SEMPRE VISIBILE */}
                  <div className="flex items-center space-x-2 mt-1">
                    <div className={`w-2 h-2 rounded-full ${
                      isConnected ? 'bg-green-400' : 'bg-red-400'
                    }`} />
                    <span className="text-white/60 text-xs">
                      {isConnected ? 'Connesso' : 'Connessione...'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ✅ SEZIONE DESTRA - VISUALIZZATORE E CHIUDI */}
              <div className="flex items-center space-x-3 flex-shrink-0">
                {/* Visualizzatore Onde Sonore */}
                {(isListening || isSpeaking) && (
                  <div className="flex items-center space-x-1">
                    {[...Array(4)].map((_, i) => (
                      <motion.div
                        key={i}
                        className={`w-1 rounded-full ${
                          isListening ? 'bg-blue-400' : 'bg-purple-400'
                        }`}
                        animate={{
                          height: [6, 18, 6],
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

                {/* Pulsante Chiudi */}
                <motion.button
                  onClick={handleClose}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  title="Chiudi assistente vocale"
                >
                  <X className="w-4 h-4 text-white/80" />
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Testo di stato — rimosso per non mostrare "elaborazione in corso" */}
          {false && (
            <p className="mt-2 text-sm text-muted-foreground">
              {/* lasciato intenzionalmente vuoto */}
            </p>
          )}

          {/* Indicatore Funzione in esecuzione */}
          {isExecutingFunction && currentFunction && (
            <motion.div
              className="absolute -bottom-8 left-1/2 transform -translate-x-1/2"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="bg-green-500/90 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                {currentFunction === 'search_products' && '🔍 Ricerca in corso'}
                {currentFunction === 'add_to_cart' && '🛒 Aggiunta al carrello'}
                {currentFunction === 'navigate_to_page' && '📍 Navigazione'}
                {!['search_products', 'add_to_cart', 'navigate_to_page'].includes(currentFunction) && '⚡ Esecuzione'}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default VoiceVisualizer;