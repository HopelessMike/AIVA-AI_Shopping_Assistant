import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Star, Clock, Tag } from 'lucide-react';
import { productAPI, cartAPI } from '../services/api';

const OfferCard = ({ offer, onAddToCart }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(offer.timeLeft);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <motion.div
      className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer relative"
      whileHover={{ y: -8, shadow: "xl" }}
      transition={{ type: "spring", stiffness: 300 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Discount Badge */}
      <div className="absolute top-4 left-4 z-10">
        <motion.div
          className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1"
          initial={{ rotate: -15 }}
          animate={{ rotate: isHovered ? 0 : -15 }}
        >
          <Tag size={14} />
          -{offer.discount}%
        </motion.div>
      </div>

      {/* Timer */}
      <div className="absolute top-4 right-4 z-10">
        <motion.div
          className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1"
          animate={{ scale: timeLeft < 3600 ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 1, repeat: timeLeft < 3600 ? Infinity : 0 }}
        >
          <Clock size={14} />
          {formatTime(timeLeft)}
        </motion.div>
      </div>

      <div className="relative overflow-hidden h-72 bg-gray-100">
        <motion.img
          src={offer.image}
          alt={offer.name}
          className="w-full h-full object-cover"
          animate={{ scale: isHovered ? 1.1 : 1 }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Overlay for urgency */}
        {timeLeft < 3600 && (
          <motion.div
            className="absolute inset-0 bg-red-500/20"
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
        
        <motion.div
          className="absolute top-4 right-16"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
        >
          <button className="p-2 bg-white rounded-full shadow-md hover:bg-gray-100">
            <Heart size={20} className="text-gray-600" />
          </button>
        </motion.div>
      </div>
      
      <div className="p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{offer.brand}</p>
        <h3 className="font-semibold text-gray-900 mb-2">{offer.name}</h3>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={14}
                className={i < Math.floor(offer.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">({offer.reviews})</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-400 line-through mr-2">
              €{offer.originalPrice}
            </span>
            <span className="text-xl font-bold text-red-600">€{offer.price}</span>
            <div className="text-xs text-green-600 font-semibold">
              Risparmi €{(offer.originalPrice - offer.price).toFixed(2)}
            </div>
          </div>
          <motion.button
            onClick={() => onAddToCart(offer)}
            className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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

const OffersPage = () => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const filters = [
    { id: 'all', name: 'Tutte le offerte' },
    { id: 'flash', name: 'Flash Sale' },
    { id: 'daily', name: 'Offerta del giorno' },
    { id: 'weekly', name: 'Offerta della settimana' }
  ];

  useEffect(() => {
    const loadOffers = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load products that are on sale
        const productsData = await productAPI.getProducts({ on_sale: true });
        
        // Transform products to offers format
        const offersData = productsData.map((product, index) => ({
          id: product.id,
          name: product.name,
          brand: product.brand,
          price: product.price,
          originalPrice: product.original_price,
          discount: product.discount_percentage,
          image: product.images?.[0] || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400",
          rating: product.rating,
          reviews: product.reviews,
          category: product.category,
          timeLeft: 3600 + (index * 1800), // Different countdown times
          type: index % 3 === 0 ? 'flash' : index % 3 === 1 ? 'daily' : 'weekly',
          variants: product.variants
        }));
        
        setOffers(offersData);
      } catch (err) {
        console.error('Error loading offers:', err);
        setError('Errore nel caricamento delle offerte. Riprova più tardi.');
      } finally {
        setLoading(false);
      }
    };

    loadOffers();
  }, []);

  const filteredOffers = selectedFilter === 'all' 
    ? offers 
    : offers.filter(offer => offer.type === selectedFilter);

  const handleAddToCart = async (offer) => {
    try {
      const defaultVariant = offer.variants?.[0];
      if (defaultVariant) {
        await cartAPI.addToCart(
          offer.id,
          defaultVariant.size,
          defaultVariant.color,
          1
        );
        console.log('Offer added to cart:', offer.name);
      }
    } catch (error) {
      console.error('Error adding offer to cart:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento offerte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Offerte Speciali</h1>
          <p className="text-gray-600">Non perdere le nostre offerte limitate nel tempo</p>
        </motion.div>

        {/* Filters */}
        <motion.div
          className="bg-white rounded-lg shadow-sm p-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setSelectedFilter(filter.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedFilter === filter.id
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.name}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Urgent Offers Banner */}
        {offers.some(offer => offer.timeLeft < 3600) && (
          <motion.div
            className="bg-gradient-to-r from-red-500 to-orange-500 text-white p-4 rounded-lg mb-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-center gap-2">
              <Clock size={20} />
              <span className="font-semibold">ATTENZIONE! Offerte in scadenza tra poco!</span>
            </div>
          </motion.div>
        )}

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-gray-600">
            {filteredOffers.length} offerte disponibili
            {selectedFilter !== 'all' && ` in ${filters.find(f => f.id === selectedFilter)?.name}`}
          </p>
        </div>

        {/* Offers Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {filteredOffers.map((offer, index) => (
            <motion.div
              key={offer.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <OfferCard offer={offer} onAddToCart={handleAddToCart} />
            </motion.div>
          ))}
        </motion.div>

        {/* No Results */}
        {filteredOffers.length === 0 && (
          <motion.div
            className="text-center py-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="text-gray-400 mb-4">
              <Tag size={64} className="mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Nessuna offerta trovata</h3>
            <p className="text-gray-600 mb-4">
              Controlla di nuovo più tardi per nuove offerte
            </p>
            <button
              onClick={() => setSelectedFilter('all')}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Vedi tutte le offerte
            </button>
          </motion.div>
        )}

        {/* Newsletter Signup */}
        <motion.div
          className="mt-16 bg-gradient-to-r from-red-500 to-orange-500 rounded-xl p-8 text-white text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-3xl font-bold mb-4">Non Perdere le Offerte!</h2>
          <p className="text-xl mb-6 opacity-90">
            Iscriviti alla newsletter per ricevere notifiche sulle offerte esclusive
          </p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <input
              type="email"
              placeholder="La tua email"
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 placeholder-gray-500"
            />
            <button className="px-6 py-3 bg-white text-red-600 font-semibold rounded-lg hover:bg-gray-100">
              Iscriviti
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default OffersPage;
