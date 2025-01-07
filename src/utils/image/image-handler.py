import hashlib
import hmac
from urllib.parse import urlparse
import aiohttp
import asyncio
from typing import Dict, List, Union, Optional
import io

class ImageHandler:
    ORIGINAL_PREFIX = 'original'
    IMAGE_RESIZES = [
        {"width": 70, "height": 70, "crop": True},
        {"width": 125, "height": 125, "crop": True},
        {"width": 250, "height": 250, "crop": True},
        {"width": 360, "height": 240, "crop": True},
        {"width": 720, "height": 480, "crop": True},
    ]

    def __init__(self):
        self.image_service = image_processor.ImageProcessor()
        self.s3_service = s3_operations.S3Operations()
        self.timeout = aiohttp.ClientTimeout(total=60)  # 60 second timeout

    def get_resize_key(self, key: str, resize: Dict) -> str:
        """Generate the S3 key for a resized image"""
        return f"{resize['width']}/{resize['height']}/{key}"

    def format_image_url(self, image_url: str) -> str:
        """Ensure the image URL has a proper protocol"""
        if not image_url.startswith(('http://', 'https://')):
            if image_url.startswith('//'):
                return f'http:{image_url}'
            elif image_url.startswith('://'):
                return f'http{image_url}'
            else:
                return f'http://{image_url}'
        return image_url

    async def fetch_image(self, url: str) -> Optional[tuple]:
        """Fetch image from URL with retry for protocol switch"""
        try:
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        return (
                            await response.read(),
                            response.headers.get('content-type')
                        )
                    elif response.status == 404:
                        # Try switching protocol
                        new_url = url.replace('https://', 'http://') if url.startswith('https') else url.replace('http://', 'https://')
                        print(f'Trying different protocol: {new_url}')
                        async with session.get(new_url) as retry_response:
                            if retry_response.status == 200:
                                return (
                                    await retry_response.read(),
                                    retry_response.headers.get('content-type')
                                )
                    print(f"Couldn't get {url} - status code: {response.status}")
                    return None
        except asyncio.TimeoutError:
            print(f"Timeout fetching {url}")
            return None
        except Exception as e:
            print(f"Error fetching {url}: {str(e)}")
            return None

    async def handler(self, record: Dict) -> bool:
        """
        Main handler for processing images
        
        Args:
            record: Dictionary containing image information
            
        Returns:
            bool: True if processing successful, False otherwise
        """
        try:
            # Get image URL and determine type
            image_url = record.get('image', {}).get('url') or record.get('imageUrl')
            if not image_url:
                print("No image URL provided")
                return False

            # Infer image type
            type_match = image_url.split('.')[-1].split('?')[0].lower()
            image_type = type_match if type_match in ['jpg', 'png'] else 'jpg'

            # Generate hash
            if record.get('image', {}).get('urlHash'):
                hashed_url = record['image']['urlHash']
            else:
                hash_key = record.get('hashKey', 'default_key').encode('utf-8')
                hashed_url = hmac.new(
                    hash_key,
                    image_url.encode('utf-8'),
                    hashlib.sha1
                ).hexdigest()

            # Check if image already exists
            first_resize_key = self.get_resize_key(hashed_url, self.IMAGE_RESIZES[0])
            if await self.s3_service.head_object(first_resize_key):
                print(f"Skipping {image_url} because {hashed_url} already exists")
                return True

            print(f"Processing {image_url}")
            
            # Fetch image
            image_url = self.format_image_url(image_url)
            fetch_result = await self.fetch_image(image_url)
            if not fetch_result:
                return False

            image_data, content_type = fetch_result

            # Upload original
            await self.s3_service.put_object({
                'Key': f"{self.ORIGINAL_PREFIX}/{hashed_url}",
                'Body': image_data,
                'CacheControl': 'max-age=31536000',
                'ContentType': content_type
            })

            # Get image size
            size = await self.image_service.get_image_size(io.BytesIO(image_data))

            # Process all sizes concurrently
            resize_tasks = [
                self.image_service.resize(
                    io.BytesIO(image_data),
                    image_type,
                    size,
                    image_resize,
                    hashed_url,
                    content_type
                )
                for image_resize in self.IMAGE_RESIZES
            ]
            await asyncio.gather(*resize_tasks)

            return True

        except Exception as err:
            print(f"Error processing {image_url}: {str(err)}")
            return False
