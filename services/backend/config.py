from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_env: str = "development"
    secret_key: str = "change_me"

    # Database
    database_url: str
    supabase_url: str = ""
    supabase_key: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Neo4j (Graph Database for Fraud Detection)
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "gigachad_neo4j"

    # ── AI & LLM APIs ────────────────────────────────────────
    groq_api_key: str
    nixtla_api_key: str = ""
    openai_api_key: str = ""  # For embeddings fallback

    # ── Weather & Climate APIs ───────────────────────────────
    openweather_api_key: str
    tomtom_api_key: str
    tomorrow_io_api_key: str = ""  # Enhanced weather predictions
    imd_api_key: str = ""  # Indian Meteorological Department

    # ── News & Social Monitoring ─────────────────────────────
    twitter_bearer_token: str = ""  # X/Twitter API v2
    newsapi_key: str = ""  # NewsAPI.org for global news
    
    # ── Payments (Razorpay X for UPI Payouts) ────────────────
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_account_number: str = ""  # Razorpay X account

    # ── Twilio / WhatsApp ────────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_number: str = "whatsapp:+14155238886"

    # ── Celery / Background Tasks ────────────────────────────
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"

    # ── Chennai-specific Configuration ───────────────────────
    chennai_lat: float = 13.0827
    chennai_lng: float = 80.2707
    h3_resolution: int = 9  # ~0.1 km² hex cells for hyper-local

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
