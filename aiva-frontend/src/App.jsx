import React, { useState, useEffect, useRef } from 'react';
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

// Mock WebSocket for demo (would connect to real backend)
const useWebSocket = (url) => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  
  useEffect(() => {
    // Simulate connection
    setTimeout(() => setIsConnected(true), 500);
  }, []);
  
  const sendMessage = (message) => {
    // Simulate sending message
    console.log('Sending:', message);
  };
  
  return { isConnected, messages, sendMessage };
};

// Voice Assistant Button Component
const VoiceAssistantButton = ({ onClick, isListening }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.div
      className="fixed bottom-8 right-8 z-50"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
    >
      <motion.button
        onClick={onClick}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        className={`relative group ${
          isListening 
            ? 'bg-gradient-to-r from-purple-600 to-pink-600' 
            : 'bg-gradient-to-r from-blue-600 to-purple-600'
        } p-6 rounded-full shadow-2xl text-white overflow-hidden`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Animated background */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500"
          animate={{
            backgroundPosition: isListening ? ['0% 50%', '100% 50%', '0% 50%'] : ['0% 50%']
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear"
          }}
          style={{ backgroundSize: '200% 200%' }}
        />
        
        {/* Ripple effect when listening */}
        {isListening && (
          <>
            <motion.span
              className="absolute inset-0 rounded-full border-4 border-white"
              animate={{
                scale: [1, 2],
                opacity: [0.5, 0]
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
                scale: [1, 2],
                opacity: [0.5, 0]
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
          animate={{ rotate: isListening ? [0, 10, -10, 0] : 0 }}
          transition={{ duration: 0.5, repeat: isListening ? Infinity : 0 }}
        >
          {isListening ? <MicOff size={28} /> : <Mic size={28} />}
        </motion.div>
        
        {/* Sparkles */}
        {isHovered && (
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
      
      {/* Tooltip */}
      <AnimatePresence>
        {isHovered && !isListening && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full mb-2 right-0 bg-gray-900 text-white text-sm py-2 px-4 rounded-lg whitespace-nowrap"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-yellow-300" />
              <span>Parla con AIVA - Il tuo Personal Shopper AI</span>
            </div>
            <div className="absolute bottom-0 right-8 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Product Card Component
const ProductCard = ({ product, onAddToCart }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.div
      className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer"
      whileHover={{ y: -8, shadow: "xl" }}
      transition={{ type: "spring", stiffness: 300 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <div className="relative overflow-hidden h-72 bg-gray-100">
        <motion.img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover"
          animate={{ scale: isHovered ? 1.1 : 1 }}
          transition={{ duration: 0.3 }}
        />
        {product.discount && (
          <motion.div
            className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold"
            initial={{ rotate: -15 }}
            animate={{ rotate: isHovered ? 0 : -15 }}
          >
            -{product.discount}%
          </motion.div>
        )}
        <motion.div
          className="absolute top-4 right-4"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
        >
          <button className="p-2 bg-white rounded-full shadow-md hover:bg-gray-100">
            <Heart size={20} className="text-gray-600" />
          </button>
        </motion.div>
      </div>
      
      <div className="p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{product.brand}</p>
        <h3 className="font-semibold text-gray-900 mb-2">{product.name}</h3>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={14}
                className={i < Math.floor(product.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">({product.reviews})</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            {product.originalPrice && (
              <span className="text-sm text-gray-400 line-through mr-2">
                €{product.originalPrice}
              </span>
            )}
            <span className="text-xl font-bold text-gray-900">€{product.price}</span>
          </div>
          <motion.button
            onClick={() => onAddToCart(product)}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ShoppingCart size={20} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

// Hero Section Component
const HeroSection = () => {
  return (
    <motion.section
      className="relative bg-gradient-to-br from-blue-50 to-purple-50 py-20 px-4 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Il Futuro dello
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600"> Shopping</span> è
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600"> Vocale</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Scopri AIVA, il tuo personal shopper AI che ti aiuta a trovare l'outfit perfetto con comandi vocali in italiano.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <motion.button
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transform transition"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Inizia Shopping Vocale
              </motion.button>
              <motion.button
                className="px-8 py-4 border-2 border-gray-300 text-gray-700 font-semibold rounded-full hover:border-gray-400"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Scopri di Più
              </motion.button>
            </div>
          </motion.div>
          
          <motion.div
            className="relative"
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="relative w-full h-96 bg-gradient-to-br from-blue-400 to-purple-400 rounded-3xl overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-white/20"
                animate={{
                  backgroundImage: [
                    'radial-gradient(circle at 20% 80%, transparent 50%, rgba(255,255,255,0.3) 50%)',
                    'radial-gradient(circle at 80% 20%, transparent 50%, rgba(255,255,255,0.3) 50%)',
                    'radial-gradient(circle at 20% 80%, transparent 50%, rgba(255,255,255,0.3) 50%)'
                  ]
                }}
                transition={{ duration: 4, repeat: Infinity }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{ 
                    y: [0, -10, 0],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="text-white"
                >
                  <Mic size={120} />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      
      {/* Floating elements */}
      <motion.div
        className="absolute top-20 right-10 text-blue-200"
        animate={{ y: [0, 20, 0], rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity }}
      >
        <Sparkles size={40} />
      </motion.div>
      <motion.div
        className="absolute bottom-20 left-10 text-purple-200"
        animate={{ y: [0, -20, 0], rotate: -360 }}
        transition={{ duration: 15, repeat: Infinity }}
      >
        <ShoppingBag size={40} />
      </motion.div>
    </motion.section>
  );
};

// Features Section
const FeaturesSection = () => {
  const features = [
    {
      icon: <Mic />,
      title: "Comandi Vocali",
      description: "Parla naturalmente in italiano per cercare e acquistare prodotti"
    },
    {
      icon: <Sparkles />,
      title: "AI Intelligente",
      description: "AIVA capisce le tue preferenze e suggerisce outfit perfetti"
    },
    {
      icon: <Truck />,
      title: "Spedizione Veloce",
      description: "Consegna in 24-48h, gratis sopra i 100€"
    },
    {
      icon: <Shield />,
      title: "Pagamenti Sicuri",
      description: "Transazioni protette con crittografia avanzata"
    }
  ];
  
  return (
    <section className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Perché Scegliere AIVA
          </h2>
          <p className="text-xl text-gray-600">
            Un'esperienza di shopping rivoluzionaria
          </p>
        </motion.div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <motion.div
                className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl mb-4"
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                <div className="text-blue-600">
                  {React.cloneElement(feature.icon, { size: 32 })}
                </div>
              </motion.div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Main App Component
export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [currentPage, setCurrentPage] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Mock products
  const products = [
    {
      id: 1,
      name: "T-Shirt Basic Cotone Bio",
      brand: "EcoWear",
      price: 19.90,
      originalPrice: 29.90,
      discount: 33,
      image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400",
      rating: 4.6,
      reviews: 234
    },
    {
      id: 2,
      name: "Felpa con Cappuccio",
      brand: "Street Urban",
      price: 59.90,
      originalPrice: 79.90,
      discount: 25,
      image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400",
      rating: 4.8,
      reviews: 312
    },
    {
      id: 3,
      name: "Jeans Slim Fit",
      brand: "Denim Co",
      price: 79.90,
      originalPrice: 99.90,
      discount: 20,
      image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400",
      rating: 4.7,
      reviews: 456
    },
    {
      id: 4,
      name: "Sneakers Vintage",
      brand: "Retro Kicks",
      price: 99.90,
      originalPrice: 139.90,
      discount: 29,
      image: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400",
      rating: 4.8,
      reviews: 289
    },
    {
      id: 5,
      name: "Borsa a Tracolla",
      brand: "Urban Bags",
      price: 89.90,
      originalPrice: 129.90,
      discount: 31,
      image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400",
      rating: 4.8,
      reviews: 234
    },
    {
      id: 6,
      name: "Giacca in Pelle",
      brand: "Aviator Style",
      price: 299.90,
      originalPrice: 449.90,
      discount: 33,
      image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400",
      rating: 4.9,
      reviews: 67
    }
  ];
  
  const handleVoiceAssistant = () => {
    setIsListening(!isListening);
    // Here would connect to WebSocket and handle voice
  };
  
  const handleAddToCart = (product) => {
    setCartItems([...cartItems, product]);
    // Show toast notification
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <motion.nav
        className="sticky top-0 z-40 bg-white shadow-sm"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 100 }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <motion.h1
                className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600"
                whileHover={{ scale: 1.05 }}
              >
                AIVA Fashion
              </motion.h1>
              <div className="hidden md:flex items-center gap-6">
                <a href="#" className="text-gray-700 hover:text-blue-600 transition">Home</a>
                <a href="#" className="text-gray-700 hover:text-blue-600 transition">Uomo</a>
                <a href="#" className="text-gray-700 hover:text-blue-600 transition">Donna</a>
                <a href="#" className="text-gray-700 hover:text-blue-600 transition">Offerte</a>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button className="p-2 text-gray-600 hover:text-blue-600">
                <Search size={20} />
              </button>
              <button className="p-2 text-gray-600 hover:text-blue-600">
                <User size={20} />
              </button>
              <button 
                onClick={() => setShowCart(!showCart)}
                className="relative p-2 text-gray-600 hover:text-blue-600"
              >
                <ShoppingBag size={20} />
                {cartItems.length > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                  >
                    {cartItems.length}
                  </motion.span>
                )}
              </button>
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-600"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>
      </motion.nav>
      
      {/* Hero Section */}
      <HeroSection />
      
      {/* Features */}
      <FeaturesSection />
      
      {/* Products Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="flex items-center justify-between mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-gray-900">Prodotti in Evidenza</h2>
            <button className="flex items-center gap-2 text-blue-600 hover:text-blue-700">
              Vedi tutti <ChevronRight size={20} />
            </button>
          </motion.div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <ProductCard product={product} onAddToCart={handleAddToCart} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl font-bold mb-4">
              Prova l'Esperienza Shopping del Futuro
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Clicca sul microfono e dì "Cerco una felpa nera" per iniziare
            </p>
            <motion.button
              className="px-8 py-4 bg-white text-blue-600 font-semibold rounded-full shadow-lg hover:shadow-xl"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Attiva Assistente Vocale
            </motion.button>
          </motion.div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-white font-bold text-xl mb-4">AIVA Fashion</h3>
            <p className="text-sm">Il futuro dello shopping è vocale</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Shop</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Uomo</a></li>
              <li><a href="#" className="hover:text-white transition">Donna</a></li>
              <li><a href="#" className="hover:text-white transition">Accessori</a></li>
              <li><a href="#" className="hover:text-white transition">Offerte</a></li>
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
      
      {/* Voice Assistant Button */}
      <VoiceAssistantButton 
        onClick={handleVoiceAssistant}
        isListening={isListening}
      />
      
      {/* Cart Drawer - would be a separate component */}
      <AnimatePresence>
        {showCart && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Carrello</h2>
              <button onClick={() => setShowCart(false)}>
                <X size={24} />
              </button>
            </div>
            {cartItems.length === 0 ? (
              <p className="text-gray-500">Il carrello è vuoto</p>
            ) : (
              <div>
                {cartItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 mb-4">
                    <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded" />
                    <div className="flex-1">
                      <h4 className="font-semibold">{item.name}</h4>
                      <p className="text-gray-600">€{item.price}</p>
                    </div>
                  </div>
                ))}
                <button className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Procedi al Checkout
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}