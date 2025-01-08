import json
from src.utils.aws.s3 import S3Operations
from src.utils.logger import logger

def main():
    """
    Main function to download and process JSON from S3
    """
    try:
        # Initialize S3 client
        s3_client = S3Operations()
        
        # S3 bucket and key details
        bucket_name = "your-bucket-name"  # Replace with your bucket name
        file_key = "path/to/your/file.json"  # Replace with your file path
        
        # Download JSON file from S3
        logger.debug(f"Downloading {file_key} from {bucket_name}")
        response = s3_client.s3_client.get_object(Bucket=bucket_name, Key=file_key)
        file_content = response['Body'].read().decode('utf-8')
        
        # Parse JSON content
        data = json.loads(file_content)
        logger.debug(f"Successfully loaded JSON data: {json.dumps(data, indent=2)}")
        
        # TODO: Add your JSON processing logic here
        return data
        
    except Exception as e:
        logger.error(f"Error in main function: {str(e)}")
        raise

if __name__ == "__main__":
    main()
