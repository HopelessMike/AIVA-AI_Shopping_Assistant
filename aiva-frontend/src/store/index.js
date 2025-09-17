// src/store/index.js - VERSIONE CORRETTA
// Zustand Store for Global State Management with Enhanced Voice Integration

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Helpers per integrazione Voce ⇄ Carrello
const normalizeKey = (s) =>
  (s || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const publishCartSnapshot = (cart) => {
  if (typeof window === 'undefined') return;
  const snapshot = (cart || []).map((item) => ({
    item_id: item.id,
    product_id: item.product?.id,
    name: item.product?.name,
    size: item.size,
    color: item.color,
    quantity: item.quantity,
    price: item.product?.price,
  }));
  const map = {};
  for (const it of snapshot) {
    const key = normalizeKey(`${it.name} ${it.size || ''} ${it.color || ''}`);
    if (key) map[key] = it.item_id;
  }
  window.cartSnapshot = snapshot;
  window.cartItemsMap = map;
};

const useStore = create(
  devtools(
    persist(
      (set, get) => ({
        // Cart State
        cart: [],
        cartTotal: 0,
        cartCount: 0,
        
        // User Preferences
        preferences: {
          size: null,
          color: null,
          gender: null,
          style: null,
        },
        
        // UI State
        isVoiceAssistantOpen: false,
        isMobileMenuOpen: false,
        isCartOpen: false,
        currentPage: 'home',
        
        // Voice State
        voiceHistory: [],
        isListening: false,
        
        // ✅ PRODUCTS STATE MIGLIORATO
        products: [],
        filteredProducts: [],
        selectedProduct: null,
        searchQuery: '',
        activeFilters: {
          category: null,
          gender: null,
          size: null,
          color: null,
          minPrice: 0,
          maxPrice: 1000,
          onSale: false,
          brand: null,
          style: null,
        },
        
        // ✅ CART ACTIONS MIGLIORATI
        addToCart: (product, size, color, quantity = 1) => {
          set((state) => {
            const existingItem = state.cart.find(
              item => item.product.id === product.id && 
                      item.size === size && 
                      item.color === color
            );
            
            let newCart;
            if (existingItem) {
              newCart = state.cart.map(item =>
                item === existingItem
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              );
            } else {
              newCart = [...state.cart, {
                id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                product,
                size,
                color,
                quantity,
                addedAt: new Date().toISOString()
              }];
            }
            
            const cartTotal = newCart.reduce(
              (total, item) => total + (item.product.price * item.quantity),
              0
            );
            const cartCount = newCart.reduce(
              (count, item) => count + item.quantity,
              0
            );
            
            // Pubblica mappa per comandi vocali (rimozione per nome/taglia/colore)
            publishCartSnapshot(newCart);
            return { cart: newCart, cartTotal, cartCount };
          });
        },
        
        removeFromCart: (itemId) => {
          set((state) => {
            const newCart = state.cart.filter(item => item.id !== itemId);
            const cartTotal = newCart.reduce(
              (total, item) => total + (item.product.price * item.quantity),
              0
            );
            const cartCount = newCart.reduce(
              (count, item) => count + item.quantity,
              0
            );
            publishCartSnapshot(newCart);
            return { cart: newCart, cartTotal, cartCount };
          });
        },
        
        clearCart: () => {
          set({ cart: [], cartTotal: 0, cartCount: 0 });
          publishCartSnapshot([]);
        },
        
        updateQuantity: (itemId, quantity) => {
          if (quantity <= 0) {
            get().removeFromCart(itemId);
            return;
          }
          
          set((state) => {
            const newCart = state.cart.map(item =>
              item.id === itemId ? { ...item, quantity } : item
            );
            const cartTotal = newCart.reduce(
              (total, item) => total + (item.product.price * item.quantity),
              0
            );
            const cartCount = newCart.reduce(
              (count, item) => count + item.quantity,
              0
            );
            publishCartSnapshot(newCart);
            return { cart: newCart, cartTotal, cartCount };
          });
        },
        
        // ✅ Sync forte dal backend (/api/cart)
        setCartFromServer: (serverCart) => {
          set((state) => {
            const serverItems = Array.isArray(serverCart?.items) ? serverCart.items : [];
            const serverCount =
              Number(
                serverCart?.item_count ?? serverCart?.count ?? serverCart?.total_items ?? 0
              ) || 0;
            const serverTotal =
              Number(
                serverCart?.grand_total ?? serverCart?.total ?? serverCart?.subtotal ?? 0
              ) || 0;

            const shouldUseServer =
              serverItems.length > 0 ||
              serverCount > 0 ||
              serverTotal > 0 ||
              state.cart.length === 0;

            const baseCart = shouldUseServer ? serverItems : state.cart;
            const cartTotal = shouldUseServer
              ? serverTotal ||
                baseCart.reduce(
                  (total, item) => total + (item.product?.price || 0) * (item.quantity || 0),
                  0
                )
              : state.cartTotal;
            const cartCount = shouldUseServer
              ? serverCount ||
                baseCart.reduce((count, item) => count + (item.quantity || 0), 0)
              : state.cartCount;

            publishCartSnapshot(baseCart);

            return {
              cart: baseCart,
              cartTotal,
              cartCount,
            };
          });
        },
        
        // ✅ PREFERENCE ACTIONS
        setPreferences: (preferences) => {
          set((state) => ({
            preferences: { ...state.preferences, ...preferences }
          }));
        },
        
        updatePreference: (key, value) => {
          set((state) => ({
            preferences: { ...state.preferences, [key]: value }
          }));
        },
        
        // ✅ NAVIGATION ACTIONS
        setCurrentPage: (page) => set({ currentPage: page }),
        
        toggleVoiceAssistant: () => {
          set((state) => ({ isVoiceAssistantOpen: !state.isVoiceAssistantOpen }));
        },
        
        // ✅ VOICE HISTORY ACTIONS
        addVoiceHistory: (entry) => {
          set((state) => ({
            voiceHistory: [...state.voiceHistory, {
              ...entry,
              timestamp: new Date().toISOString(),
              id: `voice-${Date.now()}`
            }].slice(-50) // Keep only last 50 entries
          }));
        },
        
        clearVoiceHistory: () => set({ voiceHistory: [] }),
        
        // ✅ PRODUCTS ACTIONS MIGLIORATI
        setProducts: (products) => {
          set({ 
            products, 
            filteredProducts: products 
          });
        },
        
        // ✅ SEARCH QUERY MANAGEMENT
        setSearchQuery: (query) => {
          set((state) => {
            const queryLower = query.toLowerCase();
            
            if (!query) {
              return { 
                searchQuery: '', 
                filteredProducts: state.products 
              };
            }
            
            // Enhanced search with Italian synonyms
            const italianSynonyms = {
              'maglia': ['maglia', 'maglietta', 't-shirt', 'polo'],
              'felpa': ['felpa', 'hoodie', 'felpa con cappuccio'],
              'pantaloni': ['pantaloni', 'jeans', 'denim', 'chino'],
              'scarpe': ['scarpe', 'sneakers', 'stivali', 'sandali'],
              'giacca': ['giacca', 'giubbotto', 'bomber', 'cappotto']
            };
            
            // Expand search terms with synonyms
            let expandedTerms = [queryLower];
            for (const [key, synonyms] of Object.entries(italianSynonyms)) {
              if (synonyms.some(syn => queryLower.includes(syn))) {
                expandedTerms = [...expandedTerms, ...synonyms];
              }
            }
            
            const filtered = state.products.filter(product => {
              const searchText = [
                product.name,
                product.description,
                product.brand,
                product.category,
                product.subcategory,
                ...(product.tags || [])
              ].join(' ').toLowerCase();
              
              return expandedTerms.some(term => searchText.includes(term));
            });
            
            return { 
              searchQuery: query, 
              filteredProducts: filtered 
            };
          });
        },
        
        // ✅ ENHANCED FILTER MANAGEMENT
        setFilter: (filterName, value) => {
          set((state) => {
            const newFilters = { ...state.activeFilters, [filterName]: value };
            const filteredProducts = get().applyFilters(state.products, newFilters, state.searchQuery);
            
            return {
              activeFilters: newFilters,
              filteredProducts
            };
          });
        },
        
        setMultipleFilters: (filters) => {
          set((state) => {
            const newFilters = { ...state.activeFilters, ...filters };
            const filteredProducts = get().applyFilters(state.products, newFilters, state.searchQuery);
            
            return {
              activeFilters: newFilters,
              filteredProducts
            };
          });
        },
        
        clearFilters: () => {
          set((state) => ({
            activeFilters: {
              category: null,
              gender: null,
              size: null,
              color: null,
              minPrice: 0,
              maxPrice: 1000,
              onSale: false,
              brand: null,
              style: null,
            },
            filteredProducts: state.products,
            searchQuery: ''
          }));
        },
        
        // ✅ FILTER APPLICATION LOGIC
        applyFilters: (products, filters, query = '') => {
          let filtered = [...products];
          
          // Apply search query first
          if (query) {
            const queryLower = query.toLowerCase();
            filtered = filtered.filter(product => {
              const searchText = [
                product.name,
                product.description,
                product.brand,
                product.category,
                product.subcategory,
                ...(product.tags || [])
              ].join(' ').toLowerCase();
              
              return searchText.includes(queryLower);
            });
          }
          
          // Apply category filter
          if (filters.category) {
            filtered = filtered.filter(p => 
              p.category === filters.category || 
              p.subcategory === filters.category
            );
          }
          
          // Apply gender filter
          if (filters.gender) {
            filtered = filtered.filter(p => 
              p.gender === filters.gender || 
              p.gender === 'unisex'
            );
          }
          
          // Apply size filter
          if (filters.size) {
            filtered = filtered.filter(p => 
              p.variants && p.variants.some(v => 
                v.size === filters.size && v.available
              )
            );
          }
          
          // Apply color filter
          if (filters.color) {
            filtered = filtered.filter(p => 
              p.variants && p.variants.some(v => 
                v.color.toLowerCase().includes(filters.color.toLowerCase())
              )
            );
          }
          
          // Apply price filters
          if (filters.minPrice > 0) {
            filtered = filtered.filter(p => p.price >= filters.minPrice);
          }
          if (filters.maxPrice < 1000) {
            filtered = filtered.filter(p => p.price <= filters.maxPrice);
          }
          
          // Apply sale filter
          if (filters.onSale) {
            filtered = filtered.filter(p => p.on_sale || p.discount_percentage > 0);
          }
          
          // Apply brand filter
          if (filters.brand) {
            filtered = filtered.filter(p => 
              p.brand.toLowerCase().includes(filters.brand.toLowerCase())
            );
          }
          
          // Apply style filter
          if (filters.style) {
            filtered = filtered.filter(p => 
              p.style && p.style.toLowerCase().includes(filters.style.toLowerCase())
            );
          }
          
          return filtered;
        },
        
        // ✅ COMPLETE FILTER PRODUCTS FUNCTION
        filterProducts: (filters) => {
          set((state) => {
            const newFilters = { ...state.activeFilters, ...filters };
            const filteredProducts = get().applyFilters(state.products, newFilters, state.searchQuery);
            
            return { 
              activeFilters: newFilters,
              filteredProducts 
            };
          });
        },
        
        // ✅ SEARCH PRODUCTS WITH FILTERS (for Voice Commands)
        searchProducts: (query, additionalFilters = {}) => {
          set((state) => {
            const combinedFilters = { ...state.activeFilters, ...additionalFilters };
            const filteredProducts = get().applyFilters(state.products, combinedFilters, query);
            
            return { 
              searchQuery: query,
              activeFilters: combinedFilters,
              filteredProducts 
            };
          });
        },
        
        // ✅ PRODUCT SELECTION
        setSelectedProduct: (product) => set({ selectedProduct: product }),
        
        // ✅ UTILITY FUNCTIONS
        getProductById: (productId) => {
          const state = get();
          return state.products.find(p => p.id === productId);
        },
        
        isProductInCart: (productId, size = null, color = null) => {
          const state = get();
          return state.cart.some(item => {
            const matchesProduct = item.product.id === productId;
            const matchesSize = !size || item.size === size;
            const matchesColor = !color || item.color === color;
            return matchesProduct && matchesSize && matchesColor;
          });
        },
        
        getCartItemCount: (productId, size = null, color = null) => {
          const state = get();
          const item = state.cart.find(item => {
            const matchesProduct = item.product.id === productId;
            const matchesSize = !size || item.size === size;
            const matchesColor = !color || item.color === color;
            return matchesProduct && matchesSize && matchesColor;
          });
          return item ? item.quantity : 0;
        },
        
        // ✅ VOICE ASSISTANT INTEGRATION HELPERS
        processVoiceCommand: (command, parameters) => {
          const state = get();
          
          switch (command) {
            case 'search_products':
              if (parameters.query) {
                get().searchProducts(parameters.query, parameters.filters || {});
              }
              break;
              
            case 'add_to_cart':
              if (parameters.product_id) {
                const product = get().getProductById(parameters.product_id);
                if (product) {
                  get().addToCart(
                    product,
                    parameters.size || 'M',
                    parameters.color || 'nero',
                    parameters.quantity || 1
                  );
                }
              }
              break;
              
            case 'clear_cart':
              get().clearCart();
              break;
              
            case 'set_preferences':
              if (parameters.preferences) {
                get().setPreferences(parameters.preferences);
              }
              break;
              
            default:
              console.log('Unknown voice command:', command);
          }
          
          // Add to voice history
          get().addVoiceHistory({
            command,
            parameters,
            result: 'processed'
          });
        },
        
        // ✅ ANALYTICS AND INSIGHTS
        getShoppingInsights: () => {
          const state = get();
          
          const totalSpent = state.cartTotal;
          const itemsInCart = state.cartCount;
          const favoriteCategories = state.voiceHistory
            .filter(entry => entry.command === 'search_products')
            .map(entry => entry.parameters?.query)
            .filter(Boolean);
          
          const preferredSize = state.preferences.size || 
            (state.cart.length > 0 ? state.cart[0].size : null);
          
          return {
            totalSpent,
            itemsInCart,
            favoriteCategories,
            preferredSize,
            searchHistory: state.voiceHistory.slice(-10),
            lastUpdated: new Date().toISOString()
          };
        }
      }),
      {
        name: 'aiva-storage',
        partialize: (state) => ({
          cart: state.cart,
          cartTotal: state.cartTotal,
          cartCount: state.cartCount,
          preferences: state.preferences,
          voiceHistory: state.voiceHistory.slice(-20), // Persist only last 20
        }),
        onRehydrateStorage: () => (state, error) => {
          if (error) return;
          try {
            publishCartSnapshot(state?.cart || []);
          } catch (err) {
            console.warn('Failed to publish cart snapshot after rehydrate:', err);
          }
        },
      }
    ),
    {
      name: 'aiva-store'
    }
  )
);

export default useStore;