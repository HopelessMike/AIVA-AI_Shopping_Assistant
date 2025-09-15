# AIVA Backend - Fashion E-commerce Voice Assistant API (Italian)

## 🚀 Quick Start

### Prerequisites
- Python 3.9 or higher
- pip (Python package manager)
- OpenAI API key (optional, for full AI capabilities)

### Installation

1. **Clone the repository** (or create a new directory)
```bash
mkdir aiva-backend
cd aiva-backend
```

2. **Create a virtual environment** (recommended)
```bash
python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Configure environment variables**
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your OpenAI API key (optional)
# nano .env  # or use your preferred editor
```

5. **Run the server**
```bash
python run.py
```

The server will start at `http://localhost:8000`

### Testing

Run the test suite to verify everything is working:

```bash
python test_api.py
```

## 📋 API Documentation

Once the server is running, you can access:
- Interactive API docs: http://localhost:8000/api/docs
- Alternative docs: http://localhost:8000/api/redoc

## 🛍️ Features

### Italian Fashion E-commerce
- **30+ Fashion Products**: Complete catalog with clothing for men/women
- **Italian Language Support**: AI assistant responds in Italian
- **Smart Search**: Understands Italian synonyms (maglia→t-shirt, felpa→hoodie)
- **Variant Management**: Size and color selection for each product
- **Real-time Availability**: Stock checking for each variant
- **Smart Recommendations**: Outfit suggestions and complementary items
- **Promotions**: Discount percentages and sale items highlighted

### WebSocket Messaging (single-shot TTS)
- **Real-time control** via WebSocket. Le risposte testuali sono inviate come singola `response` seguita da `complete` (niente `text_chunk`).
- **Low Latency**: Messaggi funzione `function_start`/`function_complete` permettono feedback immediato.
- **Session Management**: Preferenze utente e contesto pagina inviati dal frontend.

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for AI processing | None (uses fallback) |
| `OPENAI_MODEL` | Model to use | `gpt-4-turbo-preview` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:5173,http://localhost:3000` |
| `MAX_REQUESTS_PER_MINUTE` | General rate limit | `60` |
| `MAX_AI_REQUESTS_PER_MINUTE` | AI endpoint rate limit | `10` |
| `PORT` | Server port | `8000` |
| `HOST` | Server host | `0.0.0.0` |

### Running Without OpenAI

The backend can run without an OpenAI API key using fallback mode:
- Basic Italian intent detection works
- Limited natural language understanding
- All security features remain active
- Pre-defined response patterns in Italian

To use full AI capabilities with streaming, add your OpenAI API key to the `.env` file.

## 🛡️ Security Features

- **Prompt Injection Protection**: Multi-pattern detection in Italian and English
- **Rate Limiting**: Configurable limits per endpoint
- **Input Sanitization**: All inputs sanitized against XSS/SQL injection
- **CORS Protection**: Whitelisted origins only
- **Function Whitelisting**: Only predefined functions can be called
- **UUID Validation**: Strict validation of all IDs
- **Italian-specific Patterns**: Detects injection attempts in Italian

## 📁 Project Structure

```
aiva-backend/
├── app.py                 # Main FastAPI application with fashion catalog
├── ai_service.py         # OpenAI integration with Italian support
├── run.py               # Server startup script
├── test_api.py          # API test suite
├── requirements.txt     # Python dependencies
├── .env.example        # Environment variables template
├── .env               # Your environment variables (create this)
└── README.md          # This file
```

## 🔌 API Endpoints

### Core Endpoints
- `GET /` - Root endpoint
- `GET /health` - Health check

### WebSocket
- `WS /ws/{session_id}` - Messaggistica real-time (no speech chunks)

### Voice/AI Endpoints
- `POST /api/voice/process` - Elaborazione comandi vocali (Italiano)

### Product Endpoints
- `GET /api/products` - List products with advanced filtering
  - Query params: `q`, `category`, `gender`, `size`, `color`, `min_price`, `max_price`, `on_sale`
- `GET /api/products/{id}` - Get product details with variants
- `GET /api/products/{id}/availability` - Check variant availability
- `GET /api/recommendations` - Get smart recommendations

### Cart Endpoints
- `GET /api/cart` - Get cart with totals and shipping
- `POST /api/cart/items` - Add item with size/color
- `DELETE /api/cart/items/{id}` - Remove item
- `POST /api/cart/clear` - Clear cart

### Information Endpoints
- `GET /api/size-guide/{category}` - Italian size guide
- `GET /api/shipping-info` - Shipping costs and times
- `GET /api/promotions` - Current promotions

## 🎨 Product Catalog

### Categories (Italian-aware)
- **T-Shirt & Polo**: Basic, eleganti, sportive
- **Camicie**: Formali, casual, bluse
- **Maglioni**: Girocollo, dolcevita, cardigan
- **Felpe**: Hoodie, girocollo, zip
- **Giacche**: Bomber, piumini, blazer, cappotti
- **Pantaloni**: Jeans, chino, eleganti, palazzo
- **Shorts**: Bermuda, sportivi
- **Gonne**: Mini, midi, lunghe
- **Vestiti**: Casual, eleganti, sera
- **Scarpe**: Sneakers, stivali, sandali
- **Accessori**: Borse, cinture, cappelli, sciarpe

### Product Information
Each product includes:
- Multiple size variants (XS-XXL)
- Multiple color options with hex codes
- Original and discounted prices
- Detailed descriptions in Italian context
- Material composition
- Care instructions
- Seasonal information
- Style categorization

## 🗣️ Italian Voice Commands Examples

The AI understands natural Italian, including:

### Product Search
- "Cerco una felpa con cappuccio"
- "Mostrami le magliette in offerta"
- "Voglio vedere i jeans da uomo"
- "Hai delle scarpe eleganti?"

### Specific Requests
- "Vorrei quella felpa Nike in nero taglia L"
- "Aggiungi al carrello la camicia blu"
- "Quanto costa il piumino?"
- "È disponibile in rosso?"

### Navigation
- "Portami alle offerte"
- "Mostra il carrello"
- "Vai al checkout"
- "Torna alla home"

### Assistance
- "Che taglia dovrei prendere?"
- "Cosa mi consigli da abbinare?"
- "Quali sono le promozioni attive?"
- "Quanto costa la spedizione?"

## 🧪 Testing

The test suite includes:
- Product catalog validation (30+ items)
- Italian search term normalization
- Variant availability checking
- Cart operations with size/color
- WebSocket streaming tests
- Security injection tests (Italian + English)
- Price calculation with shipping

Run tests with:
```bash
python test_api.py
```

## 🚀 Performance Optimizations

### Search Optimization
- **In-memory search**: No database latency for 30-product catalog
- **Italian synonym mapping**: Automatic term normalization
- **Relevance scoring**: Products ranked by match quality
- **Category inference**: Understands related terms

### Runtime Notes
- **No text streaming**: Le descrizioni e i testi lunghi vengono aggregati server-side e inviati come `response` unica.
- **Function-first UX**: Navigazione/filtri inviati come `function_complete` per azioni istantanee lato UI.

## 🐛 Troubleshooting

### Server won't start
- Check Python version: `python --version` (needs 3.9+)
- Verify all dependencies: `pip install -r requirements.txt`
- Check port 8000 is available

### Italian responses not working
- Verify AI service is configured
- Check system prompt is loaded
- Fallback mode provides basic Italian responses

### OpenAI errors
- Verify API key in `.env`
- Check API key has credits
- Fallback mode activates automatically if key is missing

### WebSocket connection issues
- Ensure CORS origins include your frontend URL
- Check WebSocket support in your deployment environment
- Verify session_id is being passed

## 📝 Development Notes

### Adding New Products
Edit the `_load_fashion_catalog()` method in `app.py`. Ensure each product has:
- Italian descriptions
- Multiple variants (size/color)
- Appropriate tags for search
- Discount information if on sale

### Customizing AI Responses
Edit the Italian system prompt in `ai_service.py` to modify:
- Personality and tone
- Response length
- Recommendation style
- Security responses

### Extending Functionality
Add new endpoints in `app.py` following the FastAPI pattern.
Add corresponding functions in `ai_service.py` function definitions.

## 🚢 Production Deployment

For production deployment:

1. **Security**
   - Set `ENABLE_DOCS=false` in `.env`
   - Use strong API keys
   - Enable HTTPS only

2. **Performance**
   - Use production ASGI server (Gunicorn with Uvicorn workers)
   - Enable caching for product data
   - Consider CDN for static assets

3. **Scalability**
   - Implement Redis for session management
   - Use PostgreSQL for persistent data
   - Consider vector database for large catalogs

### Docker Deployment

Create a `Dockerfile`:
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t aiva-backend .
docker run -p 8000:8000 --env-file .env aiva-backend
```

### WebSocket Deployment Considerations
- Ensure your hosting supports WebSocket connections
- Configure load balancer for sticky sessions
- Set appropriate timeout values for long connections
- Monitor WebSocket connection health

## 📊 Metrics & Monitoring

Key metrics to track:
- Response time (target: <500ms for search)
- Streaming latency (target: <300ms to first chunk)
- Cart conversion rate
- Most searched terms (for catalog optimization)
- Failed function calls (for debugging)

## 🌍 Internationalization

While the system is optimized for Italian:
- Easy to extend to other languages
- Synonym mapping can be expanded
- System prompt can be multilingual
- Product descriptions can include multiple languages

## 📄 License

This project is part of Michele Miranda's portfolio demonstration.

## 🆘 Support

For issues or questions:
- Check API documentation at http://localhost:8000/api/docs
- Review test suite for usage examples
- Check logs for error details

---

**Version**: 2.0.0  
**Language**: Italian (Primary)  
**Catalog**: 30+ Fashion Products  
**Last Updated**: 2025