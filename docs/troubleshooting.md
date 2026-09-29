# Troubleshooting

- Verify the container health endpoint: `curl http://localhost:${PORT:-3000}/health`.
- Subscribe to the configured topic tree: `mosquitto_sub -t '<topic>/#' -v`.
- Confirm broker credentials and network reachability from inside the container.
- Region discovery tries every configured Roborock cloud host and automatically retries after temporary DNS or network failures.
- Commands are intentionally non-retained and are cleared after handling. Re-publish a valid payload if needed.
- Never paste tokens, cloud sessions, or passwords into issues or logs.
