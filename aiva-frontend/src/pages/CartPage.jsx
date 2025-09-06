import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, Truck, ArrowRight } from 'lucide-react';

const CartItem = ({ item, onUpdateQuantity, onRemove }) => {
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = () => {
    setIsRemoving(true);
    setTimeout(() => {
      onRemove(item.id);
    }, 300);
  };

  return (
    <motion.div
      className={`bg-white rounded-lg shadow-sm p-4 border ${
        isRemoving ? 'opacity-50' : ''
      }`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden">
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">{item.name}</h3>
          <p className="text-sm text-gray-500 mb-2">{item.brand}</p>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>Taglia: {item.size}</span>
            <span>Colore: {item.color}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
            disabled={item.quantity <= 1}
            className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
          >
            <Minus size={16} />
          </button>
          <span className="w-8 text-center font-semibold">{item.quantity}</span>
          <button
            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
            disabled={item.quantity >= 10}
            className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
          >
            <Plus size={16} />
          </button>
        </div>
        
        <div className="text-right">
          <div className="font-semibold text-gray-900">
            €{(item.price * item.quantity).toFixed(2)}
          </div>
          {item.originalPrice && (
            <div className="text-sm text-gray-400 line-through">
              €{(item.originalPrice * item.quantity).toFixed(2)}
            </div>
          )}
        </div>
        
        <button
          onClick={handleRemove}
          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </motion.div>
  );
};

const CartPage = () => {
  const [cartItems, setCartItems] = useState([
    {
      id: 1,
      name: "T-Shirt Basic Cotone Bio",
      brand: "EcoWear",
      price: 19.90,
      originalPrice: 29.90,
      image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400",
      size: "M",
      color: "Bianco",
      quantity: 2
    },
    {
      id: 2,
      name: "Felpa con Cappuccio",
      brand: "Street Urban",
      price: 59.90,
      originalPrice: 79.90,
      image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400",
      size: "L",
      color: "Nero",
      quantity: 1
    }
  ]);

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = subtotal >= 100 ? 0 : 9.90;
  const total = subtotal + shipping;

  const updateQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) return;
    
    setCartItems(items =>
      items.map(item =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const removeItem = (itemId) => {
    setCartItems(items => items.filter(item => item.id !== itemId));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <motion.div
            className="text-center py-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-gray-400 mb-6">
              <ShoppingCart size={80} className="mx-auto" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Il tuo carrello è vuoto</h1>
            <p className="text-gray-600 mb-8">
              Aggiungi alcuni prodotti per iniziare lo shopping
            </p>
            <motion.button
              className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Inizia Shopping
            </motion.button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Carrello</h1>
          <p className="text-gray-600">
            {cartItems.length} {cartItems.length === 1 ? 'articolo' : 'articoli'} nel carrello
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <motion.div
              className="bg-white rounded-lg shadow-sm p-6 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">I tuoi articoli</h2>
                <button
                  onClick={clearCart}
                  className="text-red-500 hover:text-red-700 text-sm font-medium"
                >
                  Svuota carrello
                </button>
              </div>
              
              <AnimatePresence>
                <div className="space-y-4">
                  {cartItems.map((item) => (
                    <CartItem
                      key={item.id}
                      item={item}
                      onUpdateQuantity={updateQuantity}
                      onRemove={removeItem}
                    />
                  ))}
                </div>
              </AnimatePresence>
            </motion.div>

            {/* Shipping Info */}
            <motion.div
              className="bg-blue-50 rounded-lg p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <Truck className="text-blue-600" size={24} />
                <h3 className="font-semibold text-gray-900">Spedizione</h3>
              </div>
              <p className="text-gray-600 mb-2">
                {shipping === 0 
                  ? "🎉 Spedizione gratuita! Il tuo ordine supera i 100€"
                  : `Aggiungi €${(100 - subtotal).toFixed(2)} per la spedizione gratuita`
                }
              </p>
              <div className="text-sm text-gray-500">
                Consegna stimata: 3-5 giorni lavorativi
              </div>
            </motion.div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <motion.div
              className="bg-white rounded-lg shadow-sm p-6 sticky top-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Riepilogo ordine</h2>
              
              <div className="space-y-4 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotale</span>
                  <span className="font-semibold">€{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Spedizione</span>
                  <span className="font-semibold">
                    {shipping === 0 ? 'Gratuita' : `€${shipping.toFixed(2)}`}
                  </span>
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Totale</span>
                    <span>€{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <motion.button
                className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 mb-4 flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <CreditCard size={20} />
                Procedi al Checkout
                <ArrowRight size={20} />
              </motion.button>

              <div className="text-center">
                <p className="text-sm text-gray-500 mb-2">Pagamenti sicuri</p>
                <div className="flex justify-center gap-2">
                  <div className="w-8 h-5 bg-gray-200 rounded text-xs flex items-center justify-center">VISA</div>
                  <div className="w-8 h-5 bg-gray-200 rounded text-xs flex items-center justify-center">MC</div>
                  <div className="w-8 h-5 bg-gray-200 rounded text-xs flex items-center justify-center">PP</div>
                </div>
              </div>
            </motion.div>

            {/* Promo Code */}
            <motion.div
              className="bg-white rounded-lg shadow-sm p-6 mt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h3 className="font-semibold text-gray-900 mb-4">Codice promozionale</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Inserisci codice"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                  Applica
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
