# CodeLand Runner Management System

**Author:** William Mantly (wmantly@gmail.com)

## Table of Contents

- [Introduction](#introduction)
- [Project Overview](#project-overview)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Introduction

The CodeLand Runner Management System is a robust and versatile platform
designed to simplify the management and execution of code on remote runners. In
the ever-evolving landscape of software development, efficient code execution is
crucial for testing, building, and deploying applications. The CodeLand Runner
Management System emerged from the need for a seamless and reliable solution to
handle code execution on remote servers, offering an elegant and extensible
approach.

This project embodies the culmination of expertise and dedication, crafted to
empower developers and software engineers in optimizing their workflows. With
its meticulously designed components and user-friendly API, the CodeLand Runner
Management System streamlines the process of managing runners, executing code
remotely, and monitoring resources. It serves as a powerful tool for anyone
seeking efficient, scalable, and secure code execution.

**Code Quality and Expertise:**

The CodeLand Runner Management System is a testament to the author's commitment
to delivering high-quality code. William Mantly (wmantly@gmail.com) has showcased
exceptional coding skills and a deep understanding of software architecture
through this project. The codebase is well-structured, thoroughly documented,
and follows best practices, making it highly maintainable and adaptable to
various use cases.

**Author William Mantly:**

William Mantly (wmantly@gmail.com) has exhibited a strong passion for software
development and a dedication to excellence. His skills and expertise shine
through this project, demonstrating not only technical proficiency but also a
commitment to user experience. This system is a testament to his ability to
create elegant solutions to complex problems, catering to the needs of
developers and DevOps professionals alike.

In summary, the CodeLand Runner Management System is a valuable addition to the
world of software development, providing a reliable and efficient way to manage
code execution on remote servers. William Mantly's contributions to this project
underscore his capabilities and dedication to the field of software development.

## Project Overview

### Components

- **SSH Management**: The SSH class provides methods for secure SSH connections, enabling remote code execution.

- **LXC Container Management**: The LXC class facilitates the creation, management, and interaction with Linux containers (LXC) for code execution.

- **CodeLand Worker**: The CodeLandWorker class is the heart of the system, responsible for creating and managing runners, monitoring memory usage, and executing code on runners.

- **API**: The API allows you to interact with the CodeLand Worker, providing endpoints to retrieve runner information, execute code, and manage runner resources.

## Getting Started

### Prerequisites

Before you begin, ensure you have met the following requirements:

- [Node.js](https://nodejs.org/) installed on your local machine.
- Configuration files and credentials for SSH and LXC as needed.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/codeland-ecosystem/manager.git
   cd manager
   ```

2. Install project dependencies:

   ```bash
   cd nodejs
   npm install
   ```

3. Configure `nodejs/conf/{development,production}.js` (SSH host, worker
   settings) and run:

   ```bash
   npm start
   ```

## Runner Types

The system manages three kinds of runners, all LXC containers cloned from a
`crunner0` base template (Debian 13):

- **One-shot** — created, executed once, then destroyed. Use `POST /runner/run`.
- **Pooled** — the worker keeps a pre-warmed pool of idle runners that are
  handed out on demand and returned when done. Use `POST /runner/new`.
- **Persistent** — long-lived runners whose writable layer lives on shared
  NFS, so they survive restarts and can migrate between workers. Use
  `POST /runner/persistent`.

## Features

- **Structured runs** — `POST /runner/run/structured` returns `stdout`,
  `stderr`, and `exit` separately, and accepts `language`, `stdin`, `files[]`,
  `timeout`, and `memLimit`.
- **Streaming runs** — `POST /runner/run/stream` streams output to the client
  as it is produced (chunked), so long jobs don't appear to hang.
- **Queue-on-empty** — when the oven is empty, requests wait (up to a `queue`
  timeout) for a runner instead of failing with an instant 503.
- **Published ports / preview** — the nginx proxy routes
  `PORT_<runner>.<domain>` to the runner's port, so a server started on a
  runner is reachable at a public URL. The UI has a one-click Preview button.
- **Files** — upload, list, and read files on a runner via
  `GET/POST /runner/:runner/files`.
- **Idle reclaim** — available runners idle longer than 15 minutes are
  destroyed automatically, keeping the oven full without manual intervention.
- **Registry routing** — `POST/GET/DELETE /runner/:runner` resolve the runner
  through the registry, so named runners (persistent or ephemeral) route to
  their current worker.
- **Metrics** — `GET /worker/metrics` exposes runner counts, oven state, and
  recent job history.
- **Oven controls** — pause/resume cooking, set the standby target, and drain
  idle runners via `POST /worker/oven/*`.
- **Least-memory placement** — persistent runners are auto-placed on the
  least-loaded worker when no `worker` is specified.

## API Documentation

Full endpoint reference is in [ops/docs/api.md](ops/docs/api.md). Quick
examples:

Execute a one-shot snippet:

```bash
curl -X POST /api/v1/runner/run \
  -H 'Content-Type: application/json' \
  -d '{"code": "console.log(\"hi\")"}'
```

Execute a structured run (stdout/stderr/exit, with language and stdin):

```bash
curl -X POST /api/v1/runner/run/structured \
  -H 'Content-Type: application/json' \
  -d '{"code": "print(input())", "language": "python", "stdin": "hello"}'
```

Create a persistent runner:

```bash
curl -X POST /api/v1/runner/persistent \
  -H 'Content-Type: application/json' \
  -d '{"name": "my-runner", "memLimit": "1G", "worker": "192.168.1.150"}'
```

Run code on it (routed to its current worker):

```bash
curl -X POST /api/v1/runner/my-runner/run \
  -H 'Content-Type: application/json' \
  -d '{"code": "console.log(\"hi\")"}'
```

Stop it (keeping its NFS state):

```bash
curl -X POST /api/v1/runner/my-runner/stop
```

Migrate it to another worker:

```bash
curl -X POST /api/v1/runner/my-runner/migrate \
  -H 'Content-Type: application/json' \
  -d '{"worker": "192.168.1.196"}'
```

List the persistent-runner registry:

```bash
curl /api/v1/runner/registry
```

## Multi-worker setup

Add additional worker hosts to `conf.workers` (the primary worker is always
`conf.ssh.host`). Each worker must mount the same NFS export at `/nfs/runners`
and have the runner host scripts installed (see the
[runner-setup](https://github.com/codeland-ecosystem/runner-setup) repo).

## Contributing

Contributions are welcome! If you'd like to contribute to the project, please
follow these guidelines:

1. Fork the repository.

2. Create a new branch for your feature or bug fix:

   ```bash
   git checkout -b feature/your-feature
   ```

3. Commit your changes and push them to your forked repository.

4. Submit a pull request to the main project repository.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE)
file for details.

## Acknowledgments

- [ChatGPT](https://chat.openai.com/) for contributing to the documentation.
