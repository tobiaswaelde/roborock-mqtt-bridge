# Roborock MQTT Bridge

[![CI](https://img.shields.io/github/actions/workflow/status/tobiaswaelde/roborock-mqtt-bridge/ci.yml?style=for-the-badge&label=CI)](https://github.com/tobiaswaelde/roborock-mqtt-bridge/actions/workflows/ci.yml) [![Docs](https://img.shields.io/github/actions/workflow/status/tobiaswaelde/roborock-mqtt-bridge/docs.yml?style=for-the-badge&label=Docs)](https://github.com/tobiaswaelde/roborock-mqtt-bridge/actions/workflows/docs.yml) [![Deploy](https://img.shields.io/github/actions/workflow/status/tobiaswaelde/roborock-mqtt-bridge/deploy.yml?style=for-the-badge&label=Deploy)](https://github.com/tobiaswaelde/roborock-mqtt-bridge/actions/workflows/deploy.yml)

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-tobiaswaelde-FFDD00?style=for-the-badge&logo=buymeacoffee)](https://www.buymeacoffee.com/tobiaswaelde)

NestJS bridge between Roborock vacuum accounts and MQTT. Full documentation: [tobiaswaelde.github.io/roborock-mqtt-bridge](https://tobiaswaelde.github.io/roborock-mqtt-bridge/).

## Quick start

```bash
cp config/config.example.yml config/config.yml
# edit config/config.yml
docker compose up -d
```

Minimal configuration:

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

`mqtt.clientId` may be empty; the bridge then generates a UUID for the running process.

Rendered map images are written atomically to `MAP_STORAGE_PATH/<device-id>/<map-id>.png` (default: `maps`), replacing a prior image for the same map. Docker Compose mounts `./maps` at `/app/maps` so other host applications can read them.

Example command:

```bash
mosquitto_pub -h mqtt.example.net -t 'home/roborock/home/devices/ROBOROCK-DUID/command/suction_power' -m turbo
```

## Documentation

- [Documentation home](https://tobiaswaelde.github.io/roborock-mqtt-bridge/)
- [Configuration](https://tobiaswaelde.github.io/roborock-mqtt-bridge/configuration)
- [Authentication](https://tobiaswaelde.github.io/roborock-mqtt-bridge/authentication)
- [MQTT contract](https://tobiaswaelde.github.io/roborock-mqtt-bridge/mqtt)
- [Enum values](https://tobiaswaelde.github.io/roborock-mqtt-bridge/enum-values)
- [Docker deployment](https://tobiaswaelde.github.io/roborock-mqtt-bridge/deployment)
- [WLED MQTT Bridge for local lighting](https://tobiaswaelde.github.io/wled-mqtt-bridge/)
