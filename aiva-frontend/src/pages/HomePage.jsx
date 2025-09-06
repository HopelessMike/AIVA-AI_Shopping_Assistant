// src/pages/HomePage.jsx - Colorful Homepage with Shopping Icons
import React from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, Sparkles, ShoppingBag, Heart, Star, Shirt, 
  ShoppingCart, Gift, Crown, Zap, Palette, Camera 
} from 'lucide-react';

const HomePage = ({ onVoiceToggle }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      {/* Hero Section */}
      <motion.section 
        className="relative overflow-hidden py-20 px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            {/* Main Title */}
            <motion.h1 
              className="text-6xl md:text-7xl font-bold mb-8"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8 }}
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
                Il Futuro dello Shopping
              </span>
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                è Vocale
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p 
              className="text-xl md:text-2xl text-gray-700 mb-12 max-w-4xl mx-auto leading-relaxed"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              Scopri AIVA, il tuo personal shopper AI che ti aiuta a trovare l'outfit perfetto con comandi vocali in italiano.
            </motion.p>

            {/* Central CTA Button */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8, type: "spring", stiffness: 200 }}
              className="mb-16"
            >
              <motion.button
                onClick={onVoiceToggle}
                className="group relative px-12 py-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-2xl font-bold rounded-full shadow-2xl hover:shadow-purple-500/25 transform transition-all duration-300"
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: "0 20px 40px rgba(147, 51, 234, 0.3)"
                }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="flex items-center space-x-4">
                  <motion.div
                    className="relative"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Mic size={32} />
                    <motion.div
                      className="absolute -inset-2 bg-white/20 rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </motion.div>
                  <span>Inizia Shopping Vocale</span>
                  <Sparkles size={24} className="text-yellow-300" />
                </div>
                
                {/* Ripple Effect */}
                <motion.div
                  className="absolute inset-0 rounded-full bg-white/20"
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
                />
              </motion.button>
            </motion.div>

            {/* Floating Elements - Many Colorful Shopping Icons */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top Row */}
              <motion.div
                className="absolute top-16 left-8 text-pink-400"
                animate={{ y: [0, -15, 0], rotate: [0, 10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Shirt size={64} />
              </motion.div>
              <motion.div
                className="absolute top-24 right-12 text-purple-400"
                animate={{ y: [0, 20, 0], rotate: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, delay: 0.5 }}
              >
                <ShoppingBag size={56} />
              </motion.div>
              <motion.div
                className="absolute top-32 left-1/4 text-blue-400"
                animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: 1 }}
              >
                <Heart size={70} />
              </motion.div>

              {/* Middle Row */}
              <motion.div
                className="absolute top-48 right-8 text-green-400"
                animate={{ y: [0, 15, 0], rotate: [0, -12, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, delay: 0.3 }}
              >
                <ShoppingCart size={60} />
              </motion.div>
              <motion.div
                className="absolute top-56 left-12 text-yellow-400"
                animate={{ y: [0, -20, 0], rotate: [0, 8, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, delay: 0.8 }}
              >
                <Gift size={60} />
              </motion.div>
              <motion.div
                className="absolute top-64 right-1/3 text-red-400"
                animate={{ y: [0, 12, 0], rotate: [0, -6, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, delay: 1.2 }}
              >              </motion.div>

              {/* Bottom Row */}
              <motion.div
                className="absolute bottom-48 left-16 text-indigo-400"
                animate={{ y: [0, -18, 0], rotate: [0, 7, 0] }}
                transition={{ duration: 2.7, repeat: Infinity, delay: 0.6 }}
              >
                <Star size={50} />
              </motion.div>
              <motion.div
                className="absolute bottom-40 right-16 text-orange-400"
                animate={{ y: [0, 14, 0], rotate: [0, -9, 0] }}
                transition={{ duration: 3.8, repeat: Infinity, delay: 1.1 }}
              >
                <Palette size={50} />
              </motion.div>
              <motion.div
                className="absolute bottom-32 left-1/3 text-cyan-400"
                animate={{ y: [0, -16, 0], rotate: [0, 11, 0] }}
                transition={{ duration: 2.9, repeat: Infinity, delay: 0.4 }}
              >
              </motion.div>
              <motion.div
                className="absolute bottom-24 right-1/4 text-rose-400"
                animate={{ y: [0, 22, 0], rotate: [0, -7, 0] }}
                transition={{ duration: 3.3, repeat: Infinity, delay: 0.9 }}
              >
                <Crown size={75} />
              </motion.div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Features Section */}
      <motion.section 
        className="py-20 px-4 bg-white/50 backdrop-blur-sm"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8 }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-800 mb-4">
              Perché Scegliere AIVA
            </h2>
            <p className="text-xl text-gray-600">
              Un'esperienza di shopping rivoluzionaria
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Feature 1 */}
            <motion.div
              className="text-center p-8 bg-white/70 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
              whileHover={{ y: -5 }}
            >
              <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mic size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Comandi Vocali</h3>
              <p className="text-gray-600 text-lg">
                Parla naturalmente in italiano per cercare e acquistare prodotti
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              className="text-center p-8 bg-white/70 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
              whileHover={{ y: -5 }}
            >
              <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">AI Intelligente</h3>
              <p className="text-gray-600 text-lg">
                AIVA capisce le tue preferenze e suggerisce outfit perfetti
              </p>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section 
        className="py-20 px-4 bg-gradient-to-r from-purple-600 to-blue-600"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
        <div className="max-w-4xl mx-auto text-center text-white">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Prova l'Esperienza Shopping del Futuro
            </h2>
            <p className="text-xl md:text-2xl mb-8 opacity-90">
              Clicca sul microfono e dì "Cerco una felpa nera" per iniziare
            </p>
            <motion.button
              onClick={onVoiceToggle}
              className="px-10 py-5 bg-white text-purple-600 font-bold text-xl rounded-full shadow-2xl hover:shadow-white/25 transform transition-all duration-300"
              whileHover={{ 
                scale: 1.05,
                boxShadow: "0 20px 40px rgba(255, 255, 255, 0.3)"
              }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="flex items-center space-x-3">
                <Mic size={28} />
                <span>Attiva Assistente Vocale</span>
              </div>
            </motion.button>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
};

export default HomePage;