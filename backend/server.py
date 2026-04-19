from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import io
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional
from PIL import Image


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (kept for platform consistency; not actively used for samples — client stores locally)
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


class RGBExtractRequest(BaseModel):
    image_base64: str  # raw base64 (no data URI prefix) OR data URI
    # Optional region (normalized 0-1 coords) for averaging a sub-region.
    # If omitted, returns average of entire image.
    x: Optional[float] = None  # 0..1
    y: Optional[float] = None  # 0..1
    region_size: Optional[float] = 0.08  # fraction of min(w,h) for sample window


class RGBExtractResponse(BaseModel):
    r: int
    g: int
    b: int
    hex: str
    sampled_region: Optional[dict] = None
    image_width: int
    image_height: int


def _decode_image(image_b64: str) -> Image.Image:
    if "," in image_b64 and image_b64.strip().startswith("data:"):
        image_b64 = image_b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        return img
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")


@api_router.get("/")
async def root():
    return {"message": "Chemistry RGB Analyzer API"}


@api_router.post("/extract-rgb", response_model=RGBExtractResponse)
async def extract_rgb(req: RGBExtractRequest):
    img = _decode_image(req.image_base64)
    w, h = img.size

    sampled_region = None
    if req.x is not None and req.y is not None:
        # Sample a small square region around (x,y)
        rs = max(0.01, min(0.5, req.region_size or 0.08))
        box_side = int(min(w, h) * rs)
        box_side = max(4, box_side)
        cx = int(max(0, min(w - 1, req.x * w)))
        cy = int(max(0, min(h - 1, req.y * h)))
        half = box_side // 2
        left = max(0, cx - half)
        upper = max(0, cy - half)
        right = min(w, cx + half)
        lower = min(h, cy + half)
        region = img.crop((left, upper, right, lower))
        sampled_region = {
            "left": left, "upper": upper, "right": right, "lower": lower,
            "center_x": cx, "center_y": cy
        }
        target = region
    else:
        # Downscale to speed up average
        target = img.resize((min(w, 256), min(h, 256)))

    # Average RGB via a single pixel resize trick
    pixel = target.resize((1, 1)).getpixel((0, 0))
    r, g, b = int(pixel[0]), int(pixel[1]), int(pixel[2])
    hex_code = "#{:02X}{:02X}{:02X}".format(r, g, b)

    return RGBExtractResponse(
        r=r, g=g, b=b, hex=hex_code,
        sampled_region=sampled_region,
        image_width=w, image_height=h,
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
