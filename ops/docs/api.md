# CodeLand API Documentation

## Overview

The CodeLand API manages and executes code on remote LXC runner containers.
It provides three runner lifecycles:

- **One-shot** (`/run`) — create, execute once, destroy.
- **Pooled** (`/new`) — reuse a runner from the worker's pre-warmed pool.
- **Persistent** (`/persistent`) — long-lived runners whose writable layer
  lives on shared NFS and can move between workers.

## Base URL

All endpoints live under `/api/v1`.

- Runner endpoints: `/api/v1/runner`
- Worker endpoints: `/api/v1/worker`

## Runner routes

### List Runners

- **GET `/api/v1/runner`**

  List the runners currently tracked by the primary worker.

  **Query Parameters:**
  - `detail` (boolean, optional): include detailed per-runner info (slow).

  **Response:**
  - `runners` (array): `{ name, domain, lastStatus }` per runner, plus
    `statusHistory` and LXC info when `detail` is set.

### Execute Code Once on a Throw-away Runner

- **POST `/api/v1/runner/run`**

  Execute a code snippet once on a fresh runner, then destroy it.

  **Request Body:**
  - `code` (string): the code to execute.

  **Query / Body Parameters:**
  - `time` (integer, optional): max execution time in seconds (default 60).
  - `memLimit` (string|int, optional): per-runner memory limit (e.g. `"512M"`).

  **Response:**
  - `res` (string): base64-encoded output.
  - `runner` (string): the runner that executed it.
  - `duration` (int): execution time in ms.

  **Sample Request:**
  ```json
  { "code": "console.log('Hello, CodeLand!')" }
  ```

  **Sample Response:**
  ```json
  {
    "runner": "crunner0-production-34586",
    "domain": "crunner0-production-34586.cl-worker.example",
    "duration": 167,
    "res": "SGVsbG8sIENvZGVMYW5kIQ=="
  }
  ```

### Execute on a New (Pooled) Runner

- **POST `/api/v1/runner/new`**

  Pop a runner from the pool and execute code on it. The runner is NOT
  destroyed (unlike `/run`); it returns to the pool.

  **Request Body:**
  - `code` (string): the code to execute.
  - `memLimit` (string|int, optional): override the runner memory limit.

  **Response:** same shape as `/run`.

### Create a Persistent Runner

- **POST `/api/v1/runner/persistent`**

  Create a long-lived runner whose writable layer is stored on shared NFS, so
  it survives restarts and can move between workers.

  **Request Body:**
  - `name` (string): the runner name (registry key).
  - `memLimit` (string|int, optional).
  - `worker` (string, optional): host to create on; defaults to the primary
    worker (`conf.ssh.host`).

  **Response:**
  - `runner` (string): the created runner name.
  - `domain` (string).
  - `worker` (string): the host it was created on.

### Run Code on a Persistent Runner

- **POST `/api/v1/runner/:runner/run`**

  Execute code on a named persistent runner, routed to whatever worker
  currently hosts it.

  **Request Body:**
  - `code` (string): the code to execute.

  **Query Parameters:**
  - `time` (integer, optional): max execution time in seconds.

### Stop a Persistent Runner

- **POST `/api/v1/runner/:runner/stop`**

  Stop a persistent runner and unmount it, **keeping** its NFS state so it can
  be restarted or migrated later.

  **Response:** `{ "res": "stopped" }`

### Migrate a Persistent Runner

- **POST `/api/v1/runner/:runner/migrate`**

  Move a persistent runner from its current worker to a target worker. Uses a
  redis lock so only one worker mounts the runner's NFS delta0 at a time.

  **Request Body:**
  - `worker` (string): the destination host.

  **Response:**
  - `runner` (string)
  - `worker` (string): the destination host.

### Execute on a Specific Runner

- **POST `/api/v1/runner/:runner`**

  Execute code on a named runner currently tracked by the primary worker.

  **Request Body:**
  - `code` (string): the code to execute.

### Get Runner Info by Name

- **GET `/api/v1/runner/:runner`**

  Return detail for a named runner tracked by the primary worker.

  **Response:** LXC `info()` fields plus `lastStatus`, `domain`,
  `statusHistory`.

### Delete a Runner

- **DELETE `/api/v1/runner/:runner`**

  Free/destroy a named runner tracked by the primary worker.

  **Response:** `{ "res": "success" }`

### Persistent Runner Registry

- **GET `/api/v1/runner/registry`

  List the persistent-runner registry (ORM-backed, Redis).

  **Response:**
  - `runners` (array): registry entries `{ name, worker, type, status,
    created_on, updated_on }`.

## Worker routes

### Worker Status

- **GET `/api/v1/worker`**

  Return the primary worker's status, oven state, and resource usage.

  **Response:**
  - `worker` (object): `{ location, user, userHasKey, startedAt, environment }`
  - `oven` (object): cooking state and available-runner count.
  - `memory` (object): host memory usage.
  - `df` (object): root filesystem usage.

### List Zombie Runners

- **GET `/api/v1/worker/zombies`**

  List untracked runner containers on the worker (leftovers from old
  instances).

### Clean Zombie Runners

- **DELETE `/api/v1/worker/zombies`**

  Trigger cleanup of untracked runner containers.

## Common Errors

| Code | Name | Meaning |
|------|------|---------|
| 400 | `runnerExecutionFailed` | Execution failed for unknown reasons |
| 404 | `runnerNotFound` | The named runner does not exist |
| 409 | `runnerBusy` | Runner is currently being migrated |
| 498 | `runnerTimedOut` | Execution exceeded the timeout |
| 502 | `workerBadGateway` | The worker proxy cannot reach the runner |
| 503 | `RunnerNotAvailable` | No fresh runners available |
