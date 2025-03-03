from botocore.exceptions import ClientError
import boto3


class S3Operations:
    def __init__(self, region_name: str = 'us-east-1', bucket: str = ''):
        self.s3_client = boto3.client('s3')
        self.BUCKET = bucket

    def head_object(self, key: str) -> dict:
        """
        Get metadata about an object in S3 without downloading it

        Args:
            key (str): The key (path) of the object in S3

        Returns:
            dict: Object metadata if successful, None if object doesn't exist
        """
        try:
            response = self.s3_client.head_object(
                Bucket=self.BUCKET,
                Key=key
            )
            response['key'] = key
            return response
        except ClientError:
            return None

    def put_object(self, object_params: dict) -> dict:
        """
        Upload an object to S3

        Args:
            object_params (dict): Parameters for the upload including Key and Body

        Returns:
            dict: Response from S3 if successful

        Raises:
            ClientError: If upload fails
        """
        try:
            object_params['Bucket'] = self.BUCKET
            response = self.s3_client.put_object(**object_params)
            return response
        except Exception as e:
            print(e)
            raise
