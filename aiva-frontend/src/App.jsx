// src/App.jsx - VERSIONE CORRETTA
import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Search,
  Menu,
  X,
  User,
  Heart,
  ChevronRight,
  Star,
  Truck,
  Shield,
  CreditCard,
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  ShoppingCart,
  Filter,
  Grid,
  List,
  ChevronDown
} from 'lucide-react';

// Import page components
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import OffersPage from './pages/OffersPage';
import CartPage from './pages/CartPage';
import ProductPage from './pages/ProductPage';

// Import components
import VoiceVisualizer from './components/VoiceVisualizer';

// Import hooks
import { useVoiceAssistantNative } from './hooks/useVoiceAssistantNative';
import { useCart } from './hooks/useCart';

// ✅ VOICE ASSISTANT BUTTON COMPONENT MIGLIORATO
const VoiceAssistantButton = ({ 
  isListening, 
  isConnected, 
  error, 
  onToggleListening, 
  browserSupportsSpeechRecognition,
  isAssistantActive
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const handleClick = () => {
    if (!browserSupportsSpeechRecognition) {
      console.warn('Speech recognition not supported');
      alert('Il riconoscimento vocale non è disponibile nel tuo browser. Prova con Chrome o Edge per la migliore esperienza.');
      return;
    }
    onToggleListening();
  };
  
  // ✅ STATO VISUALE CORRETTO BASATO SU isAssistantActive
  const getButtonState = () => {
    if (error) {
      return {
        bg: 'bg-gradient-to-r from-red-500 to-red-600',
        pulse: false,
        icon: MicOff,
        tooltip: 'Errore - Clicca per riprovare'
      };
    }
    
    if (isAssistantActive) {
      if (isListening) {
        return {
          bg: 'bg-gradient-to-r from-blue-500 to-purple-500',
          pulse: true,
          icon: Mic,
          tooltip: 'In ascolto - Clicca per fermare'
        };
      } else {
        return {
          bg: 'bg-gradient-to-r from-purple-500 to-pink-500',
          pulse: false,
          icon: Volume2,
          tooltip: 'AIVA attiva - Clicca per chiudere'
        };
      }
    }
    
    return {
      bg: 'bg-gradient-to-r from-blue-600 to-purple-600',
      pulse: false,
      icon: Mic,
      tooltip: 'Attiva AIVA - Il tuo Personal Shopper AI'
    };
  };
  
  const buttonState = getButtonState();
  
  return (
    <motion.div
      className="fixed bottom-4 right-4 md:bottom-8 md:right-8 z-[120] pointer-events-auto"
      style={{
        bottom: `calc(env(safe-area-inset-bottom, 0px) + 1rem)`,
        right: `calc(env(safe-area-inset-right, 0px) + 1rem)`
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
    >
      <motion.button
        onClick={handleClick}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        className={`relative group ${buttonState.bg} p-6 rounded-full shadow-2xl text-white overflow-hidden`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        // ✅ Allow starting even if WS not yet connected; handle connection asynchronously
        disabled={false}
      >
        {/* ✅ BACKGROUND ANIMATO MIGLIORATO */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500"
          animate={{
            backgroundPosition: buttonState.pulse ? ['0% 50%', '100% 50%', '0% 50%'] : ['0% 50%']
          }}
          transition={{
            duration: 2,
            repeat: buttonState.pulse ? Infinity : 0,
            ease: "linear"
          }}
          style={{ backgroundSize: '200% 200%' }}
        />
        
        {/* ✅ RIPPLE EFFECT QUANDO ATTIVO */}
        {buttonState.pulse && (
          <>
            <motion.span
              className="absolute inset-0 rounded-full border-4 border-white"
              animate={{
                scale: [1, 2.2],
                opacity: [0.6, 0]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut"
              }}
            />
            <motion.span
              className="absolute inset-0 rounded-full border-4 border-white"
              animate={{
                scale: [1, 2.2],
                opacity: [0.6, 0]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
                delay: 0.5
              }}
            />
          </>
        )}
        
        {/* Icon */}
        <motion.div
          className="relative z-10"
          animate={{ 
            rotate: buttonState.pulse ? [0, 10, -10, 0] : 0,
            scale: isAssistantActive ? [1, 1.1, 1] : 1
          }}
          transition={{ 
            duration: 0.8, 
            repeat: buttonState.pulse ? Infinity : 0 
          }}
        >
          <buttonState.icon size={28} />
        </motion.div>
        
        {/* Sparkles when hovered and connected */}
        {isHovered && isConnected && (
          <motion.div
            className="absolute -top-1 -right-1"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Sparkles className="text-yellow-300" size={20} />
          </motion.div>
        )}
      </motion.button>
      
      {/* ✅ TOOLTIP MIGLIORATO */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="absolute bottom-full mb-3 right-0 bg-gray-900 text-white text-sm py-2 px-4 rounded-lg whitespace-nowrap max-w-xs"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-yellow-300 flex-shrink-0" />
              <span>{buttonState.tooltip}</span>
            </div>
            <div className="absolute bottom-0 right-8 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Connection Status Indicator */}
      <div className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-white ${
        isConnected ? 'bg-green-400' : 'bg-yellow-400'
      }`} title={isConnected ? 'Connesso' : 'In connessione...'} />
      
      {/* ✅ ERROR MESSAGE MIGLIORATO */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-full mb-2 right-0 bg-red-500 text-white text-sm py-2 px-4 rounded-lg whitespace-nowrap max-w-xs"
        >
          <div className="flex items-center gap-2">
            <X size={16} />
            <span>{error}</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

// Navigation Component
const Navigation = ({ cartItemsCount, isListening, onVoiceToggle }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navigationItems = [
    { id: 'products', label: 'Prodotti', icon: '📦', path: '/products' },
    { id: 'offers', label: 'Offerte', icon: '🏷️', path: '/offers' },
    { id: 'cart', label: 'Carrello', icon: '🛒', path: '/cart', badge: cartItemsCount }
  ];

  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === '/') return 'home';
    if (path === '/products') return 'products';
    if (path === '/offers') return 'offers';
    if (path === '/cart') return 'cart';
    return 'home';
  };

  const currentPage = getCurrentPage();
  
  return (
    <motion.nav
      className="sticky top-0 z-40 bg-white shadow-sm"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100 }}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <motion.a
              href="/"
              className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 cursor-pointer select-none"
              whileHover={{ scale: 1.05 }}
              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
            >
              AIVA Fashion
            </motion.a>
            <div className="hidden md:flex items-center gap-6">
              {navigationItems.map((item) => (
                <a
                  key={item.id}
                  href={item.path}
                  className={`text-gray-700 hover:text-blue-600 transition ${
                    currentPage === item.id ? 'text-blue-600 font-semibold' : ''
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-600 hover:text-blue-600">
              <Search size={20} />
            </button>
            <button className="p-2 text-gray-600 hover:text-blue-600">
              <User size={20} />
            </button>
            <a 
              href="/cart"
              className="relative p-2 text-gray-600 hover:text-blue-600"
            >
              <ShoppingBag size={20} />
              {cartItemsCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                >
                  {cartItemsCount}
                </motion.span>
              )}
            </a>
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t"
          >
            <div className="px-4 py-4 space-y-2">
              {navigationItems.map((item) => (
                <a
                  key={item.id}
                  href={item.path}
                  className={`block py-2 px-3 rounded-lg text-gray-700 hover:text-blue-600 hover:bg-blue-50 ${
                    currentPage === item.id ? 'text-blue-600 font-semibold bg-blue-50' : ''
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                  {item.badge > 0 && (
                    <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-1">
                      {item.badge}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

// Footer Component
const Footer = () => {
  return (
    <footer className="bg-gray-900 text-gray-300 py-12 px-4">
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8">
        <div>
          <h3 className="text-white font-bold text-xl mb-4">AIVA Fashion</h3>
          <p className="text-sm">Il futuro dello shopping è vocale</p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Shop</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="/products" className="hover:text-white transition">Uomo</a></li>
            <li><a href="/products" className="hover:text-white transition">Donna</a></li>
            <li><a href="/products" className="hover:text-white transition">Accessori</a></li>
            <li><a href="/offers" className="hover:text-white transition">Offerte</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Assistenza</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="#" className="hover:text-white transition">Contatti</a></li>
            <li><a href="#" className="hover:text-white transition">Spedizioni</a></li>
            <li><a href="#" className="hover:text-white transition">Resi</a></li>
            <li><a href="#" className="hover:text-white transition">FAQ</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Seguici</h4>
          <p className="text-sm mb-4">Iscriviti per offerte esclusive</p>
          <div className="flex gap-2">
            <input 
              type="email" 
              placeholder="Email"
              className="flex-1 px-3 py-2 bg-gray-800 rounded-lg text-white placeholder-gray-400"
            />
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Iscriviti
            </button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-gray-800 text-center text-sm">
        <p>© 2025 AIVA Fashion - Demo Portfolio Michele Miranda</p>
      </div>
    </footer>
  );
};

// ✅ MAIN APP COMPONENT MIGLIORATO
export default function App() {
  const location = useLocation();
  
  // Cart hook for real cart count
  const { cartCount } = useCart();
  
  // ✅ VOICE ASSISTANT HOOK CON GESTIONE COMPLETA
  const {
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
    isAssistantActive, // ✅ Nuovo stato per controllare se l'assistente è attivo
    toggleListening,
    clearError,
    browserSupportsSpeechRecognition
  } = useVoiceAssistantNative();

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // ✅ HANDLER CHIUSURA COMPLETA ASSISTENTE
  const handleCloseAssistant = () => {
    console.log('🔴 App: Closing assistant completely');
    toggleListening(); // Questo dovrebbe fermare tutto
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <Navigation
        cartItemsCount={cartCount}
        isListening={isListening}
        onVoiceToggle={toggleListening}
      />
      
      {/* Main Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <Routes>
            <Route path="/" element={<HomePage onVoiceToggle={toggleListening} />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:id" element={<ProductPage />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/cart" element={<CartPage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
      
      {/* Footer */}
      <Footer />
      
      {/* ✅ VOICE ASSISTANT BUTTON CON STATI CORRETTI */}
      <VoiceAssistantButton
        isListening={isListening}
        isConnected={isConnected}
        error={error}
        onToggleListening={toggleListening}
        browserSupportsSpeechRecognition={browserSupportsSpeechRecognition}
        isAssistantActive={isAssistantActive}
      />

      {/* ✅ VOICE VISUALIZER CON CONTROLLO CORRETTO */}
      {isAssistantActive && (
        <VoiceVisualizer
          isListening={isListening}
          isProcessing={isProcessing}
          isConnected={isConnected}
          isSpeaking={isSpeaking}
          isExecutingFunction={isExecutingFunction}
          currentFunction={currentFunction}
          messages={messages}
          error={error}
          onClose={handleCloseAssistant} // ✅ Handler completo chiusura
          isAssistantActive={isAssistantActive} // ✅ Aggiunto prop mancante
        />
      )}
    </div>
  );
}