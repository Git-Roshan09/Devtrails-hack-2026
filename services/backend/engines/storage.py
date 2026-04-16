import uuid
from datetime import datetime
from fastapi import UploadFile, HTTPException
import boto3
from botocore.exceptions import BotoCoreError, ClientError

from config import get_settings

settings = get_settings()


def _get_s3_client():
    if not settings.s3_bucket_name:
        return None
    return boto3.client(
        "s3",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )


async def upload_evidence_to_s3(file: UploadFile, folder: str) -> str:
    """
    Upload evidence media to S3 and return public URL.
    """
    if not settings.s3_bucket_name:
        raise HTTPException(status_code=500, detail="S3 bucket is not configured")

    s3 = _get_s3_client()
    if s3 is None:
        raise HTTPException(status_code=500, detail="S3 client initialization failed")

    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[1].lower()
    key = f"{folder}/{datetime.utcnow().strftime('%Y/%m/%d')}/{uuid.uuid4()}{ext}"

    content = await file.read()
    content_type = file.content_type or "application/octet-stream"

    try:
        s3.put_object(
            Bucket=settings.s3_bucket_name,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {str(e)}")

    return f"https://{settings.s3_bucket_name}.s3.{settings.aws_region}.amazonaws.com/{key}"
