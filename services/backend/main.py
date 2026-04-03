from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

from database import engine, Base
from config import get_settings
from api import riders, policies, telemetry, disruptions, claims, admin, auth

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables if not exist (dev only; use Alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ GigaChad backend started — DB tables ready")
    yield
    # Shutdown
    await engine.dispose()
    print("🛑 GigaChad backend shutting down")


app = FastAPI(
    title="GigaChad API",
    description="AI-Powered Parametric Micro-Insurance for Chennai Q-Commerce Riders",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────
app.include_router(auth.router,        prefix="/api/auth",        tags=["Auth"])
app.include_router(riders.router,      prefix="/api/riders",      tags=["Riders"])
app.include_router(policies.router,    prefix="/api/policies",    tags=["Policies"])
app.include_router(telemetry.router,   prefix="/api/telemetry",   tags=["Telemetry"])
app.include_router(disruptions.router, prefix="/api/disruptions", tags=["Disruptions"])
app.include_router(claims.router,      prefix="/api/claims",      tags=["Claims"])
app.include_router(admin.router,       prefix="/api/admin",       tags=["Admin"])


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "service": "GigaChad API", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
