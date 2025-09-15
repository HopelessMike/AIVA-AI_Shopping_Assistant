import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Star, Filter, Grid, List, ChevronDown, X, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productAPI } from '../services/api';
import { resolveAssetUrl } from '../lib/basePath';
import { useCart } from '../hooks/useCart';
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
          src={resolveAssetUrl(product.images?.[0] || product.image || "/static/images/placeholder.jpg")}
          alt={product.name}
          className="w-full h-full object-cover"
          animate={{ scale: isHovered ? 1.1 : 1 }}
          transition={{ duration: 0.3 }}
        />
        {(() => {
          const discount = Number(product.discount_percentage ?? product.discount ?? 0);
          const original = Number(product.original_price ?? product.originalPrice ?? 0);
          const price = Number(product.price ?? 0);
          const hasDiscount = discount > 0 && original > price;
          return hasDiscount;
        })() && (
          <motion.div
            className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold"
            initial={{ rotate: -15 }}
            animate={{ rotate: isHovered ? 0 : -15 }}
          >
            -{Number(product.discount_percentage ?? product.discount ?? 0)}%
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
            {(() => {
              const discount = Number(product.discount_percentage ?? product.discount ?? 0);
              const original = Number(product.original_price ?? product.originalPrice ?? 0);
              const price = Number(product.price ?? 0);
              const hasDiscount = discount > 0 && original > price;
              return hasDiscount ? (
                <span className="text-sm text-gray-400 line-through mr-2">€{original.toFixed(2)}</span>
              ) : null;
            })()}
            <span className="text-xl font-bold text-gray-900">€{Number(product.price ?? 0).toFixed(2)}</span>
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
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Hooks
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addToCart: addToCartHook } = useCart();

  // (rimosso: gestito nell'effetto di esposizione contesto visibile)

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

  // 🔊 Espone i prodotti visibili (id + mappa normalizzata nome→id) e un entrypoint filtri stabile
  useEffect(() => {
    // Normalizza il nome per match robusti (lowercase + rimozione accenti/punteggiatura)
    const normalize = (s) =>
      (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    const ids = (filteredProducts || []).map((p) => p.id);
    const map = Object.fromEntries(
      (filteredProducts || []).map((p) => [normalize(p.name), p.id])
    );

    // Contesto per l’assistente
    window.visibleProductIds = ids;
    window.visibleProductsMap = map;
    window.productsSearchQuery = searchQuery || '';
    window.productsSelectedCategory = selectedCategory || '';

    // Entrypoint robusto per applicare filtri via voce
    window.applyProductFilters = ({ query, q, category, sort, price_range } = {}) => {
      const qq = query ?? q;
      if (typeof qq === 'string') setSearchQuery(qq);
      if (typeof category === 'string') setSelectedCategory(category);
      if (typeof sort === 'string') setSortBy(sort);
      if (price_range === 'low-to-high') setSortBy('price-low');
      if (price_range === 'high-to-low') setSortBy('price-high');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return () => {
      delete window.visibleProductIds;
      delete window.visibleProductsMap;
      delete window.applyProductFilters;
      delete window.productsSearchQuery;
      delete window.productsSelectedCategory;
    };
  }, [filteredProducts, searchQuery, selectedCategory, setSearchQuery, setSelectedCategory, setSortBy]);

  const getAvailableSizes = (product) => {
    const sizes = new Set();
    (product?.variants || []).forEach(v => { if (v.available) sizes.add(v.size); });
    return Array.from(sizes);
  };

  const getAvailableColors = (product) => {
    const colors = new Set();
    (product?.variants || []).forEach(v => { if (v.available) colors.add(v.color); });
    return Array.from(colors);
  };

  const ensureValidCombination = (product, size, color) => {
    const variants = product?.variants || [];
    return variants.some(v => v.size === size && v.color === color && v.available);
  };

  const openQuickAdd = (product) => {
    setQuickAddProduct(product);
    const sizes = getAvailableSizes(product);
    const colors = getAvailableColors(product);
    const defaultSize = sizes[0] || '';
    const defaultColor = colors[0] || '';
    setSelectedSize(defaultSize);
    setSelectedColor(defaultColor);
    setIsQuickAddOpen(true);
  };

  const handleAddToCart = (product) => {
    // Open variant selection modal instead of adding a default variant
    openQuickAdd(product);
  };

  const confirmAddToCart = async () => {
    if (!quickAddProduct) return;
    if (!selectedSize || !selectedColor) return;
    if (!ensureValidCombination(quickAddProduct, selectedSize, selectedColor)) return;
    try {
      setIsAdding(true);
      await addToCartHook(quickAddProduct, selectedSize, selectedColor, 1);
      setIsQuickAddOpen(false);
      setQuickAddProduct(null);
      console.log('Product added to cart:', quickAddProduct?.name);
    } catch (error) {
      console.error('Error adding to cart:', error);
    } finally {
      setIsAdding(false);
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
      {/* Quick Add Modal */}
      {isQuickAddOpen && quickAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsQuickAddOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{quickAddProduct.name}</h3>
                <p className="text-sm text-gray-500">{quickAddProduct.brand}</p>
              </div>
              <button
                onClick={() => setIsQuickAddOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              {/* Size */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Seleziona taglia</h4>
                <div className="flex flex-wrap gap-2">
                  {getAvailableSizes(quickAddProduct).map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                        selectedSize === size
                          ? 'border-blue-600 text-blue-600 bg-blue-50'
                          : 'border-gray-300 text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Seleziona colore</h4>
                <div className="flex flex-wrap gap-2">
                  {getAvailableColors(quickAddProduct).map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium capitalize ${
                        selectedColor === color
                          ? 'border-blue-600 text-blue-600 bg-blue-50'
                          : 'border-gray-300 text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={confirmAddToCart}
                  disabled={isAdding || !selectedSize || !selectedColor || !ensureValidCombination(quickAddProduct, selectedSize, selectedColor)}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  <ShoppingCart size={18} />
                  {isAdding ? 'Aggiungo...' : 'Aggiungi al carrello'}
                </button>
                <button
                  onClick={() => setIsQuickAddOpen(false)}
                  className="px-4 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Annulla
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
