// src/store/index.js - Zustand Store for Global State Management
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

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
        
        // Products State
        products: [],
        filteredProducts: [],
        selectedProduct: null,
        searchQuery: '',
        filters: {
          category: null,
          gender: null,
          minPrice: 0,
          maxPrice: 1000,
          onSale: false,
        },
        
        // Actions
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
                id: `cart-${Date.now()}`,
                product,
                size,
                color,
                quantity
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
            
            return { cart: newCart, cartTotal, cartCount };
          });
        },
        
        clearCart: () => set({ cart: [], cartTotal: 0, cartCount: 0 }),
        
        updateQuantity: (itemId, quantity) => {
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
            
            return { cart: newCart, cartTotal, cartCount };
          });
        },
        
        setPreferences: (preferences) => {
          set((state) => ({
            preferences: { ...state.preferences, ...preferences }
          }));
        },
        
        setCurrentPage: (page) => set({ currentPage: page }),
        
        toggleVoiceAssistant: () => {
          set((state) => ({ isVoiceAssistantOpen: !state.isVoiceAssistantOpen }));
        },
        
        addVoiceHistory: (entry) => {
          set((state) => ({
            voiceHistory: [...state.voiceHistory, {
              ...entry,
              timestamp: new Date().toISOString()
            }]
          }));
        },
        
        setProducts: (products) => set({ products, filteredProducts: products }),
        
        filterProducts: (filters) => {
          set((state) => {
            let filtered = [...state.products];
            
            if (filters.category) {
              filtered = filtered.filter(p => p.category === filters.category);
            }
            if (filters.gender) {
              filtered = filtered.filter(p => 
                p.gender === filters.gender || p.gender === 'unisex'
              );
            }
            if (filters.minPrice) {
              filtered = filtered.filter(p => p.price >= filters.minPrice);
            }
            if (filters.maxPrice) {
              filtered = filtered.filter(p => p.price <= filters.maxPrice);
            }
            if (filters.onSale) {
              filtered = filtered.filter(p => p.onSale);
            }
            
            return { filters, filteredProducts: filtered };
          });
        },
        
        searchProducts: (query) => {
          set((state) => {
            if (!query) {
              return { searchQuery: '', filteredProducts: state.products };
            }
            
            const queryLower = query.toLowerCase();
            const filtered = state.products.filter(p =>
              p.name.toLowerCase().includes(queryLower) ||
              p.description.toLowerCase().includes(queryLower) ||
              p.brand.toLowerCase().includes(queryLower) ||
              p.category.toLowerCase().includes(queryLower)
            );
            
            return { searchQuery: query, filteredProducts: filtered };
          });
        },
        
        setSelectedProduct: (product) => set({ selectedProduct: product }),
      }),
      {
        name: 'aiva-storage',
        partialize: (state) => ({
          cart: state.cart,
          preferences: state.preferences,
        }),
      }
    )
  )
);

export default useStore;