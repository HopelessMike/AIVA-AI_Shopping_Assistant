import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Star, Filter, Grid, List, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productAPI, cartAPI } from '../services/api';
import { useFavorites } from '../hooks/useFavorites';

const ProductCard = ({ product, onAddToCart, onToggleFavorite, isFavorite }) => {
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();
  
  const handleCardClick = () => {
    navigate(`/products/${product.id}`);
  };
  
  return (
    <motion.div
      className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer"
      whileHover={{ y: -8, shadow: "xl" }}
      transition={{ type: "spring", stiffness: 300 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      <div className="relative overflow-hidden h-72 bg-gray-100">
        <motion.img
          src={product.images?.[0] || product.image || "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400"}
          alt={product.name}
          className="w-full h-full object-cover"
          animate={{ scale: isHovered ? 1.1 : 1 }}
          transition={{ duration: 0.3 }}
        />
        {(product.discount_percentage || product.discount) && (
          <motion.div
            className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold"
            initial={{ rotate: -15 }}
            animate={{ rotate: isHovered ? 0 : -15 }}
          >
            -{product.discount_percentage || product.discount}%
          </motion.div>
        )}
        <motion.div
          className="absolute top-4 right-4"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(product);
          }}
        >
          <button className={`p-2 rounded-full shadow-md transition-colors ${
            isFavorite 
              ? 'bg-red-500 text-white hover:bg-red-600' 
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}>
            <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
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
            {(product.original_price || product.originalPrice) && (
              <span className="text-sm text-gray-400 line-through mr-2">
                €{product.original_price || product.originalPrice}
              </span>
            )}
            <span className="text-xl font-bold text-gray-900">€{product.price}</span>
          </div>
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(product);
            }}
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

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState('grid');

  // Hooks
  const { toggleFavorite, isFavorite } = useFavorites();

  const categories = [
    { id: '', name: 'Tutte le categorie' },
    { id: 't-shirt', name: 'T-Shirt' },
    { id: 'camicia', name: 'Camicie' },
    { id: 'maglione', name: 'Maglioni' },
    { id: 'felpa', name: 'Felpe' },
    { id: 'giacca', name: 'Giacche' },
    { id: 'pantaloni', name: 'Pantaloni' },
    { id: 'shorts', name: 'Shorts' },
    { id: 'gonna', name: 'Gonne' },
    { id: 'vestito', name: 'Vestiti' },
    { id: 'scarpe', name: 'Scarpe' },
    { id: 'accessori', name: 'Accessori' }
  ];

  // Load products from backend with fallback
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load products with filters
        const params = {};
        if (selectedCategory) {
          params.category = selectedCategory;
        }
        if (searchQuery) {
          params.q = searchQuery;
        }
        
        const productsData = await productAPI.getProducts(params);
        setProducts(productsData);
        setFilteredProducts(productsData);
      } catch (err) {
        console.error('Error loading products:', err);
        setError('Errore nel caricamento dei prodotti. Riprova più tardi.');
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [selectedCategory, searchQuery]);

  // Filter and sort products
  useEffect(() => {
    let filtered = [...products];

    // Sort products
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return a.price - b.price;
        case 'price-high':
          return b.price - a.price;
        case 'rating':
          return b.rating - a.rating;
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    setFilteredProducts(filtered);
  }, [products, sortBy]);

  const handleAddToCart = async (product) => {
    try {
      // For now, add with default size and color
      // In a real app, you'd show a size/color selector
      const defaultVariant = product.variants?.[0];
      if (defaultVariant) {
        await cartAPI.addToCart(
          product.id,
          defaultVariant.size,
          defaultVariant.color,
          1
        );
        // Show success message
        console.log('Product added to cart:', product.name);
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento prodotti...</p>
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
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Prodotti</h1>
          <p className="text-gray-600">Scopri la nostra collezione di moda italiana</p>
        </motion.div>

        {/* Filters and Search */}
        <motion.div
          className="bg-white rounded-lg shadow-sm p-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="Cerca prodotti..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <Filter size={20} className="text-gray-500" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Ordina per:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="name">Nome</option>
                <option value="price-low">Prezzo: Basso-Alto</option>
                <option value="price-high">Prezzo: Alto-Basso</option>
                <option value="rating">Valutazione</option>
              </select>
            </div>

            {/* View Mode */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-500'}`}
              >
                <Grid size={20} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-500'}`}
              >
                <List size={20} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-gray-600">
            {filteredProducts.length} prodotti trovati
            {searchQuery && ` per "${searchQuery}"`}
            {selectedCategory && ` in ${categories.find(c => c.id === selectedCategory)?.name}`}
          </p>
        </div>

        {/* Products Grid */}
        <motion.div
          className={`grid gap-6 ${
            viewMode === 'grid' 
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
              : 'grid-cols-1'
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {filteredProducts.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <ProductCard 
                product={product} 
                onAddToCart={handleAddToCart}
                onToggleFavorite={toggleFavorite}
                isFavorite={isFavorite(product.id)}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* No Results */}
        {filteredProducts.length === 0 && (
          <motion.div
            className="text-center py-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="text-gray-400 mb-4">
              <Filter size={64} className="mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Nessun prodotto trovato</h3>
            <p className="text-gray-600 mb-4">
              Prova a modificare i filtri o la ricerca
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('');
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Rimuovi filtri
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ProductsPage;
