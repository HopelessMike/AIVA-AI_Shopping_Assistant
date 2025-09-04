import React from 'react';
import './ProductCard.css';

const ProductCard = ({ product, onAddToCart, isInCart }) => {
  const handleAddToCart = () => {
    onAddToCart(product);
  };

  return (
    <div className="product-card">
      <div className="product-image-container">
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.name}
            className="product-image"
            onError={(e) => {
              e.target.src = '/api/placeholder-image';
              e.target.onerror = null;
            }}
          />
        ) : (
          <div className="product-image-placeholder">
            <span>📦</span>
          </div>
        )}
        {product.discount > 0 && (
          <span className="product-discount-badge">-{product.discount}%</span>
        )}
      </div>
      
      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-description">{product.description}</p>
        
        <div className="product-details">
          <span className="product-category">{product.category}</span>
          {product.inStock ? (
            <span className="product-stock in-stock">✓ In Stock</span>
          ) : (
            <span className="product-stock out-of-stock">Out of Stock</span>
          )}
        </div>
        
        <div className="product-pricing">
          <span className="product-price">€{product.price.toFixed(2)}</span>
          {product.discount > 0 && (
            <span className="product-original-price">
              €{(product.price / (1 - product.discount / 100)).toFixed(2)}
            </span>
          )}
        </div>
        
        <button 
          className={`add-to-cart-btn ${isInCart ? 'in-cart' : ''} ${!product.inStock ? 'disabled' : ''}`}
          onClick={handleAddToCart}
          disabled={!product.inStock}
        >
          {!product.inStock ? 'Out of Stock' : isInCart ? 'Add More' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;