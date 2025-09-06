// src/hooks/useFavorites.js - Favorites Management Hook
import { useState, useEffect, useCallback } from 'react';
import useStore from '../store';

export const useFavorites = () => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const savedFavorites = localStorage.getItem('aiva-favorites');
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (error) {
        console.error('Error loading favorites:', error);
        setFavorites([]);
      }
    }
  }, []);

  // Save favorites to localStorage whenever favorites change
  useEffect(() => {
    localStorage.setItem('aiva-favorites', JSON.stringify(favorites));
  }, [favorites]);

  // Add product to favorites
  const addToFavorites = useCallback((product) => {
    setFavorites(prev => {
      const isAlreadyFavorite = prev.some(fav => fav.id === product.id);
      if (isAlreadyFavorite) {
        return prev; // Already in favorites
      }
      return [...prev, product];
    });
  }, []);

  // Remove product from favorites
  const removeFromFavorites = useCallback((productId) => {
    setFavorites(prev => prev.filter(fav => fav.id !== productId));
  }, []);

  // Toggle favorite status
  const toggleFavorite = useCallback((product) => {
    const isFavorite = favorites.some(fav => fav.id === product.id);
    if (isFavorite) {
      removeFromFavorites(product.id);
    } else {
      addToFavorites(product);
    }
  }, [favorites, addToFavorites, removeFromFavorites]);

  // Check if product is favorite
  const isFavorite = useCallback((productId) => {
    return favorites.some(fav => fav.id === productId);
  }, [favorites]);

  // Clear all favorites
  const clearFavorites = useCallback(() => {
    setFavorites([]);
  }, []);

  // Get favorites count
  const favoritesCount = favorites.length;

  return {
    favorites,
    favoritesCount,
    addToFavorites,
    removeFromFavorites,
    toggleFavorite,
    isFavorite,
    clearFavorites,
    loading
  };
};
