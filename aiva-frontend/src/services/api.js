// src/services/api.js - API Service for Backend Integration
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Create axios instance with default config
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    // Don't throw error for network issues, return empty data instead
    if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
      console.warn('Backend not available, using mock data');
      return { data: [] };
    }
    return Promise.reject(error);
  }
);

// Product API
export const productAPI = {
  // Get all products with optional filters
  getProducts: async (params = {}) => {
    try {
      const response = await api.get('/api/products', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching products:', error);
      // Return mock data if backend is not available
      if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
        return getMockProducts();
      }
      throw error;
    }
  },

  // Get size from product details
  getSizeGuide: async (category) => {
    const response = await api.get(`/api/size-guide/${encodeURIComponent(category)}`);
    return response.data;
  },

  // Get single product by ID
  getProduct: async (productId) => {
    try {
      const response = await api.get(`/api/products/${productId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching product:', error);
      if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
        return getMockProduct(productId);
      }
      throw error;
    }
  },

  // Check product availability
  checkAvailability: async (productId, size, color) => {
    try {
      const response = await api.get(`/api/products/${productId}/availability`, {
        params: { size, color }
      });
      return response.data;
    } catch (error) {
      console.error('Error checking availability:', error);
      // Return available by default for mock
      return { available: true, stock: 10 };
    }
  },

  // Get product recommendations
  getRecommendations: async (params = {}) => {
    try {
      const response = await api.get('/api/recommendations', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
        return getMockRecommendations();
      }
      throw error;
    }
  },

  // Search products with Italian terms
  searchProducts: async (query, filters = {}) => {
    try {
      const params = { q: query, ...filters };
      const response = await api.get('/api/products', { params });
      return response.data;
    } catch (error) {
      console.error('Error searching products:', error);
      if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
        return getMockProducts().filter(product => 
          product.name.toLowerCase().includes(query.toLowerCase()) ||
          product.brand.toLowerCase().includes(query.toLowerCase())
        );
      }
      throw error;
    }
  }
};

// Cart API
export const cartAPI = {
  // Get cart contents
  getCart: async () => {
    try {
      const response = await api.get('/api/cart');
      return response.data;
    } catch (error) {
      console.error('Error fetching cart:', error);
      throw error;
    }
  },

  // Add item to cart
  addToCart: async (productId, size, color, quantity = 1) => {
    try {
      const response = await api.post('/api/cart/items', {
        product_id: productId,
        size,
        color,
        quantity
      });
      return response.data;
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw error;
    }
  },

  // Remove item from cart
  removeFromCart: async (itemId) => {
    try {
      const response = await api.delete(`/api/cart/items/${itemId}`);
      return response.data;
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw error;
    }
  },

  // Update cart item quantity
  updateQuantity: async (itemId, quantity) => {
    try {
      const response = await api.put(`/api/cart/items/${itemId}`, {
        quantity
      });
      return response.data;
    } catch (error) {
      console.error('Error updating quantity:', error);
      throw error;
    }
  },

  // Clear entire cart
  clearCart: async () => {
    try {
      const response = await api.post('/api/cart/clear');
      return response.data;
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  }
};

// Voice/AI API
export const voiceAPI = {
  // Process voice command
  processVoiceCommand: async (text, context = {}) => {
    try {
      const response = await api.post('/api/voice/process', {
        text,
        context
      });
      return response.data;
    } catch (error) {
      console.error('Error processing voice command:', error);
      throw error;
    }
  }
};

// Information API
export const infoAPI = {
  // Get size guide
  getSizeGuide: async (category) => {
    try {
      const response = await api.get(`/api/size-guide/${category}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching size guide:', error);
      throw error;
    }
  },

  // Get shipping info
  getShippingInfo: async () => {
    try {
      const response = await api.get('/api/shipping-info');
      return response.data;
    } catch (error) {
      console.error('Error fetching shipping info:', error);
      throw error;
    }
  },

  // Get current promotions
  getPromotions: async () => {
    try {
      const response = await api.get('/api/promotions');
      return response.data;
    } catch (error) {
      console.error('Error fetching promotions:', error);
      throw error;
    }
  }
};

// WebSocket connection for real-time voice
export const createWebSocketConnection = (sessionId) => {
  const wsUrl = `${BACKEND_URL.replace('http', 'ws')}/ws/${sessionId}`;
  return new WebSocket(wsUrl);
};

// Health check
export const healthCheck = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
};

// Mock data functions for fallback
const getMockProducts = () => [
  {
    id: "550e8400-0001-41d4-a716-446655440001",
    name: "T-Shirt Basic Cotone Bio",
    brand: "EcoWear",
    price: 19.90,
    original_price: 29.90,
    discount_percentage: 33,
    images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400"],
    rating: 4.6,
    reviews: 234,
    category: "t-shirt",
    variants: [
      { size: "S", color: "bianco", stock: 10 },
      { size: "M", color: "bianco", stock: 15 },
      { size: "L", color: "bianco", stock: 8 }
    ]
  },
  {
    id: "550e8400-0002-41d4-a716-446655440002",
    name: "Felpa con Cappuccio",
    brand: "Street Urban",
    price: 59.90,
    original_price: 79.90,
    discount_percentage: 25,
    images: ["https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400"],
    rating: 4.8,
    reviews: 312,
    category: "felpa",
    variants: [
      { size: "M", color: "nero", stock: 12 },
      { size: "L", color: "nero", stock: 10 },
      { size: "XL", color: "nero", stock: 5 }
    ]
  },
  {
    id: "550e8400-0003-41d4-a716-446655440003",
    name: "Jeans Slim Fit",
    brand: "Denim Co",
    price: 79.90,
    original_price: 99.90,
    discount_percentage: 20,
    images: ["https://images.unsplash.com/photo-1542272604-787c3835535d?w=400"],
    rating: 4.7,
    reviews: 456,
    category: "pantaloni",
    variants: [
      { size: "30", color: "blu", stock: 8 },
      { size: "32", color: "blu", stock: 15 },
      { size: "34", color: "blu", stock: 12 }
    ]
  }
];

const getMockProduct = (productId) => {
  const products = getMockProducts();
  return products.find(p => p.id === productId) || products[0];
};

const getMockRecommendations = () => getMockProducts().slice(0, 3);

export default api;
