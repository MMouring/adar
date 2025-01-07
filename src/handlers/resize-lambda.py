import json
import asyncio
import hashlib
import hmac
from typing import Dict, List

from src.utils.image import image_handler

class ConcurrencyLimiter:
    """Simple semaphore-based concurrency limiter"""
    def __init__(self, limit: int):
        self.semaphore = asyncio.Semaphore(limit)
    
    async def run(self, func, *args, **kwargs):
        async with self.semaphore:
            return await func(*args, **kwargs)

class LambdaHandler:
    RETRY_LIMIT = 25

    async def process_image(self, limiter: ConcurrencyLimiter, record: Dict, cache_key: str) -> bool:
        """Process a single image with concurrency control"""
        if record.get('success'):
            return True

        # Generate cache key if not provided
        url_hash = record.get('cacheKey')
        if not url_hash:
            url_hash = hmac.new(
                cache_key.encode('utf-8'),
                record['url'].encode('utf-8'),
                hashlib.sha1
            ).hexdigest()

        try:
            result = await limiter.run(
                image_handler.ImageHandler().handler,
                {
                    'image': {
                        'url': record['url'],
                        'urlHash': url_hash
                    }
                }
            )
            if result:
                record['success'] = True
                return True
            return False
        except Exception as err:
            print(f"Error processing image {record['url']}: {str(err)}")
            return False

    async def handle(self, event: Dict) -> Dict:
        """
        Main Lambda handler function
        
        Args:
            event: Lambda event containing images to process
            
        Returns:
            Dict: Updated event with processing results
        """
        print(f"Received event: {json.dumps(event)}")
        
        has_failure = False
        limiter = ConcurrencyLimiter(event.get('concurrency', 10))
        
        try:
            # Process all images concurrently with rate limiting
            results = await asyncio.gather(*[
                self.process_image(limiter, record, event['cacheKey'])
                for record in event['images']
            ])
            
            # Check for any failures
            has_failure = not all(results)
            
        except Exception as err:
            print(f"Error in batch processing: {str(err)}")
            has_failure = True
        
        # Update event based on results
        if has_failure:
            event['failures'] = (event.get('failures', 0) + 1)
            event['retryWait'] = 5 * event['failures']
        else:
            event.pop('failures', None)
            event.pop('retryWait', None)
        
        print(f"Returning event: {json.dumps(event)}")
        return event

# Create handler instance
lambda_handler = LambdaHandler()

# AWS Lambda handler function
def handler(event: Dict, context=None) -> Dict:
    """AWS Lambda entry point"""
    return asyncio.run(lambda_handler.handle(event))
