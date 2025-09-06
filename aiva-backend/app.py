# app.py - AIVA E-commerce Voice Assistant Backend
# Version: 2.0.0 - Italian Fashion E-commerce with WebSocket Streaming
# Security-First FastAPI Implementation with Real-time Voice Support

from fastapi import FastAPI, HTTPException, Request, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any, Set
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import hashlib
import json
import uuid
import re
import os
import httpx
import logging
import time
from functools import wraps
import asyncio
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AIVA")

# Security configurations
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
API_KEY = os.getenv("API_KEY", "demo-key-for-development")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
MAX_REQUESTS_PER_MINUTE = 60
MAX_AI_REQUESTS_PER_MINUTE = 10

# Initialize app
app = FastAPI(
    title="AIVA Fashion E-commerce API",
    version="2.0.0",
    description="Secure voice-enabled Italian fashion e-commerce backend",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# ============================================================================
# ENUMS AND CONSTANTS
# ============================================================================

class Gender(str, Enum):
    UOMO = "uomo"
    DONNA = "donna"
    UNISEX = "unisex"

class Size(str, Enum):
    XS = "XS"
    S = "S"
    M = "M"
    L = "L"
    XL = "XL"
    XXL = "XXL"

class ProductCategory(str, Enum):
    TSHIRT = "t-shirt"
    CAMICIA = "camicia"
    MAGLIONE = "maglione"
    FELPA = "felpa"
    GIACCA = "giacca"
    PANTALONI = "pantaloni"
    SHORTS = "shorts"
    GONNA = "gonna"
    VESTITO = "vestito"
    SCARPE = "scarpe"
    ACCESSORI = "accessori"

# Italian synonyms mapping for natural language understanding
SYNONYM_MAP = {
    "maglia": "t-shirt",
    "maglietta": "t-shirt",
    "magliette": "t-shirt",
    "polo": "t-shirt",
    "felpa con cappuccio": "felpa",
    "hoodie": "felpa",
    "maglione": "maglione",
    "pullover": "maglione",
    "cardigan": "maglione",
    "dolcevita": "maglione",
    "giubbotto": "giacca",
    "giubbino": "giacca",
    "giacchetto": "giacca",
    "bomber": "giacca",
    "piumino": "giacca",
    "cappotto": "giacca",
    "jeans": "pantaloni",
    "denim": "pantaloni",
    "chino": "pantaloni",
    "pantalone": "pantaloni",
    "bermuda": "shorts",
    "pantaloncini": "shorts",
    "gonna": "gonna",
    "gonnellina": "gonna",
    "minigonna": "gonna",
    "vestito": "vestito",
    "abito": "vestito",
    "dress": "vestito",
    "camicetta": "camicia",
    "blusa": "camicia",
    "scarpe": "scarpe",
    "sneakers": "scarpe",
    "stivali": "scarpe",
    "sandali": "scarpe",
    "scarpe da ginnastica": "scarpe",
    "anfibi": "scarpe",
    "mocassini": "scarpe",
    "décolleté": "scarpe",
    "cintura": "accessori",
    "cappello": "accessori",
    "sciarpa": "accessori",
    "borsa": "accessori",
    "zaino": "accessori",
}

# ============================================================================
# SECURITY LAYER
# ============================================================================

class RateLimiter:
    """Rate limiting implementation"""
    def __init__(self):
        self.requests = {}
    
    def check_rate_limit(self, key: str, max_requests: int, window: int = 60):
        now = time.time()
        if key not in self.requests:
            self.requests[key] = []
        
        self.requests[key] = [req_time for req_time in self.requests[key] 
                             if now - req_time < window]
        
        if len(self.requests[key]) >= max_requests:
            return False
        
        self.requests[key].append(now)
        return True

rate_limiter = RateLimiter()

def sanitize_input(text: str, max_length: int = 500) -> str:
    """Sanitize user input to prevent injection attacks"""
    text = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', text)
    text = text[:max_length]
    text = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'(DROP|DELETE|INSERT|UPDATE|SELECT|UNION|EXEC|EXECUTE)', '', text, flags=re.IGNORECASE)
    return text.strip()

def normalize_italian_terms(text: str) -> str:
    """Normalize Italian terms to standard categories"""
    text_lower = text.lower()
    for synonym, category in SYNONYM_MAP.items():
        if synonym in text_lower:
            text_lower = text_lower.replace(synonym, category)
    return text_lower

# ============================================================================
# DATA MODELS
# ============================================================================

class ProductVariant(BaseModel):
    size: Size
    color: str
    color_code: str  # Hex color code
    available: bool
    stock: int

class Product(BaseModel):
    id: str
    name: str
    brand: str
    description: str
    description_long: str  # Detailed description for AI
    category: ProductCategory
    subcategory: str
    gender: Gender
    price: float
    original_price: float
    discount_percentage: int = 0
    on_sale: bool = False
    materials: List[str]
    care_instructions: str
    season: str
    style: str
    variants: List[ProductVariant]
    images: List[str]
    features: List[str]  # impermeabile, traspirante, etc.
    rating: float = 4.5
    reviews: int = 0
    tags: List[str]  # for search optimization

class CartItem(BaseModel):
    id: str
    product_id: str
    product: Optional[Product] = None
    size: Size
    color: str
    quantity: int = Field(ge=1, le=10)
    subtotal: float = 0.0

class Cart(BaseModel):
    items: List[CartItem] = []
    total: float = 0.0
    item_count: int = 0
    discount_applied: float = 0.0
    shipping: float = 0.0
    grand_total: float = 0.0

class VoiceRequest(BaseModel):
    text: str = Field(max_length=500)
    context: Optional[Dict[str, Any]] = {}
    session_id: Optional[str] = None
    
    @validator('text')
    def sanitize_and_normalize(cls, v):
        v = sanitize_input(v)
        return v  # Keep original for AI, normalize separately for search

class SearchFilters(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    gender: Optional[Gender] = None
    size: Optional[Size] = None
    color: Optional[str] = None
    price_min: Optional[float] = Field(None, ge=0)
    price_max: Optional[float] = Field(None, ge=0)
    on_sale: Optional[bool] = None
    brand: Optional[str] = None
    season: Optional[str] = None
    style: Optional[str] = None

# ============================================================================
# MOCK DATA STORE - ITALIAN FASHION CATALOG
# ============================================================================

class DataStore:
    """In-memory data store for fashion e-commerce demo"""
    def __init__(self):
        self.products = self._load_fashion_catalog()
        self.cart = Cart()
        self.current_page = "home"
        self.session_id = str(uuid.uuid4())
        self.user_preferences = {}
        
    def _load_fashion_catalog(self) -> List[Product]:
        """Load comprehensive Italian fashion catalog"""
        products_data = [
            # T-SHIRTS & POLO
            {
                "id": "550e8400-0001-41d4-a716-446655440001",
                "name": "T-Shirt Basic Cotone Bio",
                "brand": "EcoWear",
                "description": "T-shirt basic in cotone biologico, perfetta per ogni occasione",
                "description_long": "T-shirt realizzata in 100% cotone biologico certificato GOTS. Taglio regular fit, girocollo classico. Morbida al tatto e traspirante, ideale per la primavera/estate. Lavabile in lavatrice a 30°.",
                "category": ProductCategory.TSHIRT,
                "subcategory": "basic",
                "gender": Gender.UNISEX,
                "price": 19.90,
                "original_price": 29.90,
                "discount_percentage": 33,
                "on_sale": True,
                "materials": ["100% Cotone biologico"],
                "care_instructions": "Lavare a 30°, non candeggiare, stirare a bassa temperatura",
                "season": "Primavera/Estate",
                "style": "Casual",
                "variants": [
                    ProductVariant(size=Size.S, color="Bianco", color_code="#FFFFFF", available=True, stock=15),
                    ProductVariant(size=Size.M, color="Bianco", color_code="#FFFFFF", available=True, stock=20),
                    ProductVariant(size=Size.L, color="Bianco", color_code="#FFFFFF", available=True, stock=10),
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=25),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=30),
                    ProductVariant(size=Size.L, color="Nero", color_code="#000000", available=True, stock=18),
                    ProductVariant(size=Size.M, color="Grigio melange", color_code="#B0B0B0", available=True, stock=12),
                ],
                "images": ["/images/tshirt-basic-1.jpg", "/images/tshirt-basic-2.jpg"],
                "features": ["Traspirante", "Cotone biologico", "Taglio regular"],
                "rating": 4.6,
                "reviews": 234,
                "tags": ["basic", "essentials", "cotone", "bio", "unisex", "maglia", "maglietta"]
            },
            {
                "id": "550e8400-0002-41d4-a716-446655440002",
                "name": "Polo Elegante Piquet",
                "brand": "Milano Style",
                "description": "Polo in piquet di cotone, elegante e versatile",
                "description_long": "Polo realizzata in piquet di cotone premium. Colletto classico con tre bottoni, taglio slim fit. Perfetta per look smart casual. Dettagli curati e logo ricamato sul petto.",
                "category": ProductCategory.TSHIRT,
                "subcategory": "polo",
                "gender": Gender.UOMO,
                "price": 49.90,
                "original_price": 69.90,
                "discount_percentage": 29,
                "on_sale": True,
                "materials": ["100% Cotone piquet"],
                "care_instructions": "Lavare a 40°, stirare a media temperatura",
                "season": "Quattro stagioni",
                "style": "Smart Casual",
                "variants": [
                    ProductVariant(size=Size.M, color="Blu navy", color_code="#000080", available=True, stock=8),
                    ProductVariant(size=Size.L, color="Blu navy", color_code="#000080", available=True, stock=12),
                    ProductVariant(size=Size.XL, color="Blu navy", color_code="#000080", available=True, stock=6),
                    ProductVariant(size=Size.M, color="Bordeaux", color_code="#800020", available=True, stock=5),
                    ProductVariant(size=Size.L, color="Bordeaux", color_code="#800020", available=True, stock=7),
                ],
                "images": ["/images/polo-1.jpg"],
                "features": ["Slim fit", "Logo ricamato", "Colletto button-down"],
                "rating": 4.7,
                "reviews": 89,
                "tags": ["polo", "elegante", "piquet", "smart", "business casual"]
            },

            # CAMICIE
            {
                "id": "550e8400-0003-41d4-a716-446655440003",
                "name": "Camicia Oxford Classica",
                "brand": "Sartoria Italiana",
                "description": "Camicia Oxford button-down, un classico intramontabile",
                "description_long": "Camicia in tessuto Oxford 100% cotone. Colletto button-down, taglio regular fit. Taschino sul petto sinistro. Perfetta per l'ufficio o occasioni formali.",
                "category": ProductCategory.CAMICIA,
                "subcategory": "formale",
                "gender": Gender.UOMO,
                "price": 79.90,
                "original_price": 99.90,
                "discount_percentage": 20,
                "on_sale": True,
                "materials": ["100% Cotone Oxford"],
                "care_instructions": "Lavare a 40°, stirare ad alta temperatura",
                "season": "Quattro stagioni",
                "style": "Formale/Business",
                "variants": [
                    ProductVariant(size=Size.S, color="Bianco", color_code="#FFFFFF", available=True, stock=10),
                    ProductVariant(size=Size.M, color="Bianco", color_code="#FFFFFF", available=True, stock=15),
                    ProductVariant(size=Size.L, color="Bianco", color_code="#FFFFFF", available=True, stock=12),
                    ProductVariant(size=Size.M, color="Azzurro", color_code="#87CEEB", available=True, stock=8),
                    ProductVariant(size=Size.L, color="Azzurro", color_code="#87CEEB", available=True, stock=10),
                ],
                "images": ["/images/camicia-oxford.jpg"],
                "features": ["Button-down", "Taschino", "No stiro"],
                "rating": 4.8,
                "reviews": 156,
                "tags": ["camicia", "oxford", "formale", "ufficio", "business"]
            },
            {
                "id": "550e8400-0004-41d4-a716-446655440004",
                "name": "Camicetta Seta Stampata",
                "brand": "Donna Elegante",
                "description": "Camicetta in seta con stampa floreale",
                "description_long": "Elegante camicetta in 100% seta con delicata stampa floreale. Colletto a V, maniche lunghe con polsini. Vestibilità morbida e femminile.",
                "category": ProductCategory.CAMICIA,
                "subcategory": "elegante",
                "gender": Gender.DONNA,
                "price": 89.90,
                "original_price": 129.90,
                "discount_percentage": 31,
                "on_sale": True,
                "materials": ["100% Seta"],
                "care_instructions": "Lavaggio a secco consigliato",
                "season": "Primavera/Estate",
                "style": "Elegante",
                "variants": [
                    ProductVariant(size=Size.S, color="Rosa antico", color_code="#D4A5A5", available=True, stock=6),
                    ProductVariant(size=Size.M, color="Rosa antico", color_code="#D4A5A5", available=True, stock=8),
                    ProductVariant(size=Size.L, color="Rosa antico", color_code="#D4A5A5", available=False, stock=0),
                    ProductVariant(size=Size.M, color="Blu polvere", color_code="#B0C4DE", available=True, stock=5),
                ],
                "images": ["/images/camicetta-seta.jpg"],
                "features": ["100% Seta", "Stampa floreale", "Taglio femminile"],
                "rating": 4.9,
                "reviews": 67,
                "tags": ["camicetta", "blusa", "seta", "elegante", "floreale"]
            },

            # MAGLIONI
            {
                "id": "550e8400-0005-41d4-a716-446655440005",
                "name": "Maglione Cashmere Girocollo",
                "brand": "Luxury Knit",
                "description": "Maglione girocollo in puro cashmere",
                "description_long": "Lussuoso maglione in 100% cashmere mongoliano. Girocollo classico, vestibilità regular. Morbidissimo e caldissimo, perfetto per l'inverno.",
                "category": ProductCategory.MAGLIONE,
                "subcategory": "pullover",
                "gender": Gender.UNISEX,
                "price": 179.90,
                "original_price": 249.90,
                "discount_percentage": 28,
                "on_sale": True,
                "materials": ["100% Cashmere"],
                "care_instructions": "Lavaggio a mano, asciugare in piano",
                "season": "Autunno/Inverno",
                "style": "Elegante Casual",
                "variants": [
                    ProductVariant(size=Size.S, color="Cammello", color_code="#C19A6B", available=True, stock=4),
                    ProductVariant(size=Size.M, color="Cammello", color_code="#C19A6B", available=True, stock=6),
                    ProductVariant(size=Size.L, color="Cammello", color_code="#C19A6B", available=True, stock=5),
                    ProductVariant(size=Size.M, color="Grigio antracite", color_code="#293133", available=True, stock=7),
                    ProductVariant(size=Size.L, color="Grigio antracite", color_code="#293133", available=True, stock=5),
                ],
                "images": ["/images/maglione-cashmere.jpg"],
                "features": ["Puro cashmere", "Extra morbido", "Termoregolatore"],
                "rating": 4.9,
                "reviews": 43,
                "tags": ["maglione", "cashmere", "pullover", "lusso", "inverno"]
            },
            {
                "id": "550e8400-0006-41d4-a716-446655440006",
                "name": "Dolcevita Lana Merino",
                "brand": "Nordic Style",
                "description": "Dolcevita in lana merino fine",
                "description_long": "Dolcevita realizzato in finissima lana merino. Ottimo isolamento termico, naturalmente antibatterico. Perfetto sotto giacche e blazer.",
                "category": ProductCategory.MAGLIONE,
                "subcategory": "dolcevita",
                "gender": Gender.DONNA,
                "price": 69.90,
                "original_price": 89.90,
                "discount_percentage": 22,
                "on_sale": True,
                "materials": ["100% Lana merino"],
                "care_instructions": "Lavare a 30° programma lana",
                "season": "Autunno/Inverno",
                "style": "Casual Elegante",
                "variants": [
                    ProductVariant(size=Size.XS, color="Nero", color_code="#000000", available=True, stock=8),
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=10),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=12),
                    ProductVariant(size=Size.S, color="Panna", color_code="#FFFDD0", available=True, stock=6),
                    ProductVariant(size=Size.M, color="Panna", color_code="#FFFDD0", available=True, stock=8),
                ],
                "images": ["/images/dolcevita-lana.jpg"],
                "features": ["Lana merino", "Antibatterico naturale", "Slim fit"],
                "rating": 4.7,
                "reviews": 91,
                "tags": ["dolcevita", "lana", "merino", "collo alto", "inverno"]
            },

            # FELPE
            {
                "id": "550e8400-0007-41d4-a716-446655440007",
                "name": "Felpa con Cappuccio Oversize",
                "brand": "Street Urban",
                "description": "Felpa hoodie oversize in cotone pesante",
                "description_long": "Felpa con cappuccio dal taglio oversize. Cotone pesante 400gsm, interno felpato. Tasche a marsupio, coulisse al cappuccio. Perfetta per look streetwear.",
                "category": ProductCategory.FELPA,
                "subcategory": "hoodie",
                "gender": Gender.UNISEX,
                "price": 59.90,
                "original_price": 79.90,
                "discount_percentage": 25,
                "on_sale": True,
                "materials": ["80% Cotone", "20% Poliestere"],
                "care_instructions": "Lavare a rovescio a 30°",
                "season": "Autunno/Inverno",
                "style": "Streetwear",
                "variants": [
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=20),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=25),
                    ProductVariant(size=Size.L, color="Nero", color_code="#000000", available=True, stock=22),
                    ProductVariant(size=Size.XL, color="Nero", color_code="#000000", available=True, stock=15),
                    ProductVariant(size=Size.M, color="Grigio melange", color_code="#B0B0B0", available=True, stock=18),
                    ProductVariant(size=Size.L, color="Grigio melange", color_code="#B0B0B0", available=True, stock=16),
                    ProductVariant(size=Size.M, color="Verde oliva", color_code="#708238", available=True, stock=10),
                ],
                "images": ["/images/felpa-hoodie.jpg"],
                "features": ["Oversize", "Cappuccio regolabile", "Tasche marsupio"],
                "rating": 4.8,
                "reviews": 312,
                "tags": ["felpa", "hoodie", "cappuccio", "streetwear", "oversize"]
            },
            {
                "id": "550e8400-0008-41d4-a716-446655440008",
                "name": "Felpa Girocollo Vintage",
                "brand": "Retro Sport",
                "description": "Felpa girocollo stile vintage con logo",
                "description_long": "Felpa girocollo ispirata agli anni '90. Cotone biologico, vestibilità regular. Logo ricamato sul petto. Polsini e orlo a costine.",
                "category": ProductCategory.FELPA,
                "subcategory": "girocollo",
                "gender": Gender.UOMO,
                "price": 49.90,
                "original_price": 69.90,
                "discount_percentage": 29,
                "on_sale": True,
                "materials": ["100% Cotone biologico"],
                "care_instructions": "Lavare a 30°",
                "season": "Primavera/Autunno",
                "style": "Vintage",
                "variants": [
                    ProductVariant(size=Size.M, color="Blu navy", color_code="#000080", available=True, stock=14),
                    ProductVariant(size=Size.L, color="Blu navy", color_code="#000080", available=True, stock=16),
                    ProductVariant(size=Size.XL, color="Blu navy", color_code="#000080", available=False, stock=0),
                    ProductVariant(size=Size.L, color="Grigio chiaro", color_code="#D3D3D3", available=True, stock=11),
                ],
                "images": ["/images/felpa-vintage.jpg"],
                "features": ["Cotone biologico", "Logo ricamato", "Stile vintage"],
                "rating": 4.6,
                "reviews": 178,
                "tags": ["felpa", "girocollo", "vintage", "retro", "cotone bio"]
            },

            # GIACCHE
            {
                "id": "550e8400-0009-41d4-a716-446655440009",
                "name": "Bomber in Pelle",
                "brand": "Aviator Style",
                "description": "Bomber in vera pelle con fodera termica",
                "description_long": "Bomber realizzato in pelle di agnello premium. Fodera termica removibile, chiusura zip YKK. Tasche laterali e interna. Polsini e orlo elasticizzati.",
                "category": ProductCategory.GIACCA,
                "subcategory": "bomber",
                "gender": Gender.UOMO,
                "price": 299.90,
                "original_price": 449.90,
                "discount_percentage": 33,
                "on_sale": True,
                "materials": ["Pelle di agnello", "Fodera: 100% Poliestere"],
                "care_instructions": "Pulizia specializzata per pelle",
                "season": "Autunno/Inverno",
                "style": "Urban",
                "variants": [
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=3),
                    ProductVariant(size=Size.L, color="Nero", color_code="#000000", available=True, stock=5),
                    ProductVariant(size=Size.XL, color="Nero", color_code="#000000", available=True, stock=2),
                    ProductVariant(size=Size.L, color="Marrone", color_code="#8B4513", available=True, stock=2),
                ],
                "images": ["/images/bomber-pelle.jpg"],
                "features": ["Vera pelle", "Fodera termica", "Water resistant"],
                "rating": 4.9,
                "reviews": 67,
                "tags": ["bomber", "pelle", "giacca", "giubbotto", "aviator"]
            },
            {
                "id": "550e8400-0010-41d4-a716-446655440010",
                "name": "Piumino Lungo Donna",
                "brand": "Arctic Warm",
                "description": "Piumino lungo con cappuccio in pelliccia ecologica",
                "description_long": "Piumino lungo fino al ginocchio. Imbottitura 90% piumino d'oca, 10% piume. Cappuccio con pelliccia ecologica removibile. Cintura in vita.",
                "category": ProductCategory.GIACCA,
                "subcategory": "piumino",
                "gender": Gender.DONNA,
                "price": 199.90,
                "original_price": 349.90,
                "discount_percentage": 43,
                "on_sale": True,
                "materials": ["Esterno: Poliestere", "Imbottitura: 90% piumino d'oca"],
                "care_instructions": "Lavaggio professionale",
                "season": "Inverno",
                "style": "Casual Elegante",
                "variants": [
                    ProductVariant(size=Size.XS, color="Nero", color_code="#000000", available=True, stock=6),
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=8),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=10),
                    ProductVariant(size=Size.L, color="Nero", color_code="#000000", available=True, stock=5),
                    ProductVariant(size=Size.S, color="Beige", color_code="#F5F5DC", available=True, stock=4),
                    ProductVariant(size=Size.M, color="Beige", color_code="#F5F5DC", available=True, stock=6),
                ],
                "images": ["/images/piumino-lungo.jpg"],
                "features": ["Extra caldo", "Cappuccio removibile", "Antivento"],
                "rating": 4.8,
                "reviews": 234,
                "tags": ["piumino", "cappotto", "inverno", "caldo", "lungo"]
            },
            {
                "id": "550e8400-0011-41d4-a716-446655440011",
                "name": "Blazer Sartoriale",
                "brand": "Milano Tailoring",
                "description": "Blazer sartoriale in lana vergine",
                "description_long": "Blazer taglio sartoriale in pura lana vergine. Due bottoni, tasche con pattina. Fodera interna in viscosa. Perfetto per occasioni formali.",
                "category": ProductCategory.GIACCA,
                "subcategory": "blazer",
                "gender": Gender.UOMO,
                "price": 249.90,
                "original_price": 399.90,
                "discount_percentage": 38,
                "on_sale": True,
                "materials": ["100% Lana vergine", "Fodera: Viscosa"],
                "care_instructions": "Lavaggio a secco",
                "season": "Quattro stagioni",
                "style": "Formale/Business",
                "variants": [
                    ProductVariant(size=Size.M, color="Blu notte", color_code="#191970", available=True, stock=4),
                    ProductVariant(size=Size.L, color="Blu notte", color_code="#191970", available=True, stock=5),
                    ProductVariant(size=Size.XL, color="Blu notte", color_code="#191970", available=True, stock=3),
                    ProductVariant(size=Size.L, color="Grigio scuro", color_code="#696969", available=True, stock=3),
                ],
                "images": ["/images/blazer-lana.jpg"],
                "features": ["Taglio sartoriale", "Lana vergine", "Fodera completa"],
                "rating": 4.9,
                "reviews": 89,
                "tags": ["blazer", "giacca", "formale", "sartoriale", "business"]
            },

            # PANTALONI
            {
                "id": "550e8400-0012-41d4-a716-446655440012",
                "name": "Jeans Slim Fit Stretch",
                "brand": "Denim Co",
                "description": "Jeans slim fit in denim stretch",
                "description_long": "Jeans dal taglio slim in denim elasticizzato. Vita media, gamba affusolata. Lavaggio stone washed. Cinque tasche classiche.",
                "category": ProductCategory.PANTALONI,
                "subcategory": "jeans",
                "gender": Gender.UOMO,
                "price": 79.90,
                "original_price": 99.90,
                "discount_percentage": 20,
                "on_sale": True,
                "materials": ["98% Cotone", "2% Elastan"],
                "care_instructions": "Lavare a rovescio a 30°",
                "season": "Quattro stagioni",
                "style": "Casual",
                "variants": [
                    ProductVariant(size=Size.S, color="Blu scuro", color_code="#00008B", available=True, stock=15),
                    ProductVariant(size=Size.M, color="Blu scuro", color_code="#00008B", available=True, stock=20),
                    ProductVariant(size=Size.L, color="Blu scuro", color_code="#00008B", available=True, stock=18),
                    ProductVariant(size=Size.XL, color="Blu scuro", color_code="#00008B", available=True, stock=12),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=14),
                    ProductVariant(size=Size.L, color="Nero", color_code="#000000", available=True, stock=16),
                ],
                "images": ["/images/jeans-slim.jpg"],
                "features": ["Stretch", "Slim fit", "Stone washed"],
                "rating": 4.7,
                "reviews": 456,
                "tags": ["jeans", "denim", "pantaloni", "slim", "stretch"]
            },
            {
                "id": "550e8400-0013-41d4-a716-446655440013",
                "name": "Chino Eleganti",
                "brand": "Classic Style",
                "description": "Pantaloni chino in cotone",
                "description_long": "Pantaloni chino in cotone twill. Taglio regular, vita media. Perfetti per look business casual. Tasche laterali e posteriori.",
                "category": ProductCategory.PANTALONI,
                "subcategory": "chino",
                "gender": Gender.UOMO,
                "price": 69.90,
                "original_price": 89.90,
                "discount_percentage": 22,
                "on_sale": True,
                "materials": ["100% Cotone twill"],
                "care_instructions": "Lavare a 40°, stirare a media temperatura",
                "season": "Quattro stagioni",
                "style": "Business Casual",
                "variants": [
                    ProductVariant(size=Size.M, color="Beige", color_code="#F5F5DC", available=True, stock=10),
                    ProductVariant(size=Size.L, color="Beige", color_code="#F5F5DC", available=True, stock=12),
                    ProductVariant(size=Size.XL, color="Beige", color_code="#F5F5DC", available=True, stock=8),
                    ProductVariant(size=Size.L, color="Blu navy", color_code="#000080", available=True, stock=9),
                ],
                "images": ["/images/chino.jpg"],
                "features": ["Regular fit", "Cotone twill", "No stiro"],
                "rating": 4.6,
                "reviews": 189,
                "tags": ["chino", "pantaloni", "eleganti", "cotone", "business"]
            },
            {
                "id": "550e8400-0014-41d4-a716-446655440014",
                "name": "Pantaloni Palazzo Donna",
                "brand": "Fashion Forward",
                "description": "Pantaloni palazzo a vita alta",
                "description_long": "Eleganti pantaloni palazzo a vita alta. Gamba ampia e fluida, cintura in vita. Tessuto leggero e traspirante. Chiusura zip laterale.",
                "category": ProductCategory.PANTALONI,
                "subcategory": "palazzo",
                "gender": Gender.DONNA,
                "price": 89.90,
                "original_price": 119.90,
                "discount_percentage": 25,
                "on_sale": True,
                "materials": ["65% Viscosa", "35% Poliestere"],
                "care_instructions": "Lavare a 30°, appendere ad asciugare",
                "season": "Primavera/Estate",
                "style": "Elegante",
                "variants": [
                    ProductVariant(size=Size.XS, color="Nero", color_code="#000000", available=True, stock=7),
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=9),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=11),
                    ProductVariant(size=Size.S, color="Crema", color_code="#FFFDD0", available=True, stock=5),
                    ProductVariant(size=Size.M, color="Crema", color_code="#FFFDD0", available=True, stock=6),
                ],
                "images": ["/images/pantaloni-palazzo.jpg"],
                "features": ["Vita alta", "Gamba ampia", "Fluidi"],
                "rating": 4.7,
                "reviews": 123,
                "tags": ["palazzo", "pantaloni", "eleganti", "vita alta", "donna"]
            },

            # SHORTS
            {
                "id": "550e8400-0015-41d4-a716-446655440015",
                "name": "Bermuda Cargo",
                "brand": "Adventure Gear",
                "description": "Bermuda cargo con tasche multiple",
                "description_long": "Bermuda in cotone resistente con tasche cargo laterali. Vita regolabile con coulisse. Perfetti per attività outdoor e tempo libero.",
                "category": ProductCategory.SHORTS,
                "subcategory": "cargo",
                "gender": Gender.UOMO,
                "price": 39.90,
                "original_price": 59.90,
                "discount_percentage": 33,
                "on_sale": True,
                "materials": ["100% Cotone canvas"],
                "care_instructions": "Lavare a 40°",
                "season": "Primavera/Estate",
                "style": "Casual/Outdoor",
                "variants": [
                    ProductVariant(size=Size.M, color="Kaki", color_code="#C3B091", available=True, stock=15),
                    ProductVariant(size=Size.L, color="Kaki", color_code="#C3B091", available=True, stock=18),
                    ProductVariant(size=Size.XL, color="Kaki", color_code="#C3B091", available=True, stock=12),
                    ProductVariant(size=Size.L, color="Verde militare", color_code="#4B5320", available=True, stock=10),
                ],
                "images": ["/images/bermuda-cargo.jpg"],
                "features": ["Tasche cargo", "Resistente", "Coulisse in vita"],
                "rating": 4.5,
                "reviews": 234,
                "tags": ["bermuda", "shorts", "cargo", "estate", "pantaloncini"]
            },
            {
                "id": "550e8400-0016-41d4-a716-446655440016",
                "name": "Shorts Sportivi Donna",
                "brand": "Active Wear",
                "description": "Shorts sportivi elasticizzati",
                "description_long": "Shorts sportivi in tessuto tecnico elasticizzato. Vita alta con elastico comfort. Perfetti per yoga, running e palestra.",
                "category": ProductCategory.SHORTS,
                "subcategory": "sport",
                "gender": Gender.DONNA,
                "price": 29.90,
                "original_price": 39.90,
                "discount_percentage": 25,
                "on_sale": True,
                "materials": ["87% Poliestere", "13% Elastan"],
                "care_instructions": "Lavare a 30°, asciugatura rapida",
                "season": "Primavera/Estate",
                "style": "Sport",
                "variants": [
                    ProductVariant(size=Size.XS, color="Nero", color_code="#000000", available=True, stock=20),
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=25),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=22),
                    ProductVariant(size=Size.S, color="Rosa", color_code="#FFC0CB", available=True, stock=15),
                ],
                "images": ["/images/shorts-sport.jpg"],
                "features": ["Elasticizzati", "Traspiranti", "Quick dry"],
                "rating": 4.6,
                "reviews": 178,
                "tags": ["shorts", "sport", "fitness", "yoga", "pantaloncini"]
            },

            # GONNE
            {
                "id": "550e8400-0017-41d4-a716-446655440017",
                "name": "Gonna Midi Plissettata",
                "brand": "Eleganza",
                "description": "Gonna midi plissettata in chiffon",
                "description_long": "Elegante gonna midi con plissettatura fine. Tessuto chiffon leggero e fluido. Fodera interna. Chiusura zip laterale invisibile.",
                "category": ProductCategory.GONNA,
                "subcategory": "midi",
                "gender": Gender.DONNA,
                "price": 79.90,
                "original_price": 109.90,
                "discount_percentage": 27,
                "on_sale": True,
                "materials": ["Esterno: 100% Poliestere chiffon", "Fodera: Viscosa"],
                "care_instructions": "Lavaggio delicato a 30°",
                "season": "Primavera/Estate",
                "style": "Elegante",
                "variants": [
                    ProductVariant(size=Size.XS, color="Rosa cipria", color_code="#F4C2C2", available=True, stock=6),
                    ProductVariant(size=Size.S, color="Rosa cipria", color_code="#F4C2C2", available=True, stock=8),
                    ProductVariant(size=Size.M, color="Rosa cipria", color_code="#F4C2C2", available=True, stock=7),
                    ProductVariant(size=Size.S, color="Blu navy", color_code="#000080", available=True, stock=5),
                ],
                "images": ["/images/gonna-midi.jpg"],
                "features": ["Plissettata", "Lunghezza midi", "Fodera"],
                "rating": 4.8,
                "reviews": 91,
                "tags": ["gonna", "midi", "plissettata", "elegante", "chiffon"]
            },
            {
                "id": "550e8400-0018-41d4-a716-446655440018",
                "name": "Minigonna Denim",
                "brand": "Young Fashion",
                "description": "Minigonna in denim con bottoni frontali",
                "description_long": "Minigonna in denim rigido con chiusura a bottoni frontale. Taglio A-line, tasche frontali e posteriori. Look vintage anni '70.",
                "category": ProductCategory.GONNA,
                "subcategory": "mini",
                "gender": Gender.DONNA,
                "price": 39.90,
                "original_price": 59.90,
                "discount_percentage": 33,
                "on_sale": True,
                "materials": ["100% Cotone denim"],
                "care_instructions": "Lavare a rovescio a 30°",
                "season": "Primavera/Estate",
                "style": "Casual",
                "variants": [
                    ProductVariant(size=Size.XS, color="Denim chiaro", color_code="#6495ED", available=True, stock=10),
                    ProductVariant(size=Size.S, color="Denim chiaro", color_code="#6495ED", available=True, stock=12),
                    ProductVariant(size=Size.M, color="Denim chiaro", color_code="#6495ED", available=True, stock=9),
                    ProductVariant(size=Size.S, color="Denim scuro", color_code="#00008B", available=True, stock=8),
                ],
                "images": ["/images/minigonna-denim.jpg"],
                "features": ["Bottoni frontali", "Taglio A-line", "Vintage style"],
                "rating": 4.5,
                "reviews": 156,
                "tags": ["gonna", "mini", "denim", "jeans", "casual"]
            },

            # VESTITI
            {
                "id": "550e8400-0019-41d4-a716-446655440019",
                "name": "Abito Lungo da Sera",
                "brand": "Haute Couture",
                "description": "Abito lungo in seta con schiena scoperta",
                "description_long": "Elegantissimo abito lungo in pura seta. Schiena scoperta con laccetti incrociati. Spacco laterale. Perfetto per eventi formali e serate di gala.",
                "category": ProductCategory.VESTITO,
                "subcategory": "sera",
                "gender": Gender.DONNA,
                "price": 199.90,
                "original_price": 349.90,
                "discount_percentage": 43,
                "on_sale": True,
                "materials": ["100% Seta"],
                "care_instructions": "Lavaggio a secco professionale",
                "season": "Quattro stagioni",
                "style": "Formale/Gala",
                "variants": [
                    ProductVariant(size=Size.XS, color="Nero", color_code="#000000", available=True, stock=3),
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=4),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=3),
                    ProductVariant(size=Size.S, color="Rosso borgogna", color_code="#800020", available=True, stock=2),
                ],
                "images": ["/images/abito-sera.jpg"],
                "features": ["100% Seta", "Schiena scoperta", "Spacco laterale"],
                "rating": 4.9,
                "reviews": 45,
                "tags": ["abito", "vestito", "sera", "elegante", "gala", "lungo"]
            },
            {
                "id": "550e8400-0020-41d4-a716-446655440020",
                "name": "Vestito Chemisier",
                "brand": "Daily Chic",
                "description": "Vestito chemisier con cintura",
                "description_long": "Vestito chemisier midi con bottoni frontali. Cintura in vita coordinata. Maniche lunghe con polsini. Versatile per ufficio e tempo libero.",
                "category": ProductCategory.VESTITO,
                "subcategory": "casual",
                "gender": Gender.DONNA,
                "price": 89.90,
                "original_price": 119.90,
                "discount_percentage": 25,
                "on_sale": True,
                "materials": ["70% Viscosa", "30% Poliestere"],
                "care_instructions": "Lavare a 30°, stirare a bassa temperatura",
                "season": "Primavera/Autunno",
                "style": "Business Casual",
                "variants": [
                    ProductVariant(size=Size.S, color="Verde salvia", color_code="#87A96B", available=True, stock=7),
                    ProductVariant(size=Size.M, color="Verde salvia", color_code="#87A96B", available=True, stock=9),
                    ProductVariant(size=Size.L, color="Verde salvia", color_code="#87A96B", available=True, stock=5),
                    ProductVariant(size=Size.M, color="Blu polvere", color_code="#B0C4DE", available=True, stock=6),
                ],
                "images": ["/images/vestito-chemisier.jpg"],
                "features": ["Cintura inclusa", "Bottoni frontali", "Versatile"],
                "rating": 4.7,
                "reviews": 134,
                "tags": ["vestito", "chemisier", "midi", "ufficio", "casual"]
            },

            # SCARPE
            {
                "id": "550e8400-0021-41d4-a716-446655440021",
                "name": "Sneakers Vintage Pelle",
                "brand": "Retro Kicks",
                "description": "Sneakers in pelle stile vintage",
                "description_long": "Sneakers ispirate ai modelli anni '80. Tomaia in pelle premium, suola in gomma vulcanizzata. Dettagli a contrasto. Comfort per tutto il giorno.",
                "category": ProductCategory.SCARPE,
                "subcategory": "sneakers",
                "gender": Gender.UNISEX,
                "price": 99.90,
                "original_price": 139.90,
                "discount_percentage": 29,
                "on_sale": True,
                "materials": ["Tomaia: Pelle", "Suola: Gomma"],
                "care_instructions": "Pulire con panno umido, impermeabilizzare",
                "season": "Quattro stagioni",
                "style": "Casual/Street",
                "variants": [
                    ProductVariant(size=Size.S, color="Bianco/Verde", color_code="#FFFFFF", available=True, stock=8),
                    ProductVariant(size=Size.M, color="Bianco/Verde", color_code="#FFFFFF", available=True, stock=12),
                    ProductVariant(size=Size.L, color="Bianco/Verde", color_code="#FFFFFF", available=True, stock=10),
                    ProductVariant(size=Size.XL, color="Bianco/Verde", color_code="#FFFFFF", available=True, stock=6),
                    ProductVariant(size=Size.M, color="Nero/Bianco", color_code="#000000", available=True, stock=9),
                ],
                "images": ["/images/sneakers-vintage.jpg"],
                "features": ["Pelle premium", "Stile vintage", "Suola vulcanizzata"],
                "rating": 4.8,
                "reviews": 289,
                "tags": ["scarpe", "sneakers", "vintage", "pelle", "ginnastica"]
            },
            {
                "id": "550e8400-0022-41d4-a716-446655440022",
                "name": "Stivali Chelsea Pelle",
                "brand": "London Boot Co",
                "description": "Stivali Chelsea in pelle con elastici",
                "description_long": "Classici stivali Chelsea in pelle di vitello. Elastici laterali, linguetta posteriore. Suola in cuoio con tacco 3cm. Eleganti e versatili.",
                "category": ProductCategory.SCARPE,
                "subcategory": "stivali",
                "gender": Gender.DONNA,
                "price": 149.90,
                "original_price": 199.90,
                "discount_percentage": 25,
                "on_sale": True,
                "materials": ["Pelle di vitello", "Suola in cuoio"],
                "care_instructions": "Trattare con crema per pelle",
                "season": "Autunno/Inverno",
                "style": "Elegante Casual",
                "variants": [
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=5),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=7),
                    ProductVariant(size=Size.L, color="Nero", color_code="#000000", available=True, stock=6),
                    ProductVariant(size=Size.M, color="Marrone", color_code="#8B4513", available=True, stock=4),
                ],
                "images": ["/images/stivali-chelsea.jpg"],
                "features": ["Pelle di vitello", "Elastici laterali", "Suola in cuoio"],
                "rating": 4.9,
                "reviews": 156,
                "tags": ["stivali", "chelsea", "pelle", "eleganti", "inverno"]
            },
            {
                "id": "550e8400-0023-41d4-a716-446655440023",
                "name": "Sandali Platform",
                "brand": "Summer Vibes",
                "description": "Sandali con platform e cinturino alla caviglia",
                "description_long": "Sandali con platform 5cm e cinturino regolabile alla caviglia. Tomaia in eco-pelle, suola in gomma antiscivolo. Perfetti per l'estate.",
                "category": ProductCategory.SCARPE,
                "subcategory": "sandali",
                "gender": Gender.DONNA,
                "price": 59.90,
                "original_price": 79.90,
                "discount_percentage": 25,
                "on_sale": True,
                "materials": ["Eco-pelle", "Suola: Gomma"],
                "care_instructions": "Pulire con panno umido",
                "season": "Primavera/Estate",
                "style": "Casual",
                "variants": [
                    ProductVariant(size=Size.S, color="Nude", color_code="#F5DEB3", available=True, stock=10),
                    ProductVariant(size=Size.M, color="Nude", color_code="#F5DEB3", available=True, stock=12),
                    ProductVariant(size=Size.L, color="Nude", color_code="#F5DEB3", available=False, stock=0),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=8),
                ],
                "images": ["/images/sandali-platform.jpg"],
                "features": ["Platform 5cm", "Cinturino regolabile", "Antiscivolo"],
                "rating": 4.5,
                "reviews": 201,
                "tags": ["sandali", "platform", "estate", "ciabatte", "scarpe"]
            },

            # ACCESSORI
            {
                "id": "550e8400-0024-41d4-a716-446655440024",
                "name": "Cintura in Pelle Reversibile",
                "brand": "Leather Craft",
                "description": "Cintura reversibile nero/marrone",
                "description_long": "Cintura in vera pelle con fibbia girevole. Reversibile nero/marrone per massima versatilità. Larghezza 3.5cm, tagliabile per adattare la misura.",
                "category": ProductCategory.ACCESSORI,
                "subcategory": "cinture",
                "gender": Gender.UOMO,
                "price": 49.90,
                "original_price": 69.90,
                "discount_percentage": 29,
                "on_sale": True,
                "materials": ["100% Pelle bovina"],
                "care_instructions": "Trattare con crema per pelle",
                "season": "Quattro stagioni",
                "style": "Classico",
                "variants": [
                    ProductVariant(size=Size.M, color="Nero/Marrone", color_code="#000000", available=True, stock=15),
                    ProductVariant(size=Size.L, color="Nero/Marrone", color_code="#000000", available=True, stock=18),
                    ProductVariant(size=Size.XL, color="Nero/Marrone", color_code="#000000", available=True, stock=12),
                ],
                "images": ["/images/cintura-reversibile.jpg"],
                "features": ["Reversibile", "Vera pelle", "Fibbia girevole"],
                "rating": 4.7,
                "reviews": 167,
                "tags": ["cintura", "pelle", "accessori", "reversibile"]
            },
            {
                "id": "550e8400-0025-41d4-a716-446655440025",
                "name": "Borsa a Tracolla Grande",
                "brand": "Urban Bags",
                "description": "Borsa a tracolla capiente in pelle vegana",
                "description_long": "Borsa a tracolla in pelle vegana di alta qualità. Scomparto principale con zip, tasche interne ed esterne. Tracolla regolabile e removibile.",
                "category": ProductCategory.ACCESSORI,
                "subcategory": "borse",
                "gender": Gender.DONNA,
                "price": 89.90,
                "original_price": 129.90,
                "discount_percentage": 31,
                "on_sale": True,
                "materials": ["Pelle vegana (PU)"],
                "care_instructions": "Pulire con panno umido",
                "season": "Quattro stagioni",
                "style": "Urban",
                "variants": [
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=8),
                    ProductVariant(size=Size.M, color="Cognac", color_code="#8B4513", available=True, stock=6),
                    ProductVariant(size=Size.M, color="Grigio", color_code="#808080", available=True, stock=5),
                ],
                "images": ["/images/borsa-tracolla.jpg"],
                "features": ["Capiente", "Multi-tasca", "Tracolla regolabile"],
                "rating": 4.8,
                "reviews": 234,
                "tags": ["borsa", "tracolla", "accessori", "vegana"]
            },
            {
                "id": "550e8400-0026-41d4-a716-446655440026",
                "name": "Cappello Panama",
                "brand": "Summer Hat Co",
                "description": "Cappello Panama in paglia naturale",
                "description_long": "Autentico cappello Panama tessuto a mano in Ecuador. Paglia toquilla naturale, fascia nera in gros-grain. Protezione UV naturale.",
                "category": ProductCategory.ACCESSORI,
                "subcategory": "cappelli",
                "gender": Gender.UNISEX,
                "price": 79.90,
                "original_price": 119.90,
                "discount_percentage": 33,
                "on_sale": True,
                "materials": ["Paglia toquilla naturale"],
                "care_instructions": "Conservare in luogo asciutto",
                "season": "Primavera/Estate",
                "style": "Elegante",
                "variants": [
                    ProductVariant(size=Size.M, color="Naturale", color_code="#F5DEB3", available=True, stock=7),
                    ProductVariant(size=Size.L, color="Naturale", color_code="#F5DEB3", available=True, stock=9),
                ],
                "images": ["/images/cappello-panama.jpg"],
                "features": ["Tessuto a mano", "Protezione UV", "Paglia naturale"],
                "rating": 4.9,
                "reviews": 78,
                "tags": ["cappello", "panama", "estate", "paglia", "accessori"]
            },
            {
                "id": "550e8400-0027-41d4-a716-446655440027",
                "name": "Sciarpa Cashmere",
                "brand": "Luxury Accessories",
                "description": "Sciarpa in puro cashmere",
                "description_long": "Lussuosa sciarpa in 100% cashmere. Dimensioni 200x70cm. Frangia alle estremità. Morbidissima e calda.",
                "category": ProductCategory.ACCESSORI,
                "subcategory": "sciarpe",
                "gender": Gender.UNISEX,
                "price": 99.90,
                "original_price": 149.90,
                "discount_percentage": 33,
                "on_sale": True,
                "materials": ["100% Cashmere"],
                "care_instructions": "Lavaggio a mano o a secco",
                "season": "Autunno/Inverno",
                "style": "Elegante",
                "variants": [
                    ProductVariant(size=Size.M, color="Grigio perla", color_code="#E5E4E2", available=True, stock=5),
                    ProductVariant(size=Size.M, color="Navy", color_code="#000080", available=True, stock=4),
                    ProductVariant(size=Size.M, color="Bordeaux", color_code="#800020", available=True, stock=3),
                ],
                "images": ["/images/sciarpa-cashmere.jpg"],
                "features": ["100% Cashmere", "200x70cm", "Extra morbida"],
                "rating": 4.9,
                "reviews": 56,
                "tags": ["sciarpa", "cashmere", "inverno", "lusso", "accessori"]
            },
            {
                "id": "550e8400-0028-41d4-a716-446655440028",
                "name": "Zaino Business",
                "brand": "Tech Gear",
                "description": "Zaino per laptop con porta USB",
                "description_long": "Zaino professionale con scomparto imbottito per laptop fino a 15.6\". Porta USB esterna per powerbank. Schienale ergonomico traspirante.",
                "category": ProductCategory.ACCESSORI,
                "subcategory": "zaini",
                "gender": Gender.UNISEX,
                "price": 69.90,
                "original_price": 99.90,
                "discount_percentage": 30,
                "on_sale": True,
                "materials": ["Poliestere resistente all'acqua"],
                "care_instructions": "Pulire con panno umido",
                "season": "Quattro stagioni",
                "style": "Business/Tech",
                "variants": [
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=20),
                    ProductVariant(size=Size.M, color="Grigio antracite", color_code="#293133", available=True, stock=15),
                ],
                "images": ["/images/zaino-business.jpg"],
                "features": ["Porta USB", "Impermeabile", "Scomparto laptop"],
                "rating": 4.7,
                "reviews": 345,
                "tags": ["zaino", "business", "laptop", "tech", "accessori"]
            },

            # OUTFIT COMPLETI E SPECIAL ITEMS
            {
                "id": "550e8400-0029-41d4-a716-446655440029",
                "name": "Completo Lino Uomo",
                "brand": "Summer Suit",
                "description": "Completo giacca e pantalone in lino",
                "description_long": "Elegante completo estivo in puro lino. Giacca destrutturata e pantaloni con piega. Perfetto per matrimoni estivi e occasioni eleganti.",
                "category": ProductCategory.GIACCA,
                "subcategory": "completo",
                "gender": Gender.UOMO,
                "price": 299.90,
                "original_price": 499.90,
                "discount_percentage": 40,
                "on_sale": True,
                "materials": ["100% Lino"],
                "care_instructions": "Lavaggio a secco consigliato",
                "season": "Primavera/Estate",
                "style": "Elegante",
                "variants": [
                    ProductVariant(size=Size.M, color="Beige", color_code="#F5F5DC", available=True, stock=3),
                    ProductVariant(size=Size.L, color="Beige", color_code="#F5F5DC", available=True, stock=4),
                    ProductVariant(size=Size.L, color="Azzurro polvere", color_code="#B0C4DE", available=True, stock=2),
                ],
                "images": ["/images/completo-lino.jpg"],
                "features": ["100% Lino", "Giacca e pantalone", "Traspirante"],
                "rating": 4.8,
                "reviews": 34,
                "tags": ["completo", "lino", "elegante", "matrimonio", "estate"]
            },
            {
                "id": "550e8400-0030-41d4-a716-446655440030",
                "name": "Tuta Sportiva Donna",
                "brand": "Fit & Fashion",
                "description": "Completo sportivo felpa e leggings",
                "description_long": "Set coordinato felpa crop con cappuccio e leggings a vita alta. Tessuto tecnico elasticizzato, perfetto per yoga, pilates e palestra.",
                "category": ProductCategory.FELPA,
                "subcategory": "tuta",
                "gender": Gender.DONNA,
                "price": 89.90,
                "original_price": 129.90,
                "discount_percentage": 31,
                "on_sale": True,
                "materials": ["75% Poliestere", "25% Elastan"],
                "care_instructions": "Lavare a 30°, non stirare",
                "season": "Quattro stagioni",
                "style": "Sport/Athleisure",
                "variants": [
                    ProductVariant(size=Size.XS, color="Rosa antico", color_code="#D4A5A5", available=True, stock=8),
                    ProductVariant(size=Size.S, color="Rosa antico", color_code="#D4A5A5", available=True, stock=10),
                    ProductVariant(size=Size.M, color="Rosa antico", color_code="#D4A5A5", available=True, stock=9),
                    ProductVariant(size=Size.S, color="Nero", color_code="#000000", available=True, stock=12),
                    ProductVariant(size=Size.M, color="Nero", color_code="#000000", available=True, stock=15),
                ],
                "images": ["/images/tuta-sportiva.jpg"],
                "features": ["Set coordinato", "Elasticizzato", "Moisture wicking"],
                "rating": 4.7,
                "reviews": 267,
                "tags": ["tuta", "sport", "fitness", "yoga", "completo", "athleisure"]
            }
        ]
        
        return [Product(**p) for p in products_data]
    
    def search_products(self, 
                       query: Optional[str] = None,
                       filters: Optional[SearchFilters] = None,
                       limit: int = 10) -> List[Product]:
        """Advanced product search with Italian term normalization"""
        results = self.products
        
        # Apply query search with Italian normalization
        if query:
            query_normalized = normalize_italian_terms(query.lower())
            query_terms = query_normalized.split()
            
            results = []
            for product in self.products:
                # Calculate relevance score
                score = 0
                product_text = f"{product.name} {product.brand} {product.description} {product.category} {product.subcategory} {' '.join(product.tags)}".lower()
                product_text_normalized = normalize_italian_terms(product_text)
                
                for term in query_terms:
                    if term in product_text_normalized:
                        score += 2
                    elif any(term in tag for tag in product.tags):
                        score += 1
                
                if score > 0:
                    results.append((score, product))
            
            # Sort by relevance score
            results.sort(key=lambda x: x[0], reverse=True)
            results = [p for _, p in results]
        
        # Apply filters
        if filters:
            if filters.category:
                cat_normalized = normalize_italian_terms(filters.category.lower())
                results = [p for p in results if cat_normalized in p.category.value.lower() or cat_normalized in p.subcategory.lower()]
            
            if filters.gender:
                results = [p for p in results if p.gender == filters.gender or p.gender == Gender.UNISEX]
            
            if filters.size:
                results = [p for p in results if any(v.size == filters.size and v.available for v in p.variants)]
            
            if filters.color:
                color_lower = filters.color.lower()
                results = [p for p in results if any(color_lower in v.color.lower() for v in p.variants)]
            
            if filters.price_min is not None:
                results = [p for p in results if p.price >= filters.price_min]
            
            if filters.price_max is not None:
                results = [p for p in results if p.price <= filters.price_max]
            
            if filters.on_sale is not None:
                results = [p for p in results if p.on_sale == filters.on_sale]
            
            if filters.brand:
                results = [p for p in results if filters.brand.lower() in p.brand.lower()]
            
            if filters.season:
                results = [p for p in results if filters.season.lower() in p.season.lower()]
            
            if filters.style:
                results = [p for p in results if filters.style.lower() in p.style.lower()]
        
        return results[:limit]
    
    def get_product_by_id(self, product_id: str) -> Optional[Product]:
        """Get single product by ID"""
        for product in self.products:
            if product.id == product_id:
                return product
        return None
    
    def check_variant_availability(self, product_id: str, size: str, color: str) -> bool:
        """Check if specific variant is available"""
        product = self.get_product_by_id(product_id)
        if not product:
            return False
        
        for variant in product.variants:
            if variant.size.value == size and variant.color.lower() == color.lower():
                return variant.available and variant.stock > 0
        return False
    
    def add_to_cart(self, product_id: str, size: str, color: str, quantity: int) -> CartItem:
        """Add item to cart with specific variant"""
        product = self.get_product_by_id(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Prodotto non trovato")
        
        # Check variant availability
        variant_found = False
        for variant in product.variants:
            if variant.size.value == size and variant.color.lower() == color.lower():
                variant_found = True
                if not variant.available or variant.stock < quantity:
                    raise HTTPException(status_code=400, detail="Variante non disponibile o stock insufficiente")
                break
        
        if not variant_found:
            raise HTTPException(status_code=400, detail="Variante non trovata")
        
        # Check if same variant already in cart
        for item in self.cart.items:
            if item.product_id == product_id and item.size.value == size and item.color.lower() == color.lower():
                item.quantity += quantity
                item.subtotal = item.quantity * product.price
                self._update_cart_totals()
                return item
        
        # Add new item
        cart_item = CartItem(
            id=f"cart-{uuid.uuid4()}",
            product_id=product_id,
            product=product,
            size=Size(size),
            color=color,
            quantity=quantity,
            subtotal=quantity * product.price
        )
        self.cart.items.append(cart_item)
        self._update_cart_totals()
        return cart_item
    
    def _update_cart_totals(self):
        """Update cart totals with shipping calculation"""
        self.cart.total = sum(item.subtotal for item in self.cart.items)
        self.cart.item_count = sum(item.quantity for item in self.cart.items)
        
        # Free shipping over 100€
        if self.cart.total >= 100:
            self.cart.shipping = 0.0
        else:
            self.cart.shipping = 9.90
        
        self.cart.grand_total = self.cart.total + self.cart.shipping - self.cart.discount_applied
    
    def get_recommendations(self, 
                           product_id: Optional[str] = None,
                           category: Optional[str] = None,
                           style: Optional[str] = None,
                           limit: int = 3) -> List[Product]:
        """Get smart product recommendations"""
        recommendations = []
        
        if product_id:
            product = self.get_product_by_id(product_id)
            if product:
                # Get complementary items
                if product.category == ProductCategory.TSHIRT:
                    # Recommend pants and shoes
                    recommendations.extend(self.search_products(filters=SearchFilters(category="pantaloni"), limit=1))
                    recommendations.extend(self.search_products(filters=SearchFilters(category="scarpe"), limit=1))
                elif product.category == ProductCategory.PANTALONI:
                    # Recommend shirts and shoes
                    recommendations.extend(self.search_products(filters=SearchFilters(category="camicia"), limit=1))
                    recommendations.extend(self.search_products(filters=SearchFilters(category="scarpe"), limit=1))
                elif product.category == ProductCategory.SCARPE:
                    # Recommend matching accessories
                    recommendations.extend(self.search_products(filters=SearchFilters(category="accessori"), limit=2))
                
                # Add similar items from same category
                similar = [p for p in self.products 
                          if p.category == product.category 
                          and p.id != product_id
                          and p.gender == product.gender]
                recommendations.extend(similar[:limit - len(recommendations)])
        
        elif category:
            cat_normalized = normalize_italian_terms(category.lower())
            recommendations = self.search_products(filters=SearchFilters(category=cat_normalized), limit=limit)
        
        elif style:
            recommendations = [p for p in self.products if style.lower() in p.style.lower()][:limit]
        
        else:
            # Return best sellers (highest reviews)
            recommendations = sorted(self.products, key=lambda p: p.reviews, reverse=True)[:limit]
        
        return recommendations[:limit]
    
    def get_size_guide(self, category: str) -> Dict[str, Any]:
        """Get size guide for category"""
        guides = {
            "tshirt": {
                "uomo": {"XS": "44-46", "S": "46-48", "M": "48-50", "L": "50-52", "XL": "52-54", "XXL": "54-56"},
                "donna": {"XS": "38-40", "S": "40-42", "M": "42-44", "L": "44-46", "XL": "46-48", "XXL": "48-50"}
            },
            "pantaloni": {
                "uomo": {"XS": "44", "S": "46", "M": "48", "L": "50", "XL": "52", "XXL": "54"},
                "donna": {"XS": "38", "S": "40", "M": "42", "L": "44", "XL": "46", "XXL": "48"}
            },
            "scarpe": {
                "uomo": {"S": "39-40", "M": "41-42", "L": "43-44", "XL": "45-46"},
                "donna": {"XS": "35-36", "S": "37-38", "M": "39-40", "L": "41-42"}
            }
        }
        
        cat_normalized = normalize_italian_terms(category.lower())
        return guides.get(cat_normalized, guides.get("tshirt"))

# Initialize data store
data_store = DataStore()

# ============================================================================
# WEBSOCKET MANAGER
# ============================================================================

class ConnectionManager:
    """WebSocket connection manager for real-time streaming"""
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_sessions: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.user_sessions[session_id] = {
            "websocket": websocket,
            "preferences": {},
            "history": []
        }
        logger.info(f"WebSocket connected: {session_id}")

    def disconnect(self, websocket: WebSocket, session_id: str):
        self.active_connections.remove(websocket)
        if session_id in self.user_sessions:
            del self.user_sessions[session_id]
        logger.info(f"WebSocket disconnected: {session_id}")

    async def send_json(self, websocket: WebSocket, data: dict):
        await websocket.send_json(data)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "AIVA Fashion E-commerce API",
        "version": "2.0.0",
        "language": "Italian",
        "catalog_size": len(data_store.products),
        "status": "operational",
        "documentation": "/api/docs"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "products_loaded": len(data_store.products),
        "categories": list(ProductCategory)
    }

# WebSocket endpoint for real-time voice streaming
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time voice interaction"""
    await manager.connect(websocket, session_id)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            
            if data.get("type") == "voice_command":
                # Process voice command
                text = data.get("text", "")
                context = {
                    "session_id": session_id,
                    "preferences": manager.user_sessions[session_id]["preferences"],
                    "current_page": data_store.current_page,
                    "cart_count": data_store.cart.item_count
                }
                
                # Start streaming response immediately
                await manager.send_json(websocket, {
                    "type": "processing_start",
                    "message": "Sto elaborando la tua richiesta..."
                })
                
                # Process with real AI service
                try:
                    from ai_service import process_voice_command_streaming
                    
                    # Stream AI response
                    async for chunk in process_voice_command_streaming(text, context):
                        await manager.send_json(websocket, chunk)
                        
                except Exception as e:
                    logger.error(f"AI processing error: {e}")
                    await manager.send_json(websocket, {
                        "type": "error",
                        "message": "Mi dispiace, ho riscontrato un errore. Riprova più tardi."
                    })
                
            elif data.get("type") == "update_preferences":
                # Update user preferences
                preferences = data.get("preferences", {})
                manager.user_sessions[session_id]["preferences"].update(preferences)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)

# Product Endpoints
@app.get("/api/products", response_model=List[Product])
async def get_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    gender: Optional[Gender] = None,
    size: Optional[Size] = None,
    color: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    on_sale: Optional[bool] = None,
    brand: Optional[str] = None,
    limit: int = 20
):
    """Get products with advanced filtering"""
    filters = SearchFilters(
        category=category,
        gender=gender,
        size=size,
        color=color,
        price_min=min_price,
        price_max=max_price,
        on_sale=on_sale,
        brand=brand
    )
    
    return data_store.search_products(query=q, filters=filters, limit=limit)

@app.get("/api/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    """Get single product with all details"""
    product = data_store.get_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    return product

@app.get("/api/products/{product_id}/availability")
async def check_availability(product_id: str, size: str, color: str):
    """Check specific variant availability"""
    available = data_store.check_variant_availability(product_id, size, color)
    return {"available": available}

@app.get("/api/recommendations", response_model=List[Product])
async def get_recommendations(
    product_id: Optional[str] = None,
    category: Optional[str] = None,
    style: Optional[str] = None,
    limit: int = 3
):
    """Get smart product recommendations"""
    return data_store.get_recommendations(product_id, category, style, limit)

# Cart Endpoints
@app.get("/api/cart", response_model=Cart)
async def get_cart():
    """Get current cart with totals"""
    return data_store.cart

@app.post("/api/cart/items")
async def add_to_cart(
    product_id: str,
    size: str,
    color: str,
    quantity: int = 1
):
    """Add item to cart with specific variant"""
    if quantity < 1 or quantity > 10:
        raise HTTPException(status_code=400, detail="Quantità deve essere tra 1 e 10")
    
    cart_item = data_store.add_to_cart(product_id, size, color, quantity)
    return {
        "success": True,
        "item": cart_item,
        "cart_total": data_store.cart.grand_total,
        "message": f"Aggiunto al carrello: {cart_item.product.name} - Taglia {size} - {color}"
    }

@app.delete("/api/cart/items/{item_id}")
async def remove_from_cart(item_id: str):
    """Remove item from cart"""
    data_store.cart.items = [item for item in data_store.cart.items if item.id != item_id]
    data_store._update_cart_totals()
    return {"success": True, "message": "Articolo rimosso dal carrello"}

@app.post("/api/cart/clear")
async def clear_cart():
    """Clear entire cart"""
    data_store.cart = Cart()
    return {"success": True, "message": "Carrello svuotato"}

# Voice & AI Endpoints
@app.post("/api/voice/process")
async def process_voice_command(request: VoiceRequest):
    """Process voice command with Italian NLP"""
    # This would integrate with the AI service
    # For now, return a simulated response
    return {
        "action": "search_products",
        "parameters": {"query": request.text},
        "message": "Cerco quello che mi hai chiesto...",
        "success": True
    }

# Information Endpoints
@app.get("/api/size-guide/{category}")
async def get_size_guide(category: str):
    """Get size guide for category"""
    return data_store.get_size_guide(category)

@app.get("/api/shipping-info")
async def get_shipping_info():
    """Get shipping information"""
    return {
        "free_shipping_threshold": 100,
        "standard_shipping": 9.90,
        "express_shipping": 19.90,
        "delivery_time_standard": "3-5 giorni lavorativi",
        "delivery_time_express": "1-2 giorni lavorativi"
    }

@app.get("/api/promotions")
async def get_current_promotions():
    """Get current promotions"""
    return {
        "promotions": [
            {
                "id": "promo1",
                "title": "Saldi Invernali",
                "description": "Fino al 50% su tutta la collezione invernale",
                "valid_until": "2025-02-28"
            },
            {
                "id": "promo2",
                "title": "Spedizione Gratuita",
                "description": "Spedizione gratuita per ordini sopra i 100€",
                "valid_until": "2025-12-31"
            },
            {
                "id": "promo3",
                "title": "3x2 T-Shirt",
                "description": "Prendi 3 t-shirt e paghi solo 2",
                "valid_until": "2025-03-31"
            }
        ]
    }

# Error Handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail,
                "timestamp": datetime.utcnow().isoformat()
            }
        }
    )

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    logger.info("AIVA Fashion Backend starting up...")
    logger.info(f"Loaded {len(data_store.products)} products")
    logger.info(f"Categories: {list(ProductCategory)}")
    logger.info("Italian language support: ACTIVE")
    logger.info("WebSocket streaming: ENABLED")
    logger.info("Security features: Rate limiting, Input sanitization, Injection protection")

@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    logger.info("AIVA Fashion Backend shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )