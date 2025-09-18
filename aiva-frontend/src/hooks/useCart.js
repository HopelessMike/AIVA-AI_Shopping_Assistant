// src/hooks/useCart.js - Cart Management Hook
import { useState, useCallback, useEffect } from 'react';
import useStore from '../store';
import axios from 'axios';
import { getSessionId, SESSION_HEADER } from '../utils/session';

const deriveBackendUrl = () => {
  const fromBackend = import.meta.env.VITE_BACKEND_URL;
  if (fromBackend) return fromBackend.replace(/\/+$/, '');

  const fromApi = import.meta.env.VITE_API_BASE_URL;
  if (fromApi) return fromApi.replace(/\/?api\/?$/, '');

  if (typeof window !== 'undefined' && window.__API_BASE__) {
    return String(window.__API_BASE__).replace(/\/?api\/?$/, '');
  }

  return 'http://localhost:8000';
};

const BACKEND_URL = deriveBackendUrl();

const getSessionHeaders = () => {
  const sessionId = getSessionId();
  return sessionId ? { [SESSION_HEADER]: sessionId } : {};
};

// Helpers per snapshot carrello
export function normalizeKey(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Helper: sincronizza dallo stato canonico del server
async function syncCartFromServer() {
  try {
    const res = await axios.get(`${BACKEND_URL}/api/cart`, {
      headers: getSessionHeaders()
    });
    // Aggiorna lo store globale con il payload del backend
    const setCartFromServer = useStore.getState().setCartFromServer;
    if (typeof setCartFromServer === 'function') {
      setCartFromServer(res.data);
    }
  } catch (e) {
    console.warn('Cart sync from server failed:', e?.message || e);
  }
}
export function publishCartSnapshot(cart) {
  try {
    const snapshot = (cart || []).map(item => ({
      item_id: item.id,
      product_id: item.product?.id,
      name: item.product?.name,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      price: item.product?.price
    }));

    const map = {};
    for (const it of snapshot) {
      const key = normalizeKey(`${it.name} ${it.size || ''} ${it.color || ''}`);
      if (key) map[key] = it.item_id;
    }

    window.cartSnapshot = snapshot;
    window.cartItemsMap = map;
    window.dispatchEvent(new CustomEvent('aiva-cart-changed', { detail: snapshot }));
  } catch {}
}

// ✅ Helper: riassunto vocale del carrello
export function buildCartSpeechSummary(limit = 5) {
  try {
    const state = useStore.getState();
    const items = Array.isArray(state.cart) ? state.cart : [];
    if (items.length === 0) return 'Il carrello è vuoto.';
    const parts = [];
    for (let i = 0; i < Math.min(items.length, limit); i++) {
      const it = items[i];
      const name = it?.product?.name || 'prodotto';
      const qty = it?.quantity || 1;
      const size = it?.size ? `, taglia ${it.size}` : '';
      const color = it?.color ? `, ${it.color}` : '';
      const qtyLabel = qty === 1 ? 'pezzo' : 'pezzi';
      parts.push(`${qty} ${qtyLabel} di ${name}${size}${color}`);
    }
    const rest = items.length - Math.min(items.length, limit);
    const tail = rest > 0 ? `, e altri ${rest} articoli.` : '.';
    return `Nel carrello ci sono: ${parts.join('. ')}${tail}`;
  } catch {
    return 'Il carrello è vuoto.';
  }
}

export const useCart = () => {
  const {
    cart,
    cartTotal,
    cartCount,
    addToCart: storeAddToCart,
    removeFromCart: storeRemoveFromCart,
    clearCart: storeClearCart,
    updateQuantity: storeUpdateQuantity
  } = useStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shipping, setShipping] = useState(0);
  
  // Calculate shipping based on total
  useEffect(() => {
    if (cartTotal >= 100) {
      setShipping(0); // Free shipping over 100€
    } else if (cartCount > 0) {
      setShipping(9.90);
    } else {
      setShipping(0);
    }
  }, [cartTotal, cartCount]);
  
  // Pubblica snapshot ad ogni cambio carrello
  useEffect(() => {
    publishCartSnapshot(cart);
  }, [cart]);

  // Add item to cart with variant selection
  const addToCart = useCallback(async (product, size, color, quantity = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      // Check availability with backend
      const response = await axios.get(
        `${BACKEND_URL}/api/products/${product.id}/availability`,
        {
          params: { size, color },
          headers: getSessionHeaders()
        }
      );
      
      if (!response.data.available) {
        throw new Error('Variante non disponibile');
      }
      
      // Aggiornamento ottimistico locale
      storeAddToCart(product, size, color, quantity);
      publishCartSnapshot(useStore.getState().cart);

      // Backend: add
      await axios.post(
        `${BACKEND_URL}/api/cart/items`,
        {
          product_id: product.id,
          size,
          color,
          quantity
        },
        {
          headers: { ...getSessionHeaders(), 'Content-Type': 'application/json' }
        }
      );
      // Riallinea lo store allo stato server
      await syncCartFromServer();
      
      return true;
    } catch (err) {
      setError(err.message || 'Errore aggiunta al carrello');
      console.error('Add to cart error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [storeAddToCart]);
  
  // Remove item from cart
  const removeFromCart = useCallback(async (itemId) => {
    try {
      setLoading(true);
      setError(null);
      
      // Ottimistico locale
      storeRemoveFromCart(itemId);
      publishCartSnapshot(useStore.getState().cart);
      // Backend: remove
      await axios.delete(`${BACKEND_URL}/api/cart/items/${itemId}`, {
        headers: getSessionHeaders()
      });
      // Sync forte dal server
      await syncCartFromServer();
      
      return true;
    } catch (err) {
      setError(err.message || 'Errore rimozione dal carrello');
      console.error('Remove from cart error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [storeRemoveFromCart]);
  
  // Remove last item (for voice commands)
  const removeLastItem = useCallback(async () => {
    if (cart.length === 0) {
      setError('Il carrello è vuoto');
      return false;
    }
    
    const lastItem = cart[cart.length - 1];
    return removeFromCart(lastItem.id);
  }, [cart, removeFromCart]);
  
  // Remove items by category (for voice commands)
  const removeByCategory = useCallback(async (category) => {
    try {
      setLoading(true);
      setError(null);
      
      const itemsToRemove = cart.filter(
        item => item.product.category.toLowerCase() === category.toLowerCase()
      );
      
      if (itemsToRemove.length === 0) {
        setError(`Nessun prodotto della categoria ${category} nel carrello`);
        return false;
      }
      
      // Remove each item
      for (const item of itemsToRemove) {
        storeRemoveFromCart(item.id);
      }
      publishCartSnapshot(useStore.getState().cart);
      
      // Sync with backend
      await axios.post(`${BACKEND_URL}/api/cart/remove-category`, {
        category
      });
      
      return true;
    } catch (err) {
      setError(err.message || 'Errore rimozione categoria');
      return false;
    } finally {
      setLoading(false);
    }
  }, [cart, storeRemoveFromCart]);
  
  // Update item quantity
  const updateQuantity = useCallback(async (itemId, quantity) => {
    if (quantity < 1 || quantity > 10) {
      setError('Quantità deve essere tra 1 e 10');
      return false;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Ottimistico locale
      storeUpdateQuantity(itemId, quantity);
      publishCartSnapshot(useStore.getState().cart);
      // Backend: update qty
      await axios.put(
        `${BACKEND_URL}/api/cart/items/${itemId}`,
        {
          quantity
        },
        {
          headers: getSessionHeaders()
        }
      );
      // Sync forte dal server
      await syncCartFromServer();
      
      return true;
    } catch (err) {
      setError(err.message || 'Errore aggiornamento quantità');
      return false;
    } finally {
      setLoading(false);
    }
  }, [storeUpdateQuantity]);
  
  // Increase quantity by amount
  const increaseQuantity = useCallback(async (itemId, amount = 1) => {
    const item = cart.find(i => i.id === itemId);
    if (!item) {
      setError('Prodotto non trovato nel carrello');
      return false;
    }
    
    const newQuantity = item.quantity + amount;
    return updateQuantity(itemId, newQuantity);
  }, [cart, updateQuantity]);
  
  // Decrease quantity by amount
  const decreaseQuantity = useCallback(async (itemId, amount = 1) => {
    const item = cart.find(i => i.id === itemId);
    if (!item) {
      setError('Prodotto non trovato nel carrello');
      return false;
    }
    
    const newQuantity = item.quantity - amount;
    if (newQuantity <= 0) {
      return removeFromCart(itemId);
    }
    
    return updateQuantity(itemId, newQuantity);
  }, [cart, updateQuantity, removeFromCart]);
  
  // Clear entire cart
  const clearCart = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Clear locale per reattività
      storeClearCart();
      publishCartSnapshot(useStore.getState().cart);
      // Backend: clear
      await axios.post(
        `${BACKEND_URL}/api/cart/clear`,
        {},
        { headers: getSessionHeaders() }
      );
      // Sync forte dal server (dovrebbe risultare vuoto)
      await syncCartFromServer();
      
      return true;
    } catch (err) {
      setError(err.message || 'Errore svuotamento carrello');
      return false;
    } finally {
      setLoading(false);
    }
  }, [storeClearCart]);
  
  // Get cart summary
  const getCartSummary = useCallback(() => {
    const subtotal = cartTotal;
    const shippingCost = shipping;
    const total = subtotal + shippingCost;
    
    return {
      items: cart,
      itemCount: cartCount,
      subtotal,
      shipping: shippingCost,
      total
    };
  }, [cart, cartCount, cartTotal, shipping]);
  
  // Check if product is in cart
  const isInCart = useCallback((productId, size = null, color = null) => {
    return cart.some(item => {
      const matchesProduct = item.product.id === productId;
      const matchesSize = !size || item.size === size;
      const matchesColor = !color || item.color === color;
      return matchesProduct && matchesSize && matchesColor;
    });
  }, [cart]);
  
  // Get item quantity in cart
  const getItemQuantity = useCallback((productId, size = null, color = null) => {
    const item = cart.find(item => {
      const matchesProduct = item.product.id === productId;
      const matchesSize = !size || item.size === size;
      const matchesColor = !color || item.color === color;
      return matchesProduct && matchesSize && matchesColor;
    });
    
    return item ? item.quantity : 0;
  }, [cart]);
  
  // Sync cart with backend on mount
  useEffect(() => {
    const syncCart = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/cart`);
        const setCartFromServer = useStore.getState().setCartFromServer;
        if (typeof setCartFromServer === 'function') {
          setCartFromServer(response.data);
        }
      } catch (err) {
        console.error('Failed to sync cart:', err);
      }
    };
    
    syncCart();
  }, []);
  
  return {
    // State
    cart,
    cartCount,
    cartTotal,
    shipping,
    grandTotal: cartTotal + shipping,
    loading,
    error,
    
    // Actions
    addToCart,
    removeFromCart,
    removeLastItem,
    removeByCategory,
    updateQuantity,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
    
    // Utilities
    getCartSummary,
    isInCart,
    getItemQuantity
  };
};