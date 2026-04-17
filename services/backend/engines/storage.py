import uuid
from datetime import datetime
from fastapi import UploadFile
import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pathlib import Path

from config import get_settings

settings = get_settings()
_LOCAL_UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "uploads"


def _get_s3_client():
    if not settings.s3_bucket_name or not settings.aws_access_key_id or not settings.aws_secret_access_key:
        return None
    return boto3.client(
        "s3",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )


def _save_local_fallback(content: bytes, key: str) -> str:
    local_path = _LOCAL_UPLOAD_ROOT / key
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(content)
    return f"local://{key}"


async def upload_evidence_to_s3(file: UploadFile, folder: str) -> str:
    """
    Upload evidence media to S3 and return public URL.
    Falls back to local storage when S3 is not configured/reachable.
    """
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[1].lower()
    key = f"{folder}/{datetime.utcnow().strftime('%Y/%m/%d')}/{uuid.uuid4()}{ext}"

    content = await file.read()
    content_type = file.content_type or "application/octet-stream"

    s3 = _get_s3_client()
    if s3 is None:
        return _save_local_fallback(content, key)

    try:
        s3.put_object(
            Bucket=settings.s3_bucket_name,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError):
        return _save_local_fallback(content, key)

    return f"https://{settings.s3_bucket_name}.s3.{settings.aws_region}.amazonaws.com/{key}"
