// src/services/api.js - API Service for Backend Integration
import { getSessionId, withSessionHeaders } from '../utils/session';
const deriveApiBase = () => {
  const direct = import.meta.env.VITE_API_BASE_URL;
  if (direct) return direct.replace(/\/+$/, '');

  const backend = import.meta.env.VITE_BACKEND_URL;
  if (backend) return `${backend.replace(/\/+$/, '')}/api`;

  if (typeof window !== 'undefined' && window.__API_BASE__) {
    return String(window.__API_BASE__).replace(/\/+$/, '');
  }

  return 'http://localhost:8000/api';
};

const API_BASE = deriveApiBase();
const API_ROOT = API_BASE.replace(/\/api$/, '');

const buildApiUrl = (endpoint = '') => {
  if (!endpoint) return API_BASE;
  if (endpoint.startsWith('http')) return endpoint;
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const normalized = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${base}/${normalized}`;
};

const fetchJson = async (endpoint, options = {}) => {
  const url = buildApiUrl(endpoint);
  const finalOptions = withSessionHeaders({
    credentials: options.credentials ?? 'include',
    ...options,
  });
  const res = await fetch(url, finalOptions);
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${url} ${res.status}`);
  }
  return res.json();
};

const fetchRootJson = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_ROOT.replace(/\/+$/, '')}/${endpoint.replace(/^\//, '')}`;
  const finalOptions = withSessionHeaders({
    credentials: options.credentials ?? 'include',
    ...options,
  });
  const res = await fetch(url, finalOptions);
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${url} ${res.status}`);
  }
  return res.json();
};

// Product API
export const productAPI = {
  async getProducts(params = {}) {
    const qs = new URLSearchParams(params);
    const res = await fetch(
      `${API_BASE}/products?${qs.toString()}`,
      withSessionHeaders({ credentials: 'include' })
    );
    if (!res.ok) throw new Error(`GET /products ${res.status}`);
    return res.json();
  },

  async getSizeGuide(category) {
    const res = await fetch(
      `${API_BASE}/size-guide/${encodeURIComponent(category)}`,
      withSessionHeaders()
    );
    if (!res.ok) throw new Error(`GET /size-guide ${res.status}`);
    return res.json();
  },

  async getProduct(id) {
    const res = await fetch(`${API_BASE}/products/${id}`, withSessionHeaders({ credentials: 'include' }));
    if (!res.ok) throw new Error(`GET /products/${id} ${res.status}`);
    return res.json();
  },

  async checkAvailability(productId, size, color) {
    const qs = new URLSearchParams({ size, color });
    const res = await fetch(
      `${API_BASE}/products/${productId}/availability?${qs.toString()}`,
      withSessionHeaders()
    );
    if (!res.ok) throw new Error(`GET /availability ${res.status}`);
    return res.json();
  },

  async getRecommendations(params = {}) {
    const qs = new URLSearchParams(params);
    const res = await fetch(
      `${API_BASE}/recommendations?${qs.toString()}`,
      withSessionHeaders()
    );
    if (!res.ok) throw new Error(`GET /recommendations ${res.status}`);
    return res.json();
  },

  async searchProducts(query, filters = {}) {
    const qs = new URLSearchParams({ q: query, ...filters });
    const res = await fetch(
      `${API_BASE}/products?${qs.toString()}`,
      withSessionHeaders()
    );
    if (!res.ok) throw new Error(`GET /products ${res.status}`);
    return res.json();
  }
};

// Cart API
export const cartAPI = {
  async getCart() {
    const res = await fetch(`${API_BASE}/cart`, withSessionHeaders({ credentials: 'include' }));
    if (!res.ok) throw new Error(`GET /cart ${res.status}`);
    return res.json();
  },

  // Add item to cart
  async addToCart(productId, size, color, quantity = 1) {
    const payload = { product_id: productId, size, color, quantity };
    const headers = { 'Content-Type': 'application/json' };
    const res = await fetch(
      `${API_BASE}/cart/items`,
      withSessionHeaders({
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
    );
    if (!res.ok) throw new Error(`POST /cart/items ${res.status}`);
    return res.json();
  },

  // Remove item from cart
  async removeFromCart(itemId) {
    const res = await fetch(
      `${API_BASE}/cart/items/${itemId}`,
      withSessionHeaders({ method: 'DELETE' })
    );
    if (!res.ok) throw new Error(`DELETE /cart/items ${res.status}`);
    return res.json();
  },

  // Update cart item quantity
  async updateQuantity(itemId, quantity) {
    const res = await fetch(
      `${API_BASE}/cart/items/${itemId}`,
      withSessionHeaders({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      })
    );
    if (!res.ok) throw new Error(`PUT /cart/items ${res.status}`);
    return res.json();
  },

  // Clear entire cart
  async clearCart() {
    const res = await fetch(
      `${API_BASE}/cart/clear`,
      withSessionHeaders({ method: 'POST' })
    );
    if (!res.ok) throw new Error(`POST /cart/clear ${res.status}`);
    return res.json();
  }
};

// Voice/AI API
export const voiceAPI = {
  async processVoiceCommand(text, context = {}, sessionId) {
    const payload = { text, context: context || {} };
    const resolvedSessionId = sessionId || payload.context?.session_id || getSessionId();
    if (resolvedSessionId) {
      payload.session_id = resolvedSessionId;
      payload.context = { ...payload.context, session_id: resolvedSessionId };
    }

    const res = await fetch(
      `${API_BASE}/voice/command`,
      withSessionHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
    );
    if (!res.ok) throw new Error(`POST /voice/command ${res.status}`);
    return res.json();
  }
};

// Information API
export const infoAPI = {
  // Get size guide
  getSizeGuide: async (category) => {
    return fetchJson(`/size-guide/${encodeURIComponent(category)}`, {
      credentials: 'omit',
    });
  },

  // Get shipping info
  getShippingInfo: async () => {
    return fetchJson('/shipping-info', { credentials: 'omit' });
  },

  // Get current promotions
  getPromotions: async () => {
    return fetchJson('/promotions', { credentials: 'omit' });
  }
};

// WebSocket connection for real-time voice
export function createWebSocketConnection(sessionId) {
  if (import.meta.env.VITE_VERCEL_MODE === 'true') {
    throw new Error('WebSocket disabilitato in ambiente Vercel');
  }
  const u = new URL(API_BASE);
  const scheme = u.protocol === 'https:' ? 'wss' : 'ws';
  return new WebSocket(`${scheme}://${u.host}/ws/${sessionId}`);
}

// Health check
export const healthCheck = async () => {
  return fetchRootJson('/health', { credentials: 'omit' });
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

// No default export
