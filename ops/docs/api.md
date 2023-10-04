Certainly, I've updated the API documentation to reflect that the runner execution result is stored in the `res` field and is base64 encoded. Here are the updated API docs:

### API Version: v1

### Resource: Runner

#### Get All Runners
- **URL:** `/api/v1/runner/`
- **Method:** `GET`
- **Description:** Retrieve information about all available runners on the worker VM/Server.
- **Request Body:** None
- **Query Parameters:**
  - `detail` (optional): If included, detailed information about each runner will be provided.
- **Responses:**
  - `200 OK`: Returns a JSON array containing information about all runners.
    - Example Response:
      ```json
      {
        "memory": {
          "total": 4096,
          "available": 2048,
          "used": 2048,
          "percent": 50
        },
        "runners": [
          {
            "name": "runner1",
            "inUse": false,
            "details": {
              // Runner details if 'detail' query parameter is included
            }
          },
          {
            "name": "runner2",
            "inUse": true,
            "details": {
              // Runner details if 'detail' query parameter is included
            }
          },
          // Additional runners...
        ]
      }
      ```
  - `500 Internal Server Error`: If there is an internal server error.

#### Create a New Runner
- **URL:** `/api/v1/runner/`
- **Method:** `POST`
- **Description:** Create a new runner and execute code on it.
- **Request Body:**
  - `code` (required): The code to be executed on the new runner.
- **Query Parameters:**
  - `time` (optional): Maximum execution time for the code (in seconds).
- **Responses:**
  - `200 OK`: Returns the result of code execution on the new runner in base64 encoded format under the `res` field.
    - Example Response:
      ```json
      {
        "res": "base64_encoded_result"
      }
      ```
  - `400 Bad Request`: If the request is missing the `code` parameter.
  - `503 Service Unavailable`: If there are no available runners at the moment (as defined by `errors.runnerNotAvailable`).
  - `498 Request Timeout`: If the code execution exceeds the specified time limit (as defined by `errors.runnerTimedOut`).
  - `500 Internal Server Error`: If there is an internal server error.

#### Create a New Runner (Alternative)
- **URL:** `/api/v1/runner/new`
- **Method:** `POST`
- **Description:** Create a new runner and execute code on it. This endpoint is an alternative to the previous one.
- **Request Body:**
  - `code` (required): The code to be executed on the new runner.
- **Responses:**
  - `200 OK`: Returns the result of code execution on the new runner in base64 encoded format under the `res` field along with the runner's name.
    - Example Response:
      ```json
      {
        "runner": "runner3",
        "res": "base64_encoded_result"
      }
      ```
  - `400 Bad Request`: If the request is missing the `code` parameter.
  - `503 Service Unavailable`: If there are no available runners at the moment (as defined by `errors.runnerNotAvailable`).
  - `498 Request Timeout`: If the code execution exceeds the specified time limit (as defined by `errors.runnerTimedOut`).
  - `500 Internal Server Error`: If there is an internal server error.

#### Execute Code on a Specific Runner
- **URL:** `/api/v1/runner/:runner`
- **Method:** `POST`
- **Description:** Execute code on a specific runner identified by its name.
- **Request Body:**
  - `code` (required): The code to be executed on the specified runner.
- **Responses:**
  - `200 OK`: Returns the result of code execution on the specified runner in base64 encoded format under the `res` field.
    - Example Response:
      ```json
      {
        "res": "base64_encoded_result"
      }
      ```
  - `404 Not Found`: If the specified runner does not exist (as defined by `errors.runnerNotFound`).
  - `500 Internal Server Error`: If there is an internal server error.

#### Get Runner Information
- **URL:** `/api/v1/runner/:runner`
- **Method:** `GET`
- **Description:** Retrieve information about a specific runner identified by its name.
- **Responses:**
  - `200 OK`: Returns detailed information about the specified runner.
    - Example Response:
      ```json
      {
        // Runner details
      }
      ```
  - `404 Not Found`: If the specified runner does not exist (as defined by `errors.runnerNotFound`).
  - `500 Internal Server Error`: If there is an internal server error.

#### Delete Runner
- **URL:** `/api/v1/runner/:runner`
- **Method:** `DELETE`
- **Description:** Delete a specific runner identified by its name.
- **Responses:**
  - `200 OK`: Returns a success message indicating that the runner was successfully deleted.
    - Example Response:
      ```json
      {
        "res": "success"
      }
      ```
  - `404 Not Found`: If the specified runner does not exist (as defined by `errors.runnerNotFound`).
  - `500 Internal Server Error`: If there is an internal server error.

This API allows you to manage runners on the worker VM/Server, execute code on them, and retrieve information about their status and usage. It also includes appropriate error handling based on the `CodeLandWorker` class's error definitions, with runner execution results stored in the `res` field in base64 encoded format.