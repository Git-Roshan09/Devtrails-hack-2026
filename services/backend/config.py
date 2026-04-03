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

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "gigachad_neo4j"

    # AI APIs
    groq_api_key: str
    nixtla_api_key: str = ""

    # External Data APIs
    openweather_api_key: str
    tomtom_api_key: str

    # Payments
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""

    # Twilio / WhatsApp
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_number: str = "whatsapp:+14155238886"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
