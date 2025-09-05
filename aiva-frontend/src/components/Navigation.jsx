import React, { useState } from 'react';
import './Navigation.css';

const Navigation = ({ currentPage, onNavigate, cartItemsCount, isListening, onVoiceToggle }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationItems = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'products', label: 'Prodotti', icon: '📦' },
    { id: 'offers', label: 'Offerte', icon: '🏷️' },
    { id: 'cart', label: 'Carrello', icon: '🛒', badge: cartItemsCount }
  ];

  const handleNavigation = (pageId) => {
    onNavigate(pageId);
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="navigation">
      <div className="nav-container">
        <div className="nav-brand">
          <span className="brand-icon">🛍️</span>
          <span className="brand-text">AIVA Fashion</span>
        </div>

        <button 
          className="mobile-menu-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          ☰
        </button>

        <ul className={`nav-menu ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          {navigationItems.map((item) => (
            <li key={item.id}>
              <button
                className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => handleNavigation(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.badge > 0 && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="nav-actions">
          <button 
            className={`voice-toggle ${isListening ? 'listening' : ''}`}
            onClick={onVoiceToggle}
            title={isListening ? 'Stop listening' : 'Attiva assistente vocale'}
          >
            {isListening ? '🎙️' : '🎤'}
          </button>
          
          <div className="search-container">
            <input 
              type="text" 
              placeholder="Dì 'Hey AIVA' per cercare..."
              className="nav-search"
              readOnly
            />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;