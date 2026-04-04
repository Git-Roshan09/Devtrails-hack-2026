from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import uuid
import os

from database import get_db
from models import Rider, UserRole
from config import get_settings

router = APIRouter()
settings = get_settings()

# Firebase Admin SDK - only initialize if credentials exist
FIREBASE_ADMIN_INITIALIZED = False
try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth, credentials
    
    firebase_admin.get_app()
    FIREBASE_ADMIN_INITIALIZED = True
except ValueError:
    # App not initialized yet
    cred_path = settings.firebase_service_account_path
    if cred_path and os.path.exists(cred_path):
        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            FIREBASE_ADMIN_INITIALIZED = True
            print(f"✅ Firebase Admin SDK initialized with {cred_path}")
        except Exception as e:
            print(f"Warning: Firebase Admin init failed: {e}")
    else:
        print("Warning: Firebase Admin SDK not configured (no service account). Token verification will be skipped.")
except ImportError:
    print("Warning: firebase-admin not installed")


class SyncRequest(BaseModel):
    firebase_token: str
    name: str
    phone: str


class SyncResponse(BaseModel):
    id: uuid.UUID
    firebase_uid: str
    role: UserRole
    name: str

# ─── Auth Dependency ───────────────────────────────────────────────────

async def verify_token(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.split("Bearer ")[1]
    
    if FIREBASE_ADMIN_INITIALIZED:
        try:
            from firebase_admin import auth as firebase_auth
            decoded_token = firebase_auth.verify_id_token(token)
            return decoded_token
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    else:
        # Hackathon mode: extract UID from token without full verification
        # In production, always use proper Firebase Admin verification
        import base64
        import json
        try:
            # JWT has 3 parts: header.payload.signature
            payload = token.split('.')[1]
            # Add padding if needed
            payload += '=' * (4 - len(payload) % 4)
            decoded = json.loads(base64.urlsafe_b64decode(payload))
            return {"uid": decoded.get("user_id") or decoded.get("sub")}
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token decode failed: {e}")

async def get_current_user(
    decoded_token: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db)
) -> Rider:
    firebase_uid = decoded_token.get("uid")
    result = await db.execute(select(Rider).where(Rider.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found in Postgres")
    return user

async def get_current_admin(user: Rider = Depends(get_current_user)) -> Rider:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── Auth Sync ────────────────────────────────────────────────────────

@router.post("/sync", response_model=SyncResponse)
async def sync_firebase_user(data: SyncRequest, db: AsyncSession = Depends(get_db)):
    """
    Called by the frontend immediately after a successful Firebase Registration/Login.
    Verifies the token, and creates a Postgres record if the user doesn't exist.
    """
    firebase_uid = None
    
    if FIREBASE_ADMIN_INITIALIZED:
        try:
            from firebase_admin import auth as firebase_auth
            decoded_token = firebase_auth.verify_id_token(data.firebase_token)
            firebase_uid = decoded_token.get("uid")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")
    else:
        # Hackathon mode: decode JWT without full verification
        import base64
        import json
        try:
            payload = data.firebase_token.split('.')[1]
            payload += '=' * (4 - len(payload) % 4)
            decoded = json.loads(base64.urlsafe_b64decode(payload))
            firebase_uid = decoded.get("user_id") or decoded.get("sub")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token decode failed: {e}")
    
    if not firebase_uid:
        raise HTTPException(status_code=401, detail="Could not extract user ID from token")
    
    # Check if user already exists
    result = await db.execute(select(Rider).where(Rider.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if not user:
        # If not by UID, check if phone already exists (cross-platform sync)
        result = await db.execute(select(Rider).where(Rider.phone == data.phone))
        user = result.scalar_one_or_none()
        
        if user:
            # Update existing user to link Firebase UID
            user.firebase_uid = firebase_uid
        else:
            # Complete new registration
            user = Rider(
                firebase_uid=firebase_uid,
                name=data.name,
                phone=data.phone,
                role=UserRole.rider
            )
            db.add(user)
        
        await db.commit()
        await db.refresh(user)
    
    return user
