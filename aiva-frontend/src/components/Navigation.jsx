import React from 'react';
import './Cart.css';

const Cart = ({ cartItems, onUpdateQuantity, onRemoveItem, onClearCart, onCheckout }) => {
  const calculateTotal = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  if (cartItems.length === 0) {
    return (
      <div className="cart empty-cart">
        <div className="empty-cart-icon">🛒</div>
        <h2>Your cart is empty</h2>
        <p>Start shopping to add items to your cart!</p>
      </div>
    );
  }

  return (
    <div className="cart">
      <div className="cart-header">
        <h2>Shopping Cart</h2>
        <span className="cart-count">{getTotalItems()} items</span>
      </div>

      <div className="cart-items">
        {cartItems.map((item) => (
          <div key={item.id} className="cart-item">
            <div className="cart-item-image">
              {item.image ? (
                <img src={item.image} alt={item.name} />
              ) : (
                <div className="cart-item-placeholder">📦</div>
              )}
            </div>
            
            <div className="cart-item-details">
              <h3>{item.name}</h3>
              <p className="cart-item-category">{item.category}</p>
              <p className="cart-item-price">€{item.price.toFixed(2)}</p>
            </div>
            
            <div className="cart-item-quantity">
              <button 
                className="quantity-btn"
                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
              >
                −
              </button>
              <span className="quantity-value">{item.quantity}</span>
              <button 
                className="quantity-btn"
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              >
                +
              </button>
            </div>
            
            <div className="cart-item-total">
              €{(item.price * item.quantity).toFixed(2)}
            </div>
            
            <button 
              className="remove-item-btn"
              onClick={() => onRemoveItem(item.id)}
              title="Remove item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Subtotal:</span>
          <span>€{calculateTotal().toFixed(2)}</span>
        </div>
        <div className="cart-summary-row">
          <span>Shipping:</span>
          <span>Free</span>
        </div>
        <div className="cart-summary-row cart-total">
          <span>Total:</span>
          <span>€{calculateTotal().toFixed(2)}</span>
        </div>
      </div>

      <div className="cart-actions">
        <button 
          className="clear-cart-btn"
          onClick={onClearCart}
        >
          Clear Cart
        </button>
        <button 
          className="checkout-btn"
          onClick={onCheckout}
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
};

export default Cart;