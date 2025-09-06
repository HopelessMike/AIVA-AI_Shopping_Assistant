// src/pages/ProductPage.jsx - Single Product Detail Page
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Heart, 
  ShoppingCart, 
  Star, 
  Truck, 
  Shield, 
  RotateCcw,
  Minus,
  Plus,
  Check
} from 'lucide-react';
import { productAPI } from '../services/api';
import { useCart } from '../hooks/useCart';
import { useFavorites } from '../hooks/useFavorites';

const ProductPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);

  // Load product data
  useEffect(() => {
    const loadProduct = async () => {
      try {
        setLoading(true);
        setError(null);
        const productData = await productAPI.getProduct(id);
        setProduct(productData);
        
        // Set default selections
        if (productData.variants && productData.variants.length > 0) {
          setSelectedSize(productData.variants[0].size);
          setSelectedColor(productData.variants[0].color);
        }
      } catch (err) {
        console.error('Error loading product:', err);
        setError('Errore nel caricamento del prodotto');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadProduct();
    }
  }, [id]);

  const handleAddToCart = async () => {
    if (!selectedSize || !selectedColor) {
      alert('Seleziona taglia e colore');
      return;
    }

    try {
      await addToCart(product, selectedSize, selectedColor, quantity);
      alert('Prodotto aggiunto al carrello!');
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('Errore nell\'aggiunta al carrello');
    }
  };

  const toggleFavoriteHandler = () => {
    if (product) {
      toggleFavorite(product);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento prodotto...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Errore!</h2>
          <p className="text-gray-700 mb-6">{error || 'Prodotto non trovato'}</p>
          <button
            onClick={() => navigate('/products')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300"
          >
            Torna ai Prodotti
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Back Button */}
        <motion.button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
          whileHover={{ x: -5 }}
        >
          <ArrowLeft size={20} className="mr-2" />
          Torna indietro
        </motion.button>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Product Images */}
          <div className="space-y-4">
            {/* Main Image */}
            <motion.div
              className="aspect-square bg-white rounded-2xl overflow-hidden shadow-lg"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <img
                src={product.images?.[selectedImage] || product.image || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600"}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </motion.div>

            {/* Thumbnail Images */}
            {product.images && product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.map((image, index) => (
                  <motion.button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`aspect-square rounded-lg overflow-hidden ${
                      selectedImage === index ? 'ring-2 ring-blue-500' : ''
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <img
                      src={image}
                      alt={`${product.name} ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="space-y-6">
            {/* Product Info */}
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
              <p className="text-lg text-gray-600 mb-4">{product.brand}</p>
              
              {/* Rating */}
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={20}
                      fill={i < Math.floor(product.rating) ? "currentColor" : "none"}
                      stroke="currentColor"
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-500 ml-2">({product.reviews} recensioni)</span>
              </div>

              {/* Price */}
              <div className="mb-6">
                {product.original_price && (
                  <span className="text-lg text-gray-400 line-through mr-2">
                    €{product.original_price}
                  </span>
                )}
                <span className="text-3xl font-bold text-gray-900">€{product.price}</span>
                {product.discount_percentage && (
                  <span className="ml-3 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                    -{product.discount_percentage}%
                  </span>
                )}
              </div>
            </div>

            {/* Size Selection */}
            {product.variants && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Taglia</h3>
                <div className="flex flex-wrap gap-2">
                  {[...new Set(product.variants.map(v => v.size))].map(size => (
                    <motion.button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-4 py-2 border rounded-lg font-medium ${
                        selectedSize === size
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-300 text-gray-700 hover:border-gray-400'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {size}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Selection */}
            {product.variants && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Colore</h3>
                <div className="flex flex-wrap gap-2">
                  {[...new Set(product.variants.map(v => v.color))].map(color => (
                    <motion.button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-4 py-2 border rounded-lg font-medium capitalize ${
                        selectedColor === color
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-300 text-gray-700 hover:border-gray-400'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {color}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Quantità</h3>
              <div className="flex items-center space-x-3">
                <motion.button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  whileTap={{ scale: 0.95 }}
                >
                  <Minus size={16} />
                </motion.button>
                <span className="text-lg font-medium px-4">{quantity}</span>
                <motion.button
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  whileTap={{ scale: 0.95 }}
                >
                  <Plus size={16} />
                </motion.button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-4">
              <div className="flex space-x-4">
                <motion.button
                  onClick={handleAddToCart}
                  className="flex-1 bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-blue-700 flex items-center justify-center"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <ShoppingCart size={20} className="mr-2" />
                  Aggiungi al Carrello
                </motion.button>
                
                <motion.button
                  onClick={toggleFavoriteHandler}
                  className={`p-4 rounded-lg border-2 ${
                    product && isFavorite(product.id)
                      ? 'border-red-500 bg-red-50 text-red-600' 
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Heart size={20} fill={product && isFavorite(product.id) ? "currentColor" : "none"} />
                </motion.button>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 gap-4 pt-6 border-t">
              <div className="flex items-center text-gray-600">
                <Truck size={20} className="mr-3" />
                <span>Spedizione gratuita sopra i €100</span>
              </div>
              <div className="flex items-center text-gray-600">
                <RotateCcw size={20} className="mr-3" />
                <span>Reso gratuito entro 30 giorni</span>
              </div>
              <div className="flex items-center text-gray-600">
                <Shield size={20} className="mr-3" />
                <span>Pagamenti sicuri</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
