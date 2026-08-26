# Configuration

All bridges use the same top-level shape:

```yaml
mqtt:
  host: mqtt.example.net
  clientId: roborock-mqtt-bridge
instances:
  - id: unique-instance-name
    enabled: true
    topic: home/example
    # device-specific fields
```

- `mqtt` configures the single shared broker connection.
- `mqtt.clientId` may be empty; the bridge generates a UUID for the running process.
- HTTP settings are environment variables: `HOST` defaults to `0.0.0.0`, `PORT` defaults to `3000`, and `CORS_ORIGIN` defaults to `*`. `MAP_STORAGE_PATH` selects the directory for rendered map PNGs and defaults to `maps`. Dotenv loads `.env` from the working directory; Docker Compose environment values take precedence.
- Every `instances[].id` and `instances[].topic` must be unique.

## Roborock MQTT Bridge example

```yaml
mqtt:
  host: mqtt.example.net
  clientId: roborock-mqtt-bridge
  username: mqtt-user
  password: change-me
instances:
  - id: home
    topic: home/roborock/home
    email: robot-account@example.com
    password: change-me
    region: auto
    updateInterval: 30000
```

Do not commit passwords, API usernames, or generated `*.auth.json` files.
