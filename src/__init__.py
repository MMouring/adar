import json
from utils.logger import logger


def main():
    """
    Main function to read and process local JSON file
    """
    try:
        # Local JSON file path
        json_file_path = "../test/1128559.json"

        # Read and parse JSON file
        logger.debug(f"Reading JSON file from: {json_file_path}")
        with open(json_file_path, 'r') as file:
            data = json.load(file)
            
        logger.debug(f"Successfully loaded JSON data: {json.dumps(data, indent=2)}")

        # TODO: Add your JSON processing logic here
        return data

    except FileNotFoundError:
        logger.error(f"JSON file not found at: {json_file_path}")
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON file: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in main function: {str(e)}")
        raise


if __name__ == "__main__":
    main()
