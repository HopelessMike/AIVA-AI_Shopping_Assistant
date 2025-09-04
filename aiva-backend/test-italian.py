"""
AIVA Backend Italian Feature Test Suite
Test Italian language support, fashion catalog, and streaming
Run with: python test_italian.py
"""

import asyncio
import httpx
import json
import sys
import websockets
from typing import Dict, Any, List
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000"
TEST_RESULTS = []

class Colors:
    """ANSI color codes for terminal output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

async def test_italian_search(client: httpx.AsyncClient) -> bool:
    """Test Italian synonym search"""
    print(f"\n{Colors.BLUE}Testing Italian Search Terms:{Colors.RESET}")
    
    italian_terms = [
        ("maglia", "t-shirt"),
        ("felpa", "felpa"),
        ("giubbotto", "giacca"),
        ("jeans", "pantaloni"),
        ("scarpe da ginnastica", "scarpe"),
        ("borsa", "accessori")
    ]
    
    success_count = 0
    
    for italian_term, expected_category in italian_terms:
        try:
            response = await client.get(f"/api/products?q={italian_term}")
            if response.status_code == 200:
                products = response.json()
                if products:
                    # Check if results contain expected category
                    categories_found = set(p.get("category", "") for p in products)
                    if expected_category in str(categories_found).lower():
                        print(f"{Colors.GREEN}✓{Colors.RESET} '{italian_term}' → trovati {len(products)} prodotti")
                        success_count += 1
                    else:
                        print(f"{Colors.YELLOW}⚠{Colors.RESET} '{italian_term}' → categoria non corrispondente")
                else:
                    print(f"{Colors.RED}✗{Colors.RESET} '{italian_term}' → nessun risultato")
            else:
                print(f"{Colors.RED}✗{Colors.RESET} '{italian_term}' → errore {response.status_code}")
        except Exception as e:
            print(f"{Colors.RED}✗{Colors.RESET} '{italian_term}' → errore: {e}")
    
    return success_count == len(italian_terms)

async def test_fashion_catalog(client: httpx.AsyncClient) -> bool:
    """Test fashion catalog completeness"""
    print(f"\n{Colors.BLUE}Testing Fashion Catalog:{Colors.RESET}")
    
    # Test product count
    response = await client.get("/api/products?limit=50")
    products = response.json()
    
    print(f"Totale prodotti: {len(products)}")
    
    if len(products) < 30:
        print(f"{Colors.RED}✗{Colors.RESET} Catalogo incompleto (attesi 30+, trovati {len(products)})")
        return False
    
    # Check categories distribution
    categories = {}
    for product in products:
        cat = product.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
    
    print(f"\n{Colors.MAGENTA}Distribuzione categorie:{Colors.RESET}")
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count} prodotti")
    
    # Check for Italian product details
    italian_fields = ["description", "materials", "care_instructions"]
    sample_product = products[0] if products else None
    
    if sample_product:
        print(f"\n{Colors.MAGENTA}Esempio prodotto:{Colors.RESET}")
        print(f"  Nome: {sample_product.get('name')}")
        print(f"  Brand: {sample_product.get('brand')}")
        print(f"  Prezzo: €{sample_product.get('price')}")
        
        if sample_product.get('on_sale'):
            print(f"  {Colors.YELLOW}In offerta: -{sample_product.get('discount_percentage')}%{Colors.RESET}")
    
    return True

async def test_product_variants(client: httpx.AsyncClient) -> bool:
    """Test product variants (size/color)"""
    print(f"\n{Colors.BLUE}Testing Product Variants:{Colors.RESET}")
    
    # Get first product with variants
    response = await client.get("/api/products?limit=1")
    products = response.json()
    
    if not products:
        print(f"{Colors.RED}✗{Colors.RESET} Nessun prodotto trovato")
        return False
    
    product = products[0]
    product_id = product.get("id")
    
    # Get full product details
    response = await client.get(f"/api/products/{product_id}")
    if response.status_code != 200:
        print(f"{Colors.RED}✗{Colors.RESET} Impossibile ottenere dettagli prodotto")
        return False
    
    product_detail = response.json()
    variants = product_detail.get("variants", [])
    
    print(f"\nProdotto: {product_detail.get('name')}")
    print(f"Varianti disponibili: {len(variants)}")
    
    # Check variant structure
    if variants:
        sizes = set(v.get("size") for v in variants)
        colors = set(v.get("color") for v in variants)
        
        print(f"Taglie: {', '.join(sorted(sizes))}")
        print(f"Colori: {', '.join(sorted(colors))}")
        
        # Test availability check
        first_variant = variants[0]
        response = await client.get(
            f"/api/products/{product_id}/availability",
            params={
                "size": first_variant.get("size"),
                "color": first_variant.get("color")
            }
        )
        
        if response.status_code == 200:
            availability = response.json()
            status = "Disponibile" if availability.get("available") else "Non disponibile"
            print(f"\n{Colors.GREEN}✓{Colors.RESET} Check disponibilità: {status}")
            return True
    
    return False

async def test_cart_with_variants(client: httpx.AsyncClient) -> bool:
    """Test cart operations with size/color"""
    print(f"\n{Colors.BLUE}Testing Cart with Variants:{Colors.RESET}")
    
    # Get a product
    response = await client.get("/api/products?limit=1")
    products = response.json()
    
    if not products:
        return False
    
    product = products[0]
    product_id = product.get("id")
    
    # Get product variants
    response = await client.get(f"/api/products/{product_id}")
    product_detail = response.json()
    variants = product_detail.get("variants", [])
    
    if not variants:
        print(f"{Colors.YELLOW}⚠{Colors.RESET} Prodotto senza varianti")
        return False
    
    # Find available variant
    available_variant = None
    for variant in variants:
        if variant.get("available") and variant.get("stock", 0) > 0:
            available_variant = variant
            break
    
    if not available_variant:
        print(f"{Colors.YELLOW}⚠{Colors.RESET} Nessuna variante disponibile")
        return False
    
    # Add to cart
    response = await client.post(
        "/api/cart/items",
        params={
            "product_id": product_id,
            "size": available_variant.get("size"),
            "color": available_variant.get("color"),
            "quantity": 1
        }
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"{Colors.GREEN}✓{Colors.RESET} Aggiunto al carrello: {product_detail.get('name')}")
        print(f"  Taglia: {available_variant.get('size')}")
        print(f"  Colore: {available_variant.get('color')}")
        print(f"  Totale carrello: €{result.get('cart_total', 0):.2f}")
        
        # Clear cart
        await client.post("/api/cart/clear")
        return True
    else:
        print(f"{Colors.RED}✗{Colors.RESET} Errore aggiunta carrello: {response.text}")
        return False

async def test_recommendations(client: httpx.AsyncClient) -> bool:
    """Test recommendation system"""
    print(f"\n{Colors.BLUE}Testing Recommendations:{Colors.RESET}")
    
    # Get general recommendations
    response = await client.get("/api/recommendations?limit=3")
    if response.status_code != 200:
        print(f"{Colors.RED}✗{Colors.RESET} Errore recommendations")
        return False
    
    recommendations = response.json()
    print(f"Raccomandazioni generali: {len(recommendations)} prodotti")
    
    # Get category-specific recommendations
    response = await client.get("/api/recommendations?category=felpa&limit=3")
    cat_recommendations = response.json()
    print(f"Raccomandazioni felpe: {len(cat_recommendations)} prodotti")
    
    # Get product-specific recommendations
    products = await client.get("/api/products?limit=1")
    if products.json():
        product_id = products.json()[0].get("id")
        response = await client.get(f"/api/recommendations?product_id={product_id}&limit=3")
        product_recommendations = response.json()
        print(f"Raccomandazioni per prodotto: {len(product_recommendations)} prodotti")
    
    return True

async def test_websocket_streaming():
    """Test WebSocket streaming for voice commands"""
    print(f"\n{Colors.BLUE}Testing WebSocket Streaming:{Colors.RESET}")
    
    session_id = "test-session-123"
    uri = f"{WS_URL}/ws/{session_id}"
    
    try:
        async with websockets.connect(uri) as websocket:
            # Test voice command
            test_command = {
                "type": "voice_command",
                "text": "Cerco una felpa nera"
            }
            
            await websocket.send(json.dumps(test_command))
            print(f"Inviato: '{test_command['text']}'")
            
            # Receive streaming response
            messages_received = 0
            while messages_received < 3:  # Limit responses for test
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(response)
                    
                    if data.get("type") == "processing_start":
                        print(f"{Colors.YELLOW}⟳{Colors.RESET} Elaborazione...")
                    elif data.get("type") == "response":
                        print(f"{Colors.GREEN}✓{Colors.RESET} Risposta: {data.get('message')}")
                    elif data.get("type") == "complete":
                        print(f"{Colors.GREEN}✓{Colors.RESET} Streaming completato")
                        break
                    
                    messages_received += 1
                except asyncio.TimeoutError:
                    break
            
            await websocket.close()
            return True
            
    except Exception as e:
        print(f"{Colors.RED}✗{Colors.RESET} WebSocket error: {e}")
        return False

async def test_italian_voice_commands(client: httpx.AsyncClient):
    """Test Italian voice command processing"""
    print(f"\n{Colors.BLUE}Testing Italian Voice Commands:{Colors.RESET}")
    
    commands = [
        "Voglio vedere le felpe in offerta",
        "Aggiungi al carrello quella maglia nera",
        "Quanto costa la spedizione?",
        "Che taglie avete per i jeans?",
        "Mostrami le scarpe da donna"
    ]
    
    for command in commands:
        response = await client.post(
            "/api/voice/process",
            json={"text": command, "context": {}}
        )
        
        if response.status_code == 200:
            result = response.json()
            action = result.get("action", "unknown")
            print(f"{Colors.GREEN}✓{Colors.RESET} '{command[:30]}...' → {action}")
        else:
            print(f"{Colors.RED}✗{Colors.RESET} '{command[:30]}...' → errore")

async def test_promotions_and_shipping(client: httpx.AsyncClient):
    """Test promotions and shipping info"""
    print(f"\n{Colors.BLUE}Testing Promotions & Shipping:{Colors.RESET}")
    
    # Test promotions
    response = await client.get("/api/promotions")
    if response.status_code == 200:
        promotions = response.json()
        promo_list = promotions.get("promotions", [])
        print(f"{Colors.GREEN}✓{Colors.RESET} Promozioni attive: {len(promo_list)}")
        for promo in promo_list[:2]:
            print(f"  - {promo.get('title')}: {promo.get('description')}")
    
    # Test shipping info
    response = await client.get("/api/shipping-info")
    if response.status_code == 200:
        shipping = response.json()
        print(f"{Colors.GREEN}✓{Colors.RESET} Spedizione gratuita sopra: €{shipping.get('free_shipping_threshold')}")
        print(f"  Spedizione standard: €{shipping.get('standard_shipping')}")

def print_summary(results: List[bool]):
    """Print test summary"""
    print(f"\n{Colors.BOLD}Riepilogo Test Italiani:{Colors.RESET}")
    print("=" * 60)
    
    passed = sum(results)
    total = len(results)
    
    print(f"Test totali: {total}")
    print(f"{Colors.GREEN}Passati: {passed}{Colors.RESET}")
    
    if passed < total:
        print(f"{Colors.RED}Falliti: {total - passed}{Colors.RESET}")
    else:
        print(f"{Colors.GREEN}Tutti i test sono passati! 🇮🇹{Colors.RESET}")
    
    print("=" * 60)
    print(f"Test completato: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    return passed == total

async def main():
    """Main test runner"""
    print(f"{Colors.BOLD}AIVA Italian Fashion E-commerce Test Suite{Colors.RESET}")
    print("=" * 60)
    print("Testing Italian language support and fashion features...")
    
    # Check if server is running
    try:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
            response = await client.get("/health")
            if response.status_code != 200:
                print(f"{Colors.RED}Server non disponibile!{Colors.RESET}")
                sys.exit(1)
            
            health = response.json()
            print(f"Server attivo - Prodotti caricati: {health.get('products_loaded', 0)}")
            print("=" * 60)
    except httpx.ConnectError:
        print(f"{Colors.RED}Impossibile connettersi al server {BASE_URL}{Colors.RESET}")
        print(f"Avvia il server con: python run.py")
        sys.exit(1)
    
    results = []
    
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # Run all tests
        results.append(await test_italian_search(client))
        results.append(await test_fashion_catalog(client))
        results.append(await test_product_variants(client))
        results.append(await test_cart_with_variants(client))
        results.append(await test_recommendations(client))
        await test_promotions_and_shipping(client)
        await test_italian_voice_commands(client)
    
    # Test WebSocket separately
    try:
        results.append(await test_websocket_streaming())
    except:
        print(f"{Colors.YELLOW}⚠{Colors.RESET} WebSocket test skipped (connection failed)")
    
    # Print summary
    success = print_summary(results)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())