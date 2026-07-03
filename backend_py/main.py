import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
import orchestrator
from cleanup import cleanup_old_labs
from config import settings
from routers import auth, challenges, labs, admin

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    orchestrator.cleanup_stale_resources()
    task = asyncio.create_task(cleanup_old_labs())
    logger.info("cyberrange started — http://localhost:8000")
    yield
    task.cancel()


app = FastAPI(title="CyberRange", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(challenges.router)
app.include_router(labs.router)
app.include_router(admin.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
