import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Star, Tag, X } from 'lucide-react';
import { productAPI } from '../services/api';
import { useCart } from '../hooks/useCart';

const OfferCard = ({ offer, onAddToCart }) => {
  const [isHovered, setIsHovered] = useState(false);

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

      <div className="relative overflow-hidden h-72 bg-gray-100">
        <motion.img
          src={offer.image}
          alt={offer.name}
          className="w-full h-full object-cover"
          animate={{ scale: isHovered ? 1.1 : 1 }}
          transition={{ duration: 0.3 }}
        />
        
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
              €{Number(offer.originalPrice ?? 0).toFixed(2)}
            </span>
            <span className="text-xl font-bold text-red-600">€{Number(offer.price ?? 0).toFixed(2)}</span>
            <div className="text-xs text-green-600 font-semibold">
              Risparmi €{(Number(offer.originalPrice ?? 0) - Number(offer.price ?? 0)).toFixed(2)}
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
  const { addToCart: addToCartHook } = useCart();
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddOffer, setQuickAddOffer] = useState(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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

  // Espone i prodotti visibili per il backend (nome -> id) e lista visibile
  useEffect(() => {
    try {
      const map = {};
      (offers || []).forEach(p => {
        const key = (p.name || '').toLowerCase().normalize('NFKD').replace(/[^\w\s]/g,'').trim();
        if (key) map[key] = p.id;
      });
      window.visibleProductsMap = map;
      window.visibleProductIds = (offers || []).map(p => p.id);
      window.currentPageContext = 'offers';
    } catch {}
    return () => {
      if (window.currentPageContext === 'offers') {
        try {
          delete window.visibleProductsMap;
          delete window.visibleProductIds;
          delete window.currentPageContext;
        } catch {}
      }
    };
  }, [offers]);

  // Listener eventuale per applicazione filtri lato offerte (no-op per ora)
  useEffect(() => {
    const handler = (e) => {
      // Placeholder per eventuale gestione futura; manteniamo per compatibilità
      // const { filters, query } = e.detail || {};
    };
    window.addEventListener('offers-apply-filters', handler);
    return () => window.removeEventListener('offers-apply-filters', handler);
  }, []);

  const getAvailableSizes = (offer) => {
    const sizes = new Set();
    (offer?.variants || []).forEach((variant) => {
      if (variant?.available) {
        sizes.add(variant.size);
      }
    });
    return Array.from(sizes);
  };

  const getAvailableColors = (offer, sizeFilter = null) => {
    const colors = new Set();
    (offer?.variants || []).forEach((variant) => {
      if (!variant?.available) return;
      if (sizeFilter && variant.size !== sizeFilter) return;
      colors.add(variant.color);
    });
    return Array.from(colors);
  };

  const ensureValidCombination = (offer, size, color) => {
    if (!offer || !size || !color) return false;
    return (offer.variants || []).some(
      (variant) =>
        variant?.available &&
        variant.size === size &&
        variant.color === color
    );
  };

  const closeQuickAdd = () => {
    setIsQuickAddOpen(false);
    setQuickAddOffer(null);
    setSelectedSize('');
    setSelectedColor('');
    setIsAdding(false);
  };

  const openQuickAdd = (offer) => {
    if (!offer) return;
    setQuickAddOffer(offer);
    const sizes = getAvailableSizes(offer);
    const defaultSize = sizes[0] || '';
    const colorsForSize = getAvailableColors(offer, defaultSize);
    const fallbackColors = getAvailableColors(offer);
    const defaultColor = colorsForSize[0] || fallbackColors[0] || '';
    setSelectedSize(defaultSize);
    setSelectedColor(defaultColor);
    setIsQuickAddOpen(true);
  };

  const handleSelectSize = (size) => {
    setSelectedSize(size);
    if (!quickAddOffer) return;
    const colorsForSize = getAvailableColors(quickAddOffer, size);
    setSelectedColor((prevColor) => {
      if (colorsForSize.includes(prevColor)) {
        return prevColor;
      }
      return colorsForSize[0] || '';
    });
  };

  const handleSelectColor = (color) => {
    setSelectedColor(color);
  };

  const confirmAddToCart = async () => {
    if (!quickAddOffer || !selectedSize || !selectedColor) return;
    if (!ensureValidCombination(quickAddOffer, selectedSize, selectedColor)) return;

    try {
      setIsAdding(true);
      const productName = quickAddOffer?.name;
      await addToCartHook(quickAddOffer, selectedSize, selectedColor, 1);
      closeQuickAdd();
      console.log('Offer added to cart:', productName);
    } catch (error) {
      console.error('Error adding offer to cart:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddToCart = (offer) => {
    openQuickAdd(offer);
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
          <p className="text-gray-600">Scopri una selezione di prodotti in sconto</p>
        </motion.div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-gray-600">
            {offers.length} offerte disponibili
          </p>
        </div>

        {/* Offers Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {offers.map((offer, index) => (
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
        {offers.length === 0 && (
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
          </motion.div>
        )}

        {isQuickAddOpen && quickAddOffer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={closeQuickAdd} />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{quickAddOffer.name}</h3>
                  <p className="text-sm text-gray-500">{quickAddOffer.brand}</p>
                </div>
                <button
                  onClick={closeQuickAdd}
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Seleziona taglia</h4>
                  <div className="flex flex-wrap gap-2">
                    {getAvailableSizes(quickAddOffer).map((size) => (
                      <button
                        key={size}
                        onClick={() => handleSelectSize(size)}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                          selectedSize === size
                            ? 'border-red-600 text-red-600 bg-red-50'
                            : 'border-gray-300 text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Seleziona colore</h4>
                  <div className="flex flex-wrap gap-2">
                    {getAvailableColors(quickAddOffer, selectedSize || undefined).map((color) => (
                      <button
                        key={color}
                        onClick={() => handleSelectColor(color)}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium capitalize ${
                          selectedColor === color
                            ? 'border-red-600 text-red-600 bg-red-50'
                            : 'border-gray-300 text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={confirmAddToCart}
                    disabled={
                      isAdding ||
                      !selectedSize ||
                      !selectedColor ||
                      !ensureValidCombination(quickAddOffer, selectedSize, selectedColor)
                    }
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 disabled:opacity-60"
                  >
                    <ShoppingCart size={18} />
                    {isAdding ? 'Aggiungo...' : 'Aggiungi al carrello'}
                  </button>
                  <button
                    onClick={closeQuickAdd}
                    className="px-4 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
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
