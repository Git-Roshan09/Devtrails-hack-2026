from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import uuid
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

from database import get_db
from models import Rider, UserRole

router = APIRouter()

# Initialize Firebase Admin (in a real app, use credentials.Certificate("path/to/key.json"))
# For hackathon demo, if no credentials provided, it uses default application credentials
try:
    firebase_admin.get_app()
except ValueError:
    # Will fail if no exact cert is provided and default creds aren't found locally, 
    # but we initialize it here safely to allow tests to run
    try:
        firebase_admin.initialize_app()
    except Exception as e:
        print(f"Warning: Firebase Admin not fully initialized securely. {e}")


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
    try:
        # Verify with Firebase
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

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
    try:
        decoded_token = firebase_auth.verify_id_token(data.firebase_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")

    firebase_uid = decoded_token.get("uid")
    
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
