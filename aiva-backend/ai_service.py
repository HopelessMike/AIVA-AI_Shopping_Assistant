# ai_service.py - VERSIONE CORRETTA E COMPLETA
# OpenAI Integration Service with Italian Support & Enhanced Function Execution

import os
import json
import re
import logging
import asyncio
import random
from typing import Dict, Any, Optional, List, AsyncGenerator, Tuple
from datetime import datetime
import openai
from openai import AsyncOpenAI
import httpx

logger = logging.getLogger("AIVA.AI")

# ✅ SYSTEM PROMPT OTTIMIZZATO
SYSTEM_PROMPT = """
Sei AIVA, un assistente vocale per e-commerce di abbigliamento italiano. Rispondi SEMPRE in italiano.

IDENTITÀ:
- Nome: AIVA
- Ruolo: Personal shopper virtuale per abbigliamento uomo/donna
- Personalità: Amichevole, competente in moda, professionale

CAPACITÀ COMPLETE:
Hai accesso completo al catalogo prodotti e puoi eseguire TUTTE queste operazioni:

FUNZIONI DISPONIBILI (USA SEMPRE):
1. search_products: Cerca prodotti con filtri SPECIFICI
   - SEMPRE usa filters per gender, color, category, on_sale quando menzionati
   
2. get_product_details: Dettagli prodotto specifico
   
3. add_to_cart: Aggiungi al carrello (SEMPRE con taglia e colore)
   - Se mancano, CHIEDI prima di procedere
   
4. remove_from_cart: Rimuovi articolo dal carrello
   
5. navigate_to_page: Naviga tra le pagine (home, prodotti, offerte, carrello, checkout)
   
6. get_cart_summary: Mostra riepilogo carrello
   
7. clear_cart: Svuota carrello
   
8. get_recommendations: Suggerimenti personalizzati
   
9. get_size_guide: Guida taglie per categoria
   
10. get_current_promotions: Promozioni attive

11. get_shipping_info: Costi, tempistiche e opzioni di consegna

12. apply_ui_filters: Applica filtri nell'interfaccia utente
    - Usa per applicare filtri visibili nella pagina prodotti

13. remove_last_cart_item: Rimuovi ultimo articolo aggiunto

14. update_cart_quantity: Modifica quantità nel carrello

15. close_conversation: Chiudi conversazione quando richiesto

REGOLE IMPORTANTI:
- Quando l'utente chiede di vedere prodotti specifici, USA SEMPRE search_products con filters appropriati
- Per "scarpe da uomo" usa: search_products(query="scarpe", filters={"gender": "uomo"})
- Per "felpe nere" usa: search_products(query="felpa", filters={"color": "nero"})
- Per "offerte" usa: search_products(query="", filters={"on_sale": true})
- Per domande su spedizioni, consegne o costi di invio usa SEMPRE get_shipping_info
- SEMPRE naviga prima alla pagina prodotti quando cerchi
- APPLICA sempre i filtri UI dopo la ricerca con apply_ui_filters

CONVERSAZIONE:
- Rispondi SEMPRE in italiano
- Mantieni risposte brevi e naturali
- Se l'utente dice "basta", "chiudi", "esci" usa close_conversation
- Suggerisci sempre prodotti complementari

MAPPING TERMINI:
- maglia/maglietta → t-shirt
- felpa con cappuccio → felpa  
- giubbotto/giacca → giacca
- jeans → pantaloni
- scarpe da ginnastica → scarpe
"""

class SecureAIService:
    """Enhanced AI service with Italian support and improved function execution"""
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_MODEL", "gpt-4-turbo-preview")
        self.max_tokens = int(os.getenv("OPENAI_MAX_TOKENS", "500"))
        self.temperature = float(os.getenv("OPENAI_TEMPERATURE", "0.7"))
        
        if self.api_key:
            self.client = AsyncOpenAI(api_key=self.api_key)
        else:
            self.client = None
            logger.warning("OpenAI API key not configured - using fallback mode")
        
        # Italian-specific injection patterns
        self.injection_patterns = [
            r"ignore.*previous.*instruction",
            r"ignore.*above.*instruction",
            r"reveal.*prompt",
            r"reveal.*instruction",
            r"show.*system.*prompt",
            r"ignora.*istruzioni.*precedent",
            r"rivela.*prompt",
            r"mostra.*istruzioni",
            r"system\s*:",
            r"assistant\s*:",
            r"execute.*code",
        ]
        
        # ✅ COMPLETE FUNCTION SCHEMAS - TUTTE LE FUNZIONI
        self.functions = [
            {
                "name": "search_products",
                "description": "Cerca prodotti nel catalogo con filtri specifici",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Termine di ricerca (es. maglia, felpa, jeans)"
                        },
                        "filters": {
                            "type": "object",
                            "properties": {
                                "category": {"type": "string"},
                                "gender": {"type": "string", "enum": ["uomo", "donna", "unisex"]},
                                "size": {"type": "string", "enum": ["XS", "S", "M", "L", "XL", "XXL"]},
                                "color": {"type": "string"},
                                "min_price": {"type": "number"},
                                "max_price": {"type": "number"},
                                "on_sale": {"type": "boolean"},
                                "brand": {"type": "string"},
                                "style": {"type": "string"}
                            }
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "get_product_details",
                "description": "Ottieni dettagli completi di un prodotto",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"}
                    },
                    "required": ["product_id"]
                }
            },
            {
                "name": "add_to_cart",
                "description": "Aggiungi prodotto al carrello con varianti",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "size": {"type": "string"},
                        "color": {"type": "string"},
                        "quantity": {"type": "integer", "minimum": 1, "maximum": 10}
                    },
                    "required": ["product_id", "size", "color"]
                }
            },
            {
                "name": "remove_from_cart",
                "description": "Rimuovi articolo dal carrello",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "item_id": {"type": "string"}
                    },
                    "required": ["item_id"]
                }
            },
            {
                "name": "remove_last_cart_item",
                "description": "Rimuovi ultimo articolo aggiunto al carrello",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "update_cart_quantity",
                "description": "Modifica quantità articolo nel carrello",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "item_id": {"type": "string"},
                        "quantity": {"type": "integer", "minimum": 1, "maximum": 10}
                    },
                    "required": ["item_id", "quantity"]
                }
            },
            {
                "name": "navigate_to_page",
                "description": "Naviga verso una pagina specifica",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "page": {
                            "type": "string",
                            "enum": ["home", "prodotti", "offerte", "carrello", "checkout"]
                        }
                    },
                    "required": ["page"]
                }
            },
            {
                "name": "get_cart_summary",
                "description": "Mostra riepilogo carrello",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "clear_cart",
                "description": "Svuota completamente il carrello",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_recommendations",
                "description": "Ottieni suggerimenti personalizzati",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "category": {"type": "string"},
                        "style": {"type": "string"}
                    }
                }
            },
            {
                "name": "get_size_guide",
                "description": "Mostra guida taglie",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string"}
                    },
                    "required": ["category"]
                }
            },
            {
                "name": "get_current_promotions",
                "description": "Mostra promozioni attive",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_shipping_info",
                "description": "Mostra costi e tempistiche di spedizione",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "apply_ui_filters",
                "description": "Applica filtri nell'interfaccia utente",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filters": {
                            "type": "object",
                            "properties": {
                                "category": {"type": "string"},
                                "gender": {"type": "string"},
                                "size": {"type": "string"},
                                "color": {"type": "string"},
                                "price_range": {"type": "string"},
                                "on_sale": {"type": "boolean"}
                            }
                        }
                    },
                    "required": ["filters"]
                }
            },
            {
                "name": "close_conversation",
                "description": "Chiudi la conversazione con l'assistente",
                "parameters": {"type": "object", "properties": {}}
            }
        ]
    
    def detect_injection(self, text: str) -> bool:
        """Enhanced injection detection"""
        text_lower = text.lower()
        
        for pattern in self.injection_patterns:
            if re.search(pattern, text_lower):
                logger.warning(f"Injection pattern detected: {pattern}")
                return True
        
        if len(text) > 1000:
            return True
            
        return False
    
    # ✅ METODO MANCANTE - Extract User Preferences
    async def extract_user_preferences(self, text: str) -> Dict[str, Any]:
        """Extract user preferences from text"""
        preferences = {}
        text_lower = text.lower()
        
        # Extract size preferences
        sizes = ["xs", "s", "m", "l", "xl", "xxl"]
        for size in sizes:
            if f"taglia {size}" in text_lower or f"size {size}" in text_lower:
                preferences["size"] = size.upper()
                break
        
        # Extract color preferences
        colors = {
            "nero": "nero", "bianco": "bianco", "blu": "blu", "rosso": "rosso",
            "verde": "verde", "giallo": "giallo", "grigio": "grigio", 
            "rosa": "rosa", "marrone": "marrone", "beige": "beige"
        }
        for it_color, color in colors.items():
            if it_color in text_lower:
                preferences["color"] = color
                break
        
        # Extract gender preferences
        if any(word in text_lower for word in ["uomo", "maschile", "da uomo", "per uomo"]):
            preferences["gender"] = "uomo"
        elif any(word in text_lower for word in ["donna", "femminile", "da donna", "per donna"]):
            preferences["gender"] = "donna"
        
        # Extract style preferences
        styles = ["casual", "elegante", "sportivo", "formale", "streetwear"]
        for style in styles:
            if style in text_lower:
                preferences["style"] = style
                break
        
        return preferences
    
    async def process_voice_command_streaming(
        self, 
        text: str, 
        context: Dict
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process voice command with streaming response"""
        
        # ✅ Intent robusto: “apri la pagina prodotto <nome>” prima del modello
        import re
        from difflib import get_close_matches

        def _norm(s: str) -> str:
            return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()

        text_lower = (text or "").lower().strip()
        vp_map = context.get("visible_products_map") or {}
        visible = context.get("visible_products") or []

        # Estrai candidate name dalla frase (dopo "apri"/"apri la pagina prodotto")
        m = re.search(r"(apri(?:\s+la\s+pagina)?(?:\s+prodotto)?)\s+(.+)$", text_lower)
        requested = (m.group(2).strip() if m else None)

        if any(k in text_lower for k in ["apri", "aprimi", "apri la pagina", "pagina prodotto"]) and requested:
            # 1) match diretto sulla mappa normalizzata
            cand = None
            if vp_map:
                key = _norm(requested)
                if key in vp_map:
                    cand = vp_map[key]

            # 2) fuzzy sui visibili
            if not cand and visible:
                names = [p["name"] for p in visible if p.get("name")]
                match = get_close_matches(requested, [n.lower() for n in names], n=1, cutoff=0.6)
                if match:
                    target = match[0]
                    for p in visible:
                        if p.get("name", "").lower() == target:
                            cand = p["id"]; break

            # 3) fallback: cerca nel catalogo
            if not cand:
                from app import data_store
                results = data_store.search_products(query=requested, limit=1)
                if results:
                    cand = results[0].id

            if cand:
                yield {"type": "function_start", "function": "get_product_details"}
                yield {"type": "function_complete", "function": "get_product_details",
                       "parameters": {"product_id": cand}}
                yield {"type": "complete", "message": None}
                return
            else:
                yield {"type": "response",
                       "message": "Non ho trovato quel prodotto. Puoi ripetere il nome completo?"}
                yield {"type": "complete", "message": None}
                return

        # Security check
        if self.detect_injection(text):
            yield {
                "type": "security_response",
                "message": "Sono qui per aiutarti con lo shopping! Cosa posso mostrarti?",
                "complete": True
            }
            return
        
        # 🔎 Shortcuts basati sul contesto UI (prima di chiamare il modello)
        import re
        from difflib import get_close_matches

        def norm(s: str) -> str:
            return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()

        text_lower = (text or "").lower().strip()
        cp = context.get("current_product")
        visible = context.get("visible_products", [])

        # 0) "Mostra offerte / prodotti in offerta / sconti" → vai su offerte e filtra on_sale
        if any(k in text_lower for k in ["offerte", "in offerta", "sconti", "sconto", "saldi", "promozioni"]):
            # Naviga alla pagina offerte
            yield {"type": "function_complete", "function": "navigate_to_page", "parameters": {"page": "offerte"}}
            # Applica filtro UI on_sale
            yield {"type": "function_complete", "function": "apply_ui_filters", "parameters": {"filters": {"on_sale": True}}}
            # Esegui la ricerca con filtro on_sale
            yield {"type": "function_complete", "function": "search_products", "parameters": {"query": "", "filters": {"on_sale": True}}}
            yield {"type": "complete", "message": None}
            return

        # Intent rapidi: "prodotti", "catalogo", "tutti i prodotti"
        if any(k in text_lower for k in ["tutti i prodotti", "catalogo"]) or text_lower.strip() in ["prodotti"]:
            yield {"type": "function_complete", "function": "navigate_to_page", "parameters": {"page": "prodotti"}}
            yield {"type": "complete", "message": None}
            return

        # 1) Descrizione prodotto: risposta unica, senza streaming e senza domande finali
        if cp and any(k in text_lower for k in [
            "descrizione", "leggi la descrizione", "leggimi la descrizione",
            "dettagli", "più dettagli", "più informazioni", "info prodotto"
        ]):
            from app import data_store
            prod = data_store.get_product_by_id(cp["id"])
            if prod:
                desc = f"{prod.name}. {prod.description_long[:900]}".strip()
                yield {"type": "response", "message": desc}
                yield {"type": "complete", "message": None}
                return

        # 2) “Che prodotto sto guardando?”
        if cp and any(k in text_lower for k in ["che prodotto sto guardando", "che prodotto è", "che sto guardando?"]):
            yield {"type": "response", "message": f"Stai guardando {cp['name']}."}
            yield {"type": "complete", "message": None}
            return

        # 3) “Apri la pagina prodotto <nome>” robusto
        if any(k in text_lower for k in ["apri", "aprimi", "pagina prodotto", "apre"]):
            target_name = None
            m = re.search(r"(apri|aprimi|pagina\s+prodotto)\s+(.*)", text_lower)
            if m:
                target_name = m.group(2).strip()

            from app import data_store
            candidate = None
            # 1) match esatto su visibili
            if target_name and visible:
                vis_names = {p["name"]: p["id"] for p in visible}
                for name, pid in vis_names.items():
                    if norm(name) == norm(target_name):
                        candidate = pid; break
            # 2) fuzzy su visibili
            if not candidate and target_name and visible:
                names = [p["name"] for p in visible]
                match = get_close_matches(target_name, names, n=1, cutoff=0.6)
                if match:
                    for p in visible:
                        if p["name"] == match[0]:
                            candidate = p["id"]; break
            # 3) fallback: cerca nel catalogo
            if not candidate:
                results = data_store.search_products(query=target_name or text_lower, limit=1)
                if results:
                    candidate = results[0].id

            if candidate:
                yield {"type": "function_complete", "function": "get_product_details",
                       "parameters": {"product_id": candidate}}
                yield {"type": "complete", "message": None,
                       "function": "get_product_details",
                       "parameters": {"product_id": candidate}}
                return
            else:
                yield {"type": "response",
                       "message": "Non ho trovato il prodotto da aprire. Puoi ripetere il nome completo?"}
                yield {"type": "complete", "message": None}
                return

        # 4) “Che taglie sono disponibili?” → leggi dalle varianti del prodotto corrente
        if cp and any(k in text_lower for k in ["taglie", "misure", "disponibili"]):
            variants = cp.get("variants") or []
            sizes = sorted({v["size"] for v in variants if v.get("available")})
            if sizes:
                msg = f"Per {cp['name']} sono disponibili le taglie: {', '.join(sizes)}."
                yield {"type": "response", "message": msg}
                yield {"type": "complete", "message": None}
                return

        # Extract preferences
        preferences = await self.extract_user_preferences(text)
        if preferences:
            context["preferences"] = {**context.get("preferences", {}), **preferences}
        
        # If no API key, use fallback
        if not self.client:
            async for chunk in self.enhanced_streaming_fallback(text, context):
                yield chunk
            return
        
        try:
            # Build messages with context
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT}
            ]
            
            # Add context
            current_page = context.get("current_page", "/")
            cart_count = context.get("cart_count", 0)
            current_product = context.get("current_product")
            visible_products = context.get("visible_products", [])
            ui_filters = context.get("ui_filters", {})
            context_info = f"""
                            Contesto attuale:
                            - Pagina: {current_page}
                            - Carrello: {cart_count} articoli
                            - Preferenze: {context.get('preferences', {})}
                            - Prodotto corrente: {current_product}
                            - Prodotti visibili: {visible_products[:12]}
                            - Filtri UI: {ui_filters}
                            """
            messages.append({"role": "system", "content": context_info})
            
            # Add conversation history if available
            if context.get("history"):
                for hist in context["history"][-5:]:
                    messages.append(hist)
            
            # Add user message
            messages.append({"role": "user", "content": text})
            
            # Stream from OpenAI
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                functions=self.functions,
                function_call="auto",
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                stream=True
            )
            
            # Process streaming
            function_call = None
            function_name = None
            function_args = ""
            response_text = ""
            
            emitted_text = False
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if not delta:
                    continue
                
                # Handle function calls
                if delta.function_call:
                    if delta.function_call.name:
                        function_name = delta.function_call.name
                        yield {
                            "type": "function_start",
                            "function": function_name,
                            "message": self.get_quick_response(function_name, text)
                        }
                    
                    if delta.function_call.arguments:
                        function_args += delta.function_call.arguments
                
                # Handle regular content (NO streaming verso il client)
                elif delta.content:
                    response_text += delta.content
            
            # Process complete function call
            if function_name:
                try:
                    args = json.loads(function_args) if function_args else {}
                    
                    # Special handling for search with filters
                    if function_name == "search_products":
                        # 1) naviga alla lista prodotti
                        yield {
                            "type": "function_complete",
                            "function": "navigate_to_page",
                            "parameters": {"page": "prodotti"},
                            "message": None
                        }
                        # 2) applica filtri UI (se presenti)
                        if args.get("filters"):
                            yield {
                                "type": "function_complete",
                                "function": "apply_ui_filters",
                                "parameters": {"filters": args["filters"]},
                                "message": None
                            }
                        # 3) esegui la ricerca
                        yield {
                            "type": "function_complete",
                            "function": "search_products",
                            "parameters": args,
                            "message": None
                        }

                    elif function_name == "get_size_guide":
                        from app import data_store
                        guide = data_store.get_size_guide(args.get("category",""))
                        # Confeziona un testo sintetico in risposta unica
                        text = " ".join([f"{gender}: " + ", ".join([f"{k}={v}" for k,v in table.items()]) + "." for gender, table in guide.items()])
                        yield {"type": "response", "message": f"Guida taglie per {args.get('category','')}: {text}"}
                        yield {"type": "complete", "message": None}
                        return
                        
                    # Validate and enhance function parameters
                    if self.validate_and_enhance_function_call(function_name, args, text):
                        yield {
                            "type": "function_complete",
                            "function": function_name,
                            "parameters": args,
                            "message": response_text or self.generate_response_message(function_name, args)
                        }
                    else:
                        yield {
                            "type": "error",
                            "message": "Non posso eseguire questa operazione. Posso aiutarti con altro?"
                        }
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse function arguments: {function_args}")
                    yield {
                        "type": "error",
                        "message": "Ho avuto un problema. Puoi ripetere?"
                    }
            
            # Invia una sola risposta testuale se non c'è function
            if not function_name and response_text.strip():
                yield {"type": "response", "message": response_text.strip()}
            
            # Complete garantito sempre
            yield {
                "type": "complete",
                "message": None,
                "function": function_name,
                "parameters": json.loads(function_args) if function_args and function_name else None
            }

        except Exception as e:
            logger.error(f"OpenAI streaming error: {e}")
            yield {
                "type": "error",
                "message": "Mi dispiace, ho avuto un problema. Riprova."
            }
            yield {"type": "complete", "message": None}
    
    def get_quick_response(self, function_name: str, text: str) -> str:
        """Get immediate response while processing"""
        responses = {
            "search_products": [
                "Cerco quello che mi hai chiesto...",
                "Controllo il catalogo per te...",
                "Un momento, seleziono i prodotti giusti..."
            ],
            "add_to_cart": [
                "Lo aggiungo subito al carrello...",
                "Un attimo, inserisco il prodotto nel carrello...",
                "Perfetto, lo metto nel carrello..."
            ],
            "navigate_to_page": [
                "Ti porto subito lì...",
                "Arriviamo immediatamente alla pagina giusta...",
                "Un secondo e siamo nella sezione corretta..."
            ],
            "get_cart_summary": [
                "Ecco il tuo carrello...",
                "Ti preparo un riepilogo del carrello...",
                "Vediamo insieme cosa c'è nel carrello..."
            ],
            "clear_cart": [
                "Svuoto il carrello...",
                "Tolgo tutto dal carrello...",
                "Procedo a svuotare il carrello..."
            ],
            "get_recommendations": [
                "Preparo dei suggerimenti...",
                "Ti propongo qualche alternativa interessante...",
                "Un attimo, seleziono alcune idee per te..."
            ],
            "apply_ui_filters": [
                "Applico i filtri...",
                "Aggiorno i filtri come richiesto...",
                "Un istante, imposto i filtri..."
            ],
            "close_conversation": [
                "A presto! È stato un piacere aiutarti.",
                "Grazie a te, alla prossima!",
                "Quando vuoi sono qui, a presto!"
            ],
            "remove_from_cart": [
                "Rimuovo dal carrello...",
                "Tolgo l'articolo dal carrello...",
                "Un momento, elimino quel prodotto dal carrello..."
            ],
            "remove_last_cart_item": [
                "Rimuovo l'ultimo articolo...",
                "Tolgo subito l'ultimo articolo aggiunto...",
                "Via l'ultimo inserimento dal carrello..."
            ],
            "update_cart_quantity": [
                "Modifico la quantità...",
                "Aggiorno la quantità richiesta...",
                "Cambio il numero di pezzi come hai chiesto..."
            ],
            "get_shipping_info": [
                "Recupero le informazioni di spedizione...",
                "Verifico le opzioni di consegna disponibili...",
                "Ti preparo i dettagli sulla spedizione..."
            ]
        }
        defaults = [
            "Un attimo...",
            "Sto lavorando alla tua richiesta...",
            "Dammi solo un secondo..."
        ]
        options = responses.get(function_name)
        if options:
            return random.choice(options)
        return random.choice(defaults)
    
    def validate_and_enhance_function_call(self, function_name: str, parameters: Dict, original_text: str) -> bool:
        """Validate and enhance function parameters"""
        allowed_functions = [f["name"] for f in self.functions]
        if function_name not in allowed_functions:
            logger.warning(f"Undefined function: {function_name}")
            return False
        
        # Enhance parameters based on function
        if function_name == "search_products":
            # Auto-enhance filters from text
            text_lower = original_text.lower()
            
            if not parameters.get("filters"):
                parameters["filters"] = {}
            
            # Auto-detect gender
            if "da uomo" in text_lower or "per uomo" in text_lower:
                parameters["filters"]["gender"] = "uomo"
            elif "da donna" in text_lower or "per donna" in text_lower:
                parameters["filters"]["gender"] = "donna"
            
            # Auto-detect colors
            colors = ["nero", "bianco", "blu", "rosso", "verde", "grigio"]
            for color in colors:
                if color in text_lower:
                    parameters["filters"]["color"] = color
                    break
            
            # Auto-detect sale
            if any(word in text_lower for word in ["offerta", "offerte", "sconto", "saldi"]):
                parameters["filters"]["on_sale"] = True
            
            logger.info(f"Enhanced search: {parameters}")
        
        elif function_name == "add_to_cart":
            # Ensure required parameters
            if "size" not in parameters:
                parameters["size"] = "M"
            if "color" not in parameters:
                parameters["color"] = "nero"
            if "quantity" not in parameters:
                parameters["quantity"] = 1
        
        elif function_name == "navigate_to_page":
            # Map Italian terms
            page_map = {
                "casa": "home",
                "prodotti": "prodotti",
                "articoli": "prodotti",
                "offerte": "offerte",
                "carrello": "carrello",
                "checkout": "checkout"
            }
            
            page = parameters.get("page", "").lower()
            if page in page_map:
                parameters["page"] = page_map[page]
        
        return True
    
    def generate_response_message(self, function_name: str, parameters: Dict) -> str:
        """Generate Italian response message"""
        messages = {
            "search_products": [
                "Ecco i prodotti che ho trovato per te.",
                "Ho selezionato alcune proposte su misura per te.",
                "Dai un'occhiata a questi articoli che potrebbero piacerti."
            ],
            "navigate_to_page": [
                "Ti porto alla pagina {page}.",
                "Apriamo la sezione {page}.",
                "Andiamo subito alla pagina {page}."
            ],
            "add_to_cart": [
                "Ho aggiunto il prodotto al carrello.",
                "Perfetto, il prodotto è nel tuo carrello.",
                "Fatto! Trovi l'articolo nel carrello."
            ],
            "get_cart_summary": [
                "Ecco il riepilogo del tuo carrello.",
                "Questo è lo stato attuale del tuo carrello.",
                "Ti elenco cosa c'è nel carrello."],
            "clear_cart": [
                "Ho svuotato il carrello.",
                "Il carrello ora è vuoto.",
                "Ho rimosso tutti gli articoli dal carrello."
            ],
            "apply_ui_filters": [
                "Ho applicato i filtri richiesti.",
                "Filtri aggiornati come hai chiesto.",
                "Ho impostato i filtri per affinare la ricerca."
            ],
            "close_conversation": [
                "Grazie per aver usato AIVA. A presto!",
                "È stato un piacere assisterti, alla prossima!",
                "Quando vuoi tornare, sono qui. Arrivederci!"
            ],
            "remove_from_cart": [
                "Ho rimosso l'articolo dal carrello.",
                "Quel prodotto non è più nel carrello.",
                "Fatto, ho eliminato l'articolo dal carrello."
            ],
            "remove_last_cart_item": [
                "Ho rimosso l'ultimo articolo aggiunto.",
                "L'ultimo inserimento è stato tolto dal carrello.",
                "Via l'ultimo prodotto che avevi aggiunto."
            ],
            "update_cart_quantity": [
                "Ho aggiornato la quantità.",
                "Quantità modificata come richiesto.",
                "Ho impostato il numero di pezzi desiderato."
            ],
            "get_shipping_info": [
                "Ti condivido i dettagli sulla spedizione.",
                "Ecco tutte le informazioni sulla consegna.",
                "Ti riassumo le opzioni di spedizione disponibili."
            ]
        }

        default_messages = [
            "Operazione completata.",
            "Perfetto, è fatto.",
            "Tutto sistemato."
        ]

        templates = messages.get(function_name, default_messages)
        message_template = random.choice(templates)

        try:
            if function_name == "search_products" and parameters.get("filters"):
                filters = parameters["filters"]
                parts = []
                if filters.get("gender"):
                    parts.append(f"per {filters['gender']}")
                if filters.get("color"):
                    parts.append(f"colore {filters['color']}")
                if filters.get("on_sale"):
                    parts.append("in offerta")

                if parts:
                    return f"{message_template.rstrip('.')} {' '.join(parts)}.".replace('..', '.')

            return message_template.format(**parameters)
        except Exception:
            return message_template
    
    async def enhanced_streaming_fallback(self, text: str, context: Dict) -> AsyncGenerator[Dict, None]:
        """Enhanced fallback for when OpenAI is not available"""
        text_lower = text.lower()
        
        yield {
            "type": "processing",
            "message": "Elaboro la richiesta..."
        }
        
        await asyncio.sleep(0.3)
        
        # Detect intent and respond
        if any(word in text_lower for word in ["cerca", "cerco", "mostra", "mostrami", "voglio", "vorrei"]):
            # Search intent
            query = text_lower.replace("cerca", "").replace("cerco", "").replace("mostra", "").replace("mostrami", "").strip()
            
            filters = {}
            if "da uomo" in text_lower or "per uomo" in text_lower:
                filters["gender"] = "uomo"
            elif "da donna" in text_lower or "per donna" in text_lower:
                filters["gender"] = "donna"
            
            if "offerta" in text_lower or "sconto" in text_lower:
                filters["on_sale"] = True
            
            # Navigate first
            yield {
                "type": "function_complete",
                "function": "navigate_to_page",
                "parameters": {"page": "prodotti"},
                "message": "Ti porto ai prodotti..."
            }
            
            await asyncio.sleep(0.5)
            
            yield {
                "type": "function_complete",
                "function": "search_products",
                "parameters": {"query": query, "filters": filters},
                "message": f"Ecco i {query} che ho trovato!"
            }
            
        elif any(word in text_lower for word in ["carrello", "aggiungi", "metti"]):
            yield {
                "type": "response",
                "message": "Per aggiungere al carrello, dimmi taglia e colore."
            }

        elif any(word in text_lower for word in ["spedizion", "consegna", "tempi di consegna", "costi di spedizione", "costo di spedizione"]):
            yield {
                "type": "function_complete",
                "function": "get_shipping_info",
                "parameters": {},
                "message": "Ecco le informazioni aggiornate sulle spedizioni."
            }

        elif any(word in text_lower for word in ["offerte", "in offerta", "sconti", "sconto", "saldi", "promozioni"]):
            # Vai alla pagina offerte
            yield {"type": "function_complete", "function": "navigate_to_page", "parameters": {"page": "offerte"}, "message": "Ti mostro le nostre offerte!"}
            # Applica filtro on_sale
            yield {"type": "function_complete", "function": "apply_ui_filters", "parameters": {"filters": {"on_sale": True}}, "message": None}
            # Esegui ricerca on_sale
            yield {"type": "function_complete", "function": "search_products", "parameters": {"query": "", "filters": {"on_sale": True}}, "message": None}
            
        elif any(word in text_lower for word in ["chiudi", "basta", "esci", "arrivederci"]):
            yield {
                "type": "function_complete",
                "function": "close_conversation",
                "parameters": {},
                "message": "Grazie per aver usato AIVA. A presto!"
            }
            
        else:
            yield {
                "type": "response",
                "message": "Come posso aiutarti con lo shopping?"
            }
        
        yield {"type": "complete"}

# Singleton instance
ai_service_instance = None

def get_ai_service() -> SecureAIService:
    """Get or create AI service instance"""
    global ai_service_instance
    if ai_service_instance is None:
        ai_service_instance = SecureAIService()
    return ai_service_instance

# Export main function
async def process_voice_command_streaming(text: str, context: Dict) -> AsyncGenerator[Dict[str, Any], None]:
    """Main export for voice command processing"""
    ai_service = get_ai_service()
    async for chunk in ai_service.process_voice_command_streaming(text, context):
        yield chunk