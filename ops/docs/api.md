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

### Reserve a Pooled Runner

- **POST `/api/v1/runner/reserve`**

  Pop a runner from the pool without running anything on it. Used to start a
  "keep this machine" session: get a runner name back, then drive it with
  `POST /api/v1/runner/:runner/run/structured` so every run in the session,
  including the first, gets structured stdout/stderr/exit instead of the raw
  base64 blob `/new` returns.

  **Response:**
  - `runner` (string)
  - `domain` (string)

### Create a Persistent Runner

- **POST `/api/v1/runner/persistent`**

  Create a long-lived runner whose writable layer is stored on shared NFS, so
  it survives restarts and can move between workers.

  **Request Body:**
  - `name` (string): the runner name (registry key).
  - `memLimit` (string|int, optional).
  - `worker` (string, optional): host to create on. If omitted, the runner is
    placed on the least-loaded worker automatically.

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

### Structured One-shot Run

- **POST `/api/v1/runner/run/structured`**

  Execute code on a fresh runner and return a structured result with stdout,
  stderr, and exit code separated. The runner is destroyed after execution.

  **Request Body:**
  - `code` (string, required): the code to execute.
  - `language` (string, optional): interpreter to use (e.g. `python`,
    `javascript`, `bash`). Resolves to a template that pipes the code through
    the right runtime.
  - `stdin` (string, optional): piped to the process as stdin.
  - `files` (array, optional): `[{ name, content }]` written to `/tmp` before
    the run.
  - `timeout` (integer, optional): max execution time in seconds.
  - `memLimit` (string|int, optional): per-runner memory limit.
  - `queue` (integer, optional): how long to wait (ms) for a runner if the
    oven is empty (default 15000).

  **Response:**
  - `runner` (string)
  - `domain` (string)
  - `duration` (int): execution time in ms.
  - `stdout` (string): decoded stdout.
  - `stderr` (string): decoded stderr.
  - `exit` (int): process exit code.

  **Sample Request:**
  ```json
  {
    "code": "print('hello')",
    "language": "python",
    "stdin": "world",
    "timeout": 30
  }
  ```

  **Sample Response:**
  ```json
  {
    "runner": "crunner0-production-5-t1zzml",
    "domain": "crunner0-production-5-t1zzml.cl-worker.example",
    "duration": 55,
    "stdout": "hello\n",
    "stderr": "",
    "exit": 0
  }
  ```

### Structured Run on a Named Runner

- **POST `/api/v1/runner/:runner/run/structured`**

  Structured counterpart to `POST /api/v1/runner/:runner/run`: same
  stdout/stderr/exit separation as `/run/structured`, but runs on an
  existing named runner (persistent, or a runner reserved via `/reserve`)
  instead of popping a fresh one, and does **not** destroy it after.

  **Request Body:** same as `/run/structured` (`code`, `language`, `stdin`,
  `files`, `timeout`) except `memLimit` and `queue`, which don't apply to an
  already-running runner.

  **Response:** same shape as `/run/structured`.

### Streaming Run

- **POST `/api/v1/runner/run/stream`**

  Execute code on a fresh runner and stream the output to the client as it is
  produced (chunked transfer encoding), so long-running jobs stream instead of
  appearing to hang. The runner is destroyed after execution.

  **Request Body:**
  - `code` (string, required): the code to execute.
  - `timeout` (integer, optional): max execution time in seconds.
  - `queue` (integer, optional): how long to wait (ms) for a runner if the
    oven is empty (default 15000).

  **Response:** a chunked stream of base64-encoded output lines.

### Streaming Run on a Persistent Runner

- **POST `/api/v1/runner/:runner/run/stream`**

  Stream code on a named persistent runner, routed to its current worker.

  **Request Body:**
  - `code` (string, required)
  - `timeout` (integer, optional)

  **Response:** a chunked stream of base64-encoded output lines.

### Streaming Run on Any Named Runner

- **POST `/api/v1/runner/:runner/stream`**

  Stream code on any named runner (persistent or ephemeral), routed to its
  current worker.

  **Request Body:**
  - `code` (string, required)
  - `timeout` (integer, optional)

  **Response:** a chunked stream of base64-encoded output lines.

### Execute on a Specific Runner

- **POST `/api/v1/runner/:runner`**

  Execute code on a named runner (persistent or ephemeral), routed through the
  registry to whatever worker currently hosts it.

  **Request Body:**
  - `code` (string): the code to execute.

  **Query Parameters:**
  - `time` (integer, optional): max execution time in seconds.

### Get Runner Info by Name

- **GET `/api/v1/runner/:runner`**

  Return detail for a named runner (persistent or ephemeral), routed through
  the registry to its current worker.

  **Response:** LXC `info()` fields plus `lastStatus`, `domain`,
  `statusHistory`.

### Delete a Runner

- **DELETE `/api/v1/runner/:runner`**

  Free/destroy a named runner (persistent or ephemeral), routed through the
  registry to its current worker.

  **Response:** `{ "res": "success" }`

### List Files on a Runner

- **GET `/api/v1/runner/:runner/files`**

  List files in a directory on the runner.

  **Query Parameters:**
  - `dir` (string, optional): directory to list (default `/tmp`).

  **Response:**
  - `runner` (string)
  - `dir` (string)
  - `files` (array): `{ name, type, size }` per entry (`type` is `dir` or
    `file`).

### Read a File on a Runner

- **GET `/api/v1/runner/:runner/files/content`**

  Read a file's contents from the runner.

  **Query Parameters:**
  - `path` (string, required): the file path.

  **Response:**
  - `runner` (string)
  - `path` (string)
  - `content` (string): the file contents.

### Write a File on a Runner

- **POST `/api/v1/runner/:runner/files`**

  Write a file on the runner.

  **Request Body:**
  - `path` (string, required): the destination path.
  - `content` (string, required): the file contents.

  **Response:** `{ "runner": "...", "path": "...", "res": "written" }`

### Persistent Runner Registry

- **GET `/api/v1/runner/registry`

  List the persistent-runner registry (ORM-backed, Redis).

  **Response:**
  - `runners` (array): registry entries `{ name, worker, type, status,
    created_on, updated_on }`.

## Auth routes

### Mint an API Token

- **POST `/api/v1/auth/token`**

  Create a new API token for the current user. Requires an authenticated
  request (send the `auth-token` header). Useful for scripts and a CLI.

  **Response:** `{ "token": "<uuid>" }`

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

### Worker Metrics

- **GET `/api/v1/worker/metrics`**

  Return runner counts, oven state, and recent job history.

  **Response:**
  - `worker` (string): the worker host.
  - `environment` (string)
  - `startedAt` (int): epoch ms.
  - `uptimeSeconds` (int)
  - `runners` (object): `{ total, available, inUse, cooking }`.
  - `oven` (object): cooking state and message.
  - `history` (array): recent jobs `{ when, runner, duration, ok, exit }`.

### Oven Controls

- **POST `/api/v1/worker/oven/pause`**

  Pause cooking new runners. **Response:** `{ "paused": true }`

- **POST `/api/v1/worker/oven/resume`**

  Resume cooking. **Response:** `{ "paused": false }`

- **POST `/api/v1/worker/oven/min`**

  Set the standby runner target (`minAvailableRunners`).

  **Request Body:**
  - `min` (int, required): the new standby target.

  **Response:** `{ "minAvailableRunners": 5 }`

- **POST `/api/v1/worker/oven/drain`**

  Stop cooking and free all idle (available) runners so the pool empties.
  In-use runners are left alone.

  **Response:** `{ "draining": true, "freed": 3 }`

- **POST `/api/v1/worker/oven/undrain`**

  Cancel a drain and resume normal cooking. **Response:**
  `{ "draining": false }`

## Common Errors

| Code | Name | Meaning |
|------|------|---------|
| 400 | `runnerExecutionFailed` | Execution failed for unknown reasons |
| 404 | `runnerNotFound` | The named runner does not exist |
| 409 | `runnerBusy` | Runner is currently being migrated |
| 498 | `runnerTimedOut` | Execution exceeded the timeout |
| 502 | `workerBadGateway` | The worker proxy cannot reach the runner |
| 503 | `RunnerNotAvailable` | No fresh runners available |
