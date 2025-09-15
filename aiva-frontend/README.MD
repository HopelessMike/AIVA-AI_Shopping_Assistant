# AIVA Fashion Frontend - Voice-Enabled E-commerce Platform

## 🎨 Overview

Modern, responsive React frontend for AIVA Fashion - an AI-powered voice shopping assistant that allows users to browse and purchase clothing using natural Italian voice commands.

## ✨ Features

### Voice Shopping Experience
- 🎤 **Voice Assistant Button**: Animated, interactive button for initiating voice commands
- 🗣️ **Italian Language Support**: Natural language processing in Italian
- 🔊 **Text-to-Speech**: AI responses spoken back to the user
- 📊 **Voice Visualizer**: Real-time audio level visualization
- 💬 **Chat Interface**: Visual conversation history with AI

### E-commerce Features
- 🛍️ **Product Catalog**: 30+ fashion items with variants
- 🎯 **Smart Search**: Voice-activated product search
- 🛒 **Shopping Cart**: Add items with size/color selection
- 💳 **Checkout Flow**: Complete purchase process
- ⭐ **Product Reviews**: Ratings and reviews display
- 🏷️ **Promotions**: Discount badges and sale prices

### UI/UX Excellence
- 📱 **Fully Responsive**: Adapts to all screen sizes
- ✨ **Smooth Animations**: Framer Motion powered transitions
- 🎨 **Modern Design**: Clean, minimalist aesthetic
- 🌈 **Gradient Effects**: Eye-catching visual elements
- 🔄 **Loading States**: Skeleton screens and spinners
- 🍞 **Toast Notifications**: User feedback system

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Chrome/Edge browser (for voice features)
- Backend server running on port 8000

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd aiva-frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start development server
npm run dev
```

The app will open at `http://localhost:5173`

## 🛠️ Tech Stack

### Core
- **React 18** - UI framework
- **Vite** - Build tool & dev server
- **React Router** - Navigation

### Styling & Animation
- **Tailwind CSS** - Utility-first CSS
- **Framer Motion** - Animation library
- **Lucide Icons** - Icon set

### Voice Features
- **Web Speech API (ASR/TTS)** - Riconoscimento e sintesi nativi
- **TTS Queue + Barge‑in** - Coda di frasi con chaining e interruzione RMS
- **WebSocket** - Messaggi strutturati (response/complete, function_*). Nessun text_chunk lato UI

### State & Data
- **Zustand** - State management
- **Axios** - HTTP client
- **React Hot Toast** - Notifications

## 📂 Project Structure

```
aiva-frontend/
├── src/
│   ├── components/
│   │   ├── VoiceAssistant.jsx    # Voice assistant component
│   │   ├── ProductCard.jsx       # Product display
│   │   ├── Cart.jsx              # Shopping cart
│   │   ├── Navigation.jsx        # Header/nav
│   │   └── ...
│   ├── pages/
│   │   ├── Home.jsx              # Landing page
│   │   ├── Products.jsx          # Product listing
│   │   ├── ProductDetail.jsx     # Single product
│   │   └── Checkout.jsx          # Checkout flow
│   ├── hooks/
│   │   ├── useWebSocket.js       # WebSocket connection
│   │   ├── useVoice.js           # Voice recognition
│   │   └── useCart.js            # Cart management
│   ├── services/
│   │   ├── api.js                # Backend API calls
│   │   └── voice.js              # Voice processing
│   ├── store/
│   │   └── index.js              # Zustand store
│   ├── App.jsx                   # Main app component
│   ├── main.jsx                  # Entry point
│   └── index.css                 # Global styles
├── public/                        # Static assets
├── vite.config.js                # Vite configuration
├── tailwind.config.js            # Tailwind configuration
├── package.json                  # Dependencies
└── README.md                     # This file
```

## 🎤 Voice Commands Examples

### Italian Commands Supported:
- "Cerco una felpa nera" - Search for black hoodie
- "Mostrami le scarpe da donna" - Show women's shoes  
- "Aggiungi al carrello" - Add to cart
- "Vai al carrello" - Go to cart
- "Quanto costa?" - How much does it cost?
- "Quali taglie avete?" - What sizes do you have?
- "Mostra le offerte" - Show deals
- "Voglio fare il checkout" - Proceed to checkout

## 🎨 Component Architecture

### Hook `useVoiceAssistantNative`
```jsx
// Gestisce ASR, TTS, WS, intent locali, barge‑in e turni
const assistant = useVoiceAssistantNative();
```

### Key Props:
- `onProductSearch`: Callback for product searches
- `onNavigate`: Navigation handler
- `onAddToCart`: Cart addition handler
- `onShowProduct`: Product detail view handler

## 🔧 Configuration

### Environment Variables
```env
VITE_BACKEND_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

### Tailwind Customization
The design system includes:
- Custom color palette (blue-purple gradients)
- Animation utilities
- Glass morphism effects
- Custom shadows and transitions

## 🌐 Browser Support

### Full Support
- Chrome 90+ ✅
- Edge 90+ ✅
- Safari 15+ ✅ (limited voice features)

### Partial Support
- Firefox 90+ ⚠️ (no voice recognition)
- Mobile browsers ⚠️ (varies by device)

### Voice Features Require:
- Microphone permissions
- HTTPS connection (production)
- Chrome or Edge browser

## 📱 Responsive Breakpoints

- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

## ⚡ Performance Optimizations

### Implemented:
- Code splitting with dynamic imports
- Image lazy loading
- Debounced search
- Memoized components
- Virtual scrolling for large lists
- WebSocket connection pooling

### Bundle Size:
- Initial: ~250KB gzipped
- Lazy loaded: ~150KB gzipped

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# E2E tests
npm run test:e2e
```

## 🚀 Deployment

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Deploy to Vercel
```bash
vercel deploy
```

### Deploy to Netlify
```bash
netlify deploy --prod
```

## 🔒 Security & Stability

- Content Security Policy
- XSS protection
- HTTPS enforcement (production)
- Secure WebSocket connections
- Input sanitization
- Rate limiting aware
- Single WS connection per tab (HMR safe)
- Drop di messaggi WS “stale” dopo barge‑in

## 🐛 Troubleshooting

### Voice Not Working
1. Check browser compatibility (use Chrome/Edge)
2. Allow microphone permissions
3. Ensure HTTPS in production
4. Check console for errors

### WebSocket Connection Failed
1. Verify backend is running
2. Check CORS settings
3. Confirm WebSocket URL
4. Review network tab

### Styling Issues
1. Clear browser cache
2. Rebuild CSS: `npm run build:css`
3. Check Tailwind config

## 📚 Resources

- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Framer Motion](https://www.framer.com/motion)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)

## 👨‍💻 Development

### Code Style
- ESLint for linting
- Prettier for formatting
- Husky for pre-commit hooks

### Git Workflow
```bash
git checkout -b feature/your-feature
git commit -m "feat: add new feature"
git push origin feature/your-feature
```

## 📄 License

This project is part of Michele Miranda's portfolio demonstration.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

**Built with ❤️ for Michele Miranda's Portfolio**  
**Showcasing Voice AI + E-commerce Integration**