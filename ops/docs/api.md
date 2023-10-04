Thank you for the feedback. I'll add back the samples and include the missing runner details in the API documentation. Here's the updated documentation:

---

# CodeLand API Documentation

## Overview

The CodeLand API allows you to manage and execute code on remote runners. This documentation outlines the available API endpoints and their functionality.

## Base URL

The base URL for all API endpoints is `/api/v1/runner`.

## Routes

### Execute Code Once on a Runner

- **POST `/api/v1/runner`**

  Execute a code snippet once on a runner.

  **Request Body:**
  - `code` (string): The code snippet to execute.

  **Query Parameters:**
  - `time` (integer, optional): Maximum execution time in seconds (default is 60 seconds).

  **Response:**
  - `res` (string): The result of the code execution in base64 format.

  **Error Codes:**
  - 503: RunnerNotAvailable - No fresh runners are available at this time.
  - 498: runnerTimedOut - The execution time exceeded the specified timeout.
  - 400: runnerExecutionFailed - Execution on the runner failed for unknown reasons.

  This route allows you to execute code quickly on a runner without reusing the runner for subsequent requests. The runner is destroyed after execution to ensure a fresh runner for each request.

  **Sample Request:**
  ```json
  {
    "code": "console.log('Hello, CodeLand!');"
  }
  ```

  **Sample Response:**
  ```json
  {
    "res": "SGVsbG8sIENvZGVMYW5kIQ=="
  }
  ```

### Retrieve Runner Information

- **GET `/api/v1/runner`**

  Retrieve information about available runners.

  **Query Parameters:**
  - `detail` (boolean, optional): Include detailed information about each runner (default is false).

  **Response:**
  - `memory` (object): Memory information of the worker server.
  - `runners` (array of objects): List of available runners with their names and usage status.

  **Error Codes:**
  - 503: RunnerNotAvailable - No fresh runners are available at this time.

  **Sample Request:**
  ```http
  GET /api/v1/runner
  ```

  **Sample Response:**
  ```json
  {
    "memory": {
      "total": "4.86 KiB",
      "available": "4.75 KiB",
      "used": "0.11 KiB",
      "percent": 2.27
    },
    "runners": [
      {
        "name": "runner-1",
        "inUse": false,
        "state": "RUNNING",
        "pid": "1172779",
        "ip": "172.16.118.41",
        "memory": "44.23 MiB",
        "kmem": "8.36 MiB",
        "link": "veth1001_8xz8",
        "tx": "1.29 KiB",
        "rx": "3.57 KiB",
        "total": "4.86 KiB"
      },
      {
        "name": "runner-2",
        "inUse": true
      }
    ]
  }
  ```

### Create a New Runner

- **POST `/api/v1/runner/new`**

  Create a new runner.

  **Request Body:**
  - `code` (string): Initial code to execute on the new runner.

  **Response:**
  - `res` (string): The result of the initial code execution in base64 format.
  - `runner` (string): The name of the new runner.

  **Error Codes:**
  - 503: RunnerNotAvailable - No fresh runners are available at this time.

  **Sample Request:**
  ```json
  {
    "code": "console.log('Initializing new runner');"
  }
  ```

  **Sample Response:**
  ```json
  {
    "res": "SW5pdGlhbGl6aW5nIG5ldyBydW5uZXI="
    "runner": "runner-3"
  }
  ```

### Retrieve Runner Information by Name

- **GET `/api/v1/runner/:runner`**

  Retrieve information about a specific runner by name.

  **Response:**
  - Runner information.

  **Error Codes:**
  - 503: RunnerNotAvailable - No fresh runners are available at this time.
  - 404: runnerNotFound - The requested runner does not exist.

  **Sample Request:**
  ```http
  GET /api/v1/runner/runner-1
  ```

  **Sample Response:**
  ```json
  {
    "name": "runner-1",
    "state": "RUNNING",
    "pid": "1172779",
    "ip": "172.16.118.41",
    "memory": "44.23 MiB",
    "kmem": "8.36 MiB",
    "link": "veth1001_8xz8",
    "tx": "1.29 KiB",
    "rx": "3.57 KiB",
    "total": "4.86 KiB"
  }
  ```

### Delete a Runner

- **DELETE `/api/v1/runner/:runner`**

  Delete a specific runner by name.

  **Response:**
  - `{ "res": "success" }`

  **Error Codes:**
  - 503: RunnerNotAvailable - No fresh runners are available at this time.
  - 404: runnerNotFound - The requested runner does not exist.

  **Sample Request:**
  ```http
  DELETE /api/v1/runner/runner-3
  ```

  **Sample Response:**
  ```json
  {
    "res": "success"
  }
  ```

---

I've added the samples and included the missing runner details in the API documentation. Please review it and let me know if there are any further adjustments or clarifications needed.