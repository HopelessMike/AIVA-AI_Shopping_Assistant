// src/hooks/useCart.js - Cart Management Hook
import { useState, useCallback, useEffect } from 'react';
import useStore from '../store';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

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
  
  // Add item to cart with variant selection
  const addToCart = useCallback(async (product, size, color, quantity = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      // Check availability with backend
      const response = await axios.get(
        `${BACKEND_URL}/api/products/${product.id}/availability`,
        {
          params: { size, color }
        }
      );
      
      if (!response.data.available) {
        throw new Error('Variante non disponibile');
      }
      
      // Add to local store
      storeAddToCart(product, size, color, quantity);
      
      // Sync with backend
      await axios.post(`${BACKEND_URL}/api/cart/items`, {
        product_id: product.id,
        size,
        color,
        quantity
      });
      
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
      
      // Remove from local store
      storeRemoveFromCart(itemId);
      
      // Sync with backend
      await axios.delete(`${BACKEND_URL}/api/cart/items/${itemId}`);
      
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
      
      // Update local store
      storeUpdateQuantity(itemId, quantity);
      
      // Sync with backend
      await axios.put(`${BACKEND_URL}/api/cart/items/${itemId}`, {
        quantity
      });
      
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
      
      // Clear local store
      storeClearCart();
      
      // Sync with backend
      await axios.post(`${BACKEND_URL}/api/cart/clear`);
      
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
        // You could sync the backend cart with local store here if needed
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