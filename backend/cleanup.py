import asyncio
import logging
import database
import orchestrator
from config import settings

logger = logging.getLogger(__name__)


async def cleanup_old_labs():
    while True:
        try:
            old_instances = database.get_old_running_instances(settings.lab_max_age_seconds)

            if old_instances:
                logger.info("cleanup: found %d old labs to destroy", len(old_instances))

            for instance in old_instances:
                logger.info("cleanup: destroying instance %d (user %d)", instance["id"], instance["user_id"])
                orchestrator.destroy_lab_by_instance_id(instance["id"])

        except Exception as e:
            logger.error("cleanup error: %s", e)

        await asyncio.sleep(300)
