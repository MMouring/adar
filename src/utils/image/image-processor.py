import io
from typing import Dict, Union, BinaryIO

from PIL import Image

from src.utils.aws import s3


class ImageProcessor:
    def __init__(self):
        self.s3_service = s3.S3Operations()

    def get_image_size(self, image: Union[bytes, BinaryIO]) -> Dict[str, int]:
        """
        Get the dimensions of an image

        Args:
            image: Image data as bytes or file-like object

        Returns:
            dict: Contains width and height of the image
        """
        try:
            with Image.open(image) as img:
                return {"width": img.width, "height": img.height}
        except Exception as err:
            raise err

    def resize_image(
        self,
        image: Union[bytes, BinaryIO],
        image_type: str,
        scaled_width: int,
        scaled_height: int,
        width: int,
        height: int
    ) -> bytes:
        """
        Resize and crop an image to specified dimensions

        Args:
            image: Source image
            image_type: Format of the image (e.g., 'JPEG', 'PNG')
            scaled_width: Width to scale to before cropping
            scaled_height: Height to scale to before cropping
            width: Final width after cropping
            height: Final height after cropping

        Returns:
            bytes: Processed image as bytes
        """
        try:
            with Image.open(image) as img:
                # Resize the image
                img = img.resize((int(scaled_width), int(
                    scaled_height)), Image.Resampling.LANCZOS)

                # Calculate crop box for center crop
                left = (scaled_width - width) / 2
                top = (scaled_height - height) / 2
                right = (scaled_width + width) / 2
                bottom = (scaled_height + height) / 2

                # Crop the image
                img = img.crop((left, top, right, bottom))

                # Save to bytes buffer
                buffer = io.BytesIO()
                img.save(buffer, format=image_type)
                return buffer.getvalue()
        except Exception as err:
            raise err

    async def resize(
        self,
        image: Union[bytes, BinaryIO],
        image_type: str,
        image_size: Dict[str, int],
        image_resize: Dict[str, Union[int, bool]],
        image_url: str,
        content_type: str
    ) -> dict:
        """
        Resize an image and upload to S3

        Args:
            image: Source image
            image_type: Format of the image
            image_size: Original image dimensions
            image_resize: Target dimensions and crop flag
            image_url: URL path for the resized image
            content_type: MIME type of the image

        Returns:
            dict: Response from S3 upload
        """
        width = image_resize['width']
        height = image_resize['height']

        # Calculate scaling factor
        if image_resize.get('crop', False):
            scaling_factor = max(
                width / image_size['width'],
                height / image_size['height']
            )
        else:
            scaling_factor = min(
                width / image_size['width'],
                height / image_size['height']
            )

        scaled_width = scaling_factor * image_size['width']
        scaled_height = scaling_factor * image_size['height']

        if not image_resize.get('crop', False):
            width = scaled_width
            height = scaled_height

        # Transform the image buffer in memory
        buffer = self.resize_image(
            image,
            image_type,
            scaled_width,
            scaled_height,
            image_resize['width'],
            image_resize['height']
        )

        # Upload to S3
        return self.s3_service.put_object({
            'Key': f"{int(width)}/{int(height)}/{image_url}",
            'Body': buffer,
            'CacheControl': 'max-age=2592000',
            'ContentType': content_type
        })
