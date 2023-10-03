Certainly! Here's an API documentation outline based on the CodeLandWorker class and how it works with the API:

# CodeLand API Documentation

## Introduction

The CodeLand API provides endpoints for managing and executing code on CodeLand workers, which are virtual machines (VMs) used to run code.

### Base URL

```
https://your-api-base-url.com/codeland
```

## Authentication

Authentication is required to access the CodeLand API. Make sure to include the necessary authentication headers in your requests.

## Endpoints

### 1. Execute Code

#### Endpoint: `/run`

- **Method:** POST

This endpoint allows you to execute code on a CodeLand runner.

**Request Body:**

```json
{
  "code": "Your code here"
}
```

- `code` (string, required): The code you want to execute on a runner.

**Query Parameters:**

- `time` (integer, optional): The maximum execution time for the code in seconds. If not provided, the default timeout is used.

**Response:**

- `200 OK`: The code execution was successful, and the result is returned in JSON format.

```json
{
  "res": "Result of code execution"
}
```

- `503 Service Unavailable`: No fresh runners are available at the moment. Please try again later.

- `498 Invalid Token`: The code execution time exceeded the specified timeout.

- `400 Bad Request`: The code execution on the runner failed for unknown reasons.

- `404 Not Found`: The requested runner could not be found.

### 2. Execute Code on a New Runner

#### Endpoint: `/run/new`

- **Method:** POST

This endpoint allows you to execute code on a newly created CodeLand runner.

**Request Body:**

```json
{
  "code": "Your code here"
}
```

- `code` (string, required): The code you want to execute on the new runner.

**Response:**

- `200 OK`: The code execution was successful, and the result is returned in JSON format.

```json
{
  "res": "Result of code execution",
  "runner": "Runner name"
}
```

### 3. Execute Code on a Specific Runner

#### Endpoint: `/run/:runner`

- **Method:** POST

This endpoint allows you to execute code on a specific CodeLand runner identified by its name.

**Request Body:**

```json
{
  "code": "Your code here"
}
```

- `code` (string, required): The code you want to execute on the specified runner.

**Response:**

- `200 OK`: The code execution was successful, and the result is returned in JSON format.

```json
{
  "res": "Result of code execution",
  "runner": "Runner name"
}
```

- `404 Not Found`: The requested runner could not be found.

### 4. Get Runner Information

#### Endpoint: `/run/:runner`

- **Method:** GET

This endpoint allows you to retrieve information about a specific CodeLand runner identified by its name.

**Response:**

- `200 OK`: The runner information is returned in JSON format.

```json
{
  "runner": "Runner name",
  "other_info": "Other runner information"
}
```

- `404 Not Found`: The requested runner could not be found.

### 5. Delete Runner

#### Endpoint: `/run/:runner`

- **Method:** DELETE

This endpoint allows you to delete a specific CodeLand runner identified by its name.

**Response:**

- `200 OK`: The runner was successfully deleted.

- `404 Not Found`: The requested runner could not be found.

## Error Handling

The API may return the following error responses:

- `503 Service Unavailable`: No fresh runners are available at the moment. Please try again later.

- `498 Invalid Token`: The code execution time exceeded the specified timeout.

- `400 Bad Request`: The code execution on the runner failed for unknown reasons.

- `404 Not Found`: The requested runner could not be found.

## Example Usage

Here's an example of how to use the CodeLand API to execute code:

```bash
# Execute code on a new runner
curl -X POST https://your-api-base-url.com/codeland/run/new -H "Authorization: Bearer YOUR_TOKEN" -d '{"code": "Your code here"}'
```

## Conclusion

The CodeLand API allows you to manage and execute code on CodeLand runners efficiently. Please refer to the endpoint descriptions for specific details on each operation.